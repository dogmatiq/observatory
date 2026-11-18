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
	view, ok := r.View(now, o.Nodes(), id)
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
			view, ok = r.View(now, o.Nodes(), id)
			if !ok {
				// The Observatory has forgotten the cluster.
				return
			}
			err = s.update(now, view, r.Series(id))

		case beat, ok := <-heartbeats:
			if !ok || beat.Cluster != id {
				continue
			}
			err = s.write("heartbeat", heartbeat{Node: beat.Node})
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

	// A node's heartbeats are sent oldest first.
	for _, n := range view.Overview.Cluster.Nodes {
		for _, ms := range n.Heartbeats {
			if err := s.write("heartbeat", heartbeat{n.ID, ms}); err != nil {
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

	if view.Overview.Events != nil {
		charts["events"] = series.Events
	}
	if view.Overview.Queues != nil {
		charts["queues"] = series.Queues
	}
	for _, card := range view.Overview.Handlers {
		if card.History != nil {
			charts["handlers/"+card.Key] = series.Handlers[card.Key]
		}
	}

	return charts
}

// documentOf returns the state document of a cluster, as the stream describes
// it, from its view.
func documentOf(view observe.ClusterView) map[string]any {
	o := view.Overview

	doc := map[string]any{
		"application": map[string]any{
			"name": view.Application.Name,
			"key":  view.Application.Key,
		},
	}

	nodes := map[string]any{}
	for _, n := range o.Cluster.Nodes {
		nodes[n.ID] = map[string]any{"workloads": n.Workloads}
	}
	doc["nodes"] = nodes

	rates := map[string]any{}

	if e := o.Events; e != nil {
		streams := map[string]any{}
		for _, s := range e.Streams {
			streams[s.ID] = map[string]any{"length": s.Size}
		}
		doc["eventStreams"] = streams

		if e.Rate != nil {
			rates["events"] = significant(*e.Rate)
		}
	}

	if q := o.Queues; q != nil {
		queues := map[string]any{}
		for _, s := range q.Queues {
			queues[s.ID] = map[string]any{"messages": s.Size}
		}
		doc["queues"] = queues
		doc["failing"] = q.Failing

		if q.RemovedRate != nil {
			rates["removed"] = significant(*q.RemovedRate)
		}
	}

	doc["rates"] = rates

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

		bindings := map[string]any{}
		for _, b := range s.Bindings {
			bindings[b.ID] = map[string]any{"instances": b.Instances}
		}
		h["bindings"] = bindings
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
