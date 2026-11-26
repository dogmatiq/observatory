package server

import (
	"encoding/json"
	"fmt"
	"maps"
	"math"
	"net/http"
	"reflect"
	"slices"
	"strconv"
	"time"

	"github.com/dogmatiq/observatory/internal/observe"
)

// updateInterval is how often a stream looks for changes when no heartbeat has
// arrived, so that the charts move on.
const updateInterval = time.Second

// serveStream serves the stream of one cluster. See [Stream].
func serveStream(w http.ResponseWriter, req *http.Request, o *observe.Observer, r *observe.Recorder) {
	id := req.PathValue("id")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming is not supported", http.StatusInternalServerError)
		return
	}

	now := time.Now()
	view, ok := viewOf(o, r, now, id)
	if !ok {
		http.NotFound(w, req)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")

	heartbeats := o.WatchHeartbeats(req.Context())

	s := &stream{
		w:      w,
		flush:  flusher.Flush,
		charts: map[string]time.Time{},
	}

	if s.burst(now, view, r.Series(id)) != nil {
		return
	}

	ticker := time.NewTicker(updateInterval)
	defer ticker.Stop()

	for {
		var err error

		select {
		case <-req.Context().Done():
			return

		case <-ticker.C:
			now = time.Now()
			view, ok = viewOf(o, r, now, id)
			if !ok {
				// The Observatory has forgotten the cluster altogether.
				return
			}
			err = s.update(now, view, r.Series(id))

		case beat, ok := <-heartbeats:
			if !ok || beat.Cluster != id {
				continue
			}
			err = s.write("heartbeat", heartbeat{
				Node:   beat.Node,
				Expiry: float64(beat.Expiry) / float64(time.Millisecond),
			})
		}

		if err != nil {
			return
		}
	}
}

// stream is what one connection has been sent.
type stream struct {
	w     http.ResponseWriter
	flush func()

	// document is the state document that the page has, as JSON decoded into
	// maps, so that it can be compared with the next one.
	document any

	// charts is the time of the latest point that the page has of each time
	// series. The time is zero for a series with no points.
	charts map[string]time.Time
}

// heartbeat is the data of a heartbeat event.
type heartbeat struct {
	Node     string  `json:"node"`
	MsBefore float64 `json:"msBefore"`

	// Expiry is how long after it arrived the heartbeat expires, in
	// milliseconds, which is when the node stops sending a signal unless
	// another heartbeat arrives first. It is left out if the heartbeat gives no
	// way to calculate it.
	Expiry float64 `json:"expiry,omitempty"`
}

// write sends an event, and flushes it to the client.
func (s *stream) write(name string, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}

	// The JSON of a value has no newline, so it is one line of data.
	if _, err := fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", name, b); err != nil {
		return err
	}

	s.flush()
	return nil
}

// burst sends everything that a page needs to start, and the event that says so.
func (s *stream) burst(now time.Time, view observe.ClusterView, series observe.Series) error {
	if err := s.update(now, view, series); err != nil {
		return err
	}

	// A node's heartbeats are sent oldest first. The Observer keeps only the
	// expiry of a node's latest heartbeat, so each is sent with that one.
	for _, n := range membersOf(view.Overview) {
		for _, ms := range n.Heartbeats {
			if err := s.write("heartbeat", heartbeat{n.ID, ms, n.Expiry}); err != nil {
				return err
			}
		}
	}

	return s.write("synced", struct{}{})
}

// update sends what has changed since the page was last sent something, which
// is everything the first time.
func (s *stream) update(now time.Time, view observe.ClusterView, series observe.Series) error {
	document, err := decoded(documentOf(view))
	if err != nil {
		return err
	}

	if patch, changed := diff(s.document, document); changed {
		if err := s.write("changed", patch); err != nil {
			return err
		}
	}
	s.document = document

	charts := chartsOf(view, series)

	for _, name := range slices.Sorted(maps.Keys(charts)) {
		if err := s.points(now, name, charts[name]); err != nil {
			return err
		}
	}

	return nil
}

// decoded returns what the JSON of v decodes to as an untyped value, so that
// two values can be compared whatever Go types they were made of.
func decoded(v any) (any, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}

	var out any
	err = json.Unmarshal(b, &out)
	return out, err
}

// diff returns the merge patch, as RFC 7396 defines it, that turns the document
// old into the document new, and whether there is any difference.
//
// Both are decoded JSON. The patch for an object holds only the fields that
// differ, with null for a field that has gone. Anything else that differs is
// replaced whole, including an array.
func diff(old, new any) (any, bool) {
	newObject, newIsObject := new.(map[string]any)
	oldObject, oldIsObject := old.(map[string]any)

	if !newIsObject || !oldIsObject {
		return new, !reflect.DeepEqual(old, new)
	}

	patch := map[string]any{}

	for key, value := range newObject {
		oldValue, ok := oldObject[key]
		if !ok {
			patch[key] = value
			continue
		}
		if p, changed := diff(oldValue, value); changed {
			patch[key] = p
		}
	}

	for key := range oldObject {
		if _, ok := newObject[key]; !ok {
			patch[key] = nil
		}
	}

	return patch, len(patch) > 0
}

// points sends the points of a time series that the page doesn't have yet. It
// sends an event for a series that is new, even if there are none.
func (s *stream) points(now time.Time, name string, points []observe.TrailPoint) error {
	latest, exists := s.charts[name]

	fresh := [][2]float64{}
	for _, p := range points {
		if p.At.After(latest) {
			fresh = append(fresh, [2]float64{
				float64(now.Sub(p.At)) / float64(time.Millisecond),
				significant(p.Value),
			})
			latest = p.At
		}
	}

	if exists && len(fresh) == 0 {
		return nil
	}

	s.charts[name] = latest

	return s.write("recorded", struct {
		Series string       `json:"series"`
		Points [][2]float64 `json:"points"`
	}{name, fresh})
}

// significant rounds a number to three significant figures.
func significant(v float64) float64 {
	if v == 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return v
	}

	// Formatting the number rounds it, and parsing the result gives the number
	// with the shortest decimal form, which is the shortest to send.
	r, _ := strconv.ParseFloat(strconv.FormatFloat(v, 'g', 3, 64), 64)
	return r
}

// chartsOf returns the points of the time series that the view has, by the name
// of each series.
func chartsOf(view observe.ClusterView, series observe.Series) map[string][]observe.TrailPoint {
	charts := map[string][]observe.TrailPoint{}

	if e := view.Overview.Events; e != nil && e.History != nil {
		charts["events"] = series.Events
	}
	if q := view.Overview.Queues; q != nil && q.History != nil {
		charts["throughput"] = series.Throughput
	}
	for _, card := range view.Overview.Handlers {
		if card.History != nil {
			charts["handlers/"+card.Key] = series.Handlers[card.Key]
		}
	}

	return charts
}

// membersOf returns the nodes that the document lists: the members of a
// cluster, or the engine, while it is reporting, if it doesn't run as a cluster.
func membersOf(o observe.Overview) []observe.Member {
	switch {
	case o.Cluster != nil:
		return o.Cluster.Nodes
	case o.Engine != nil && o.Engine.Node != nil:
		return []observe.Member{*o.Engine.Node}
	default:
		return nil
	}
}

// documentOf returns the state document of a cluster, as the stream describes
// it, from its view.
func documentOf(view observe.ClusterView) map[string]any {
	o := view.Overview

	application := map[string]any{
		"name": view.Application.Name,
		"key":  view.Application.Key,
	}
	if view.Site != nil {
		application["site"] = view.Site.Name
	}

	doc := map[string]any{"application": application}
	if view.Down {
		doc["down"] = true
	}
	if view.Site != nil {
		doc["site"] = map[string]any{
			"name": view.Site.Name,
			"key":  view.Site.Key,
		}
	}

	// The software that the nodes run, which the title bar's trail gives. A part
	// that the nodes don't give, or that they don't agree on, is left out.
	sw := o.Software
	software := map[string]any{}
	if sw.EngineName != "" {
		software["engineName"] = sw.EngineName
	}
	if r := sw.EngineVersions; r != nil {
		software["engineVersions"] = map[string]any{
			"lowest":  r.Lowest,
			"highest": r.Highest,
		}
	}
	if sw.ApplicationVersion != "" {
		software["applicationVersion"] = sw.ApplicationVersion
	}
	if sw.ApplicationVersionsDiffer {
		software["applicationVersionsDiffer"] = true
	}
	doc["software"] = software

	if c := o.Cluster; c != nil {
		cluster := map[string]any{}
		if c.ReportsWorkloads {
			cluster["reportsWorkloads"] = true
		}
		doc["cluster"] = cluster
	}

	nodes := map[string]any{}
	for _, n := range membersOf(o) {
		// A node that doesn't report its workloads has none.
		node := map[string]any{}
		if n.Workloads != nil {
			node["workloads"] = *n.Workloads
		}
		nodes[n.ID] = node
	}
	doc["nodes"] = nodes

	rates := map[string]any{}

	// A rate that the nodes support is present, and has a "rate" once it is known.
	rateOf := func(r *observe.Rate) map[string]any {
		if r.PerSecond == nil {
			return map[string]any{}
		}
		return map[string]any{"rate": significant(*r.PerSecond)}
	}

	// The coverage of the tiles that only some of the nodes report the metrics
	// of, such as while a deploy is under way.
	coverage := map[string]any{}

	if e := o.Events; e != nil {
		if e.Coverage != nil {
			coverage["events"] = *e.Coverage
		}
		if e.OneStream {
			doc["oneStream"] = true
		}
		if e.Streams != nil {
			streams := map[string]any{}
			for _, s := range e.Streams {
				streams[s.ID] = map[string]any{"length": s.Size}
			}
			doc["eventStreams"] = streams
		}

		if e.Rate != nil {
			rates["events"] = rateOf(e.Rate)
		}
	}

	if q := o.Queues; q != nil {
		if q.Coverage != nil {
			coverage["queues"] = *q.Coverage
		}
		if q.OneQueue {
			doc["oneQueue"] = true
		}
		if q.Queues != nil {
			queues := map[string]any{}
			for _, s := range q.Queues {
				queues[s.ID] = map[string]any{"messages": s.Size}
			}
			doc["queues"] = queues
		}
		doc["failing"] = q.Failing

		if q.Throughput != nil {
			throughput := rateOf(q.Throughput)
			throughput["of"] = q.Counted
			rates["throughput"] = throughput
		}
	}

	doc["rates"] = rates
	if len(coverage) > 0 {
		doc["coverage"] = coverage
	}

	handlers := map[string]any{}
	for _, card := range o.Handlers {
		s := card.Summary

		h := map[string]any{
			"name":    card.Name,
			"kind":    card.Kind,
			"failing": s.Failing,
		}
		if card.Disabled {
			h["disabled"] = true
		}
		if card.MinimizesConcurrency {
			h["minimizesConcurrency"] = true
		}
		if s.Instances != nil {
			h["instances"] = *s.Instances
		}
		if s.QueuedMessages != nil {
			h["queued"] = *s.QueuedMessages
		}
		if s.UnhandledEvents != nil {
			h["unhandledEvents"] = *s.UnhandledEvents
		}
		if s.SchedulesDeadlines {
			h["schedulesDeadlines"] = true
		}
		if card.Charted != "" {
			h["charted"] = card.Charted
		}
		if card.Coverage != nil {
			h["coverage"] = *card.Coverage
		}

		if s.Bindings != nil {
			bindings := map[string]any{}
			for _, b := range s.Bindings {
				bindings[b.ID] = map[string]any{"instances": b.Instances}
			}
			h["bindings"] = bindings
		}
		if s.Unbound > 0 {
			h["unbound"] = s.Unbound
		}

		if card.Nodes != nil {
			nodes := map[string]any{}
			for _, n := range card.Nodes {
				nodes[n.Node] = map[string]any{"rate": significant(n.Rate)}
			}
			h["nodes"] = nodes
		}

		handlers[card.Key] = h
	}
	doc["handlers"] = handlers

	return doc
}
