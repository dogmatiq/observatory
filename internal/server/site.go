package server

import (
	"net/http"
	"slices"
	"time"

	"github.com/dogmatiq/observatory/internal/observe"
)

// siteViewOf returns the site view of the site whose key the API takes, which is
// [noSite] for the applications at no site, and the IDs of the clusters that it
// is made from. It returns false if the Observatory has never had a node at the
// site.
func siteViewOf(o *observe.Observer, r *observe.Recorder, now time.Time, key string) (observe.SiteView, []string, bool) {
	siteKey := siteKeyOf(key)

	var (
		site         *observe.Site
		applications [][]observe.ClusterView
		clusters     []string
		found        bool
	)

	for _, i := range o.Installations() {
		if i.Site == nil && siteKey != "" || i.Site != nil && i.Site.Key != siteKey {
			continue
		}

		found = true
		if i.Site != nil {
			site = i.Site
		}

		var views []observe.ClusterView
		for _, c := range o.ClustersOf(now, siteKey, i.Application.Key) {
			if view, ok := viewOf(o, r, now, c.ID); ok {
				views = append(views, view)
				clusters = append(clusters, c.ID)
			}
		}
		applications = append(applications, views)
	}

	if !found {
		return observe.SiteView{}, nil, false
	}

	return observe.SiteViewOf(site, applications), clusters, true
}

// serveSiteStream serves the stream of one site, which has the same events as
// the stream of a cluster, about a document of the site. See [Stream].
func serveSiteStream(w http.ResponseWriter, req *http.Request, o *observe.Observer, r *observe.Recorder) {
	key := req.PathValue("key")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming is not supported", http.StatusInternalServerError)
		return
	}

	now := time.Now()
	view, clusters, ok := siteViewOf(o, r, now, key)
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

	if err := s.send(now, siteDocumentOf(view), siteChartsOf(view, r.SiteSeries(clusters))); err != nil {
		return
	}
	for _, a := range view.Applications {
		if err := s.heartbeats(a.Members); err != nil {
			return
		}
	}
	if s.write("synced", struct{}{}) != nil {
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
			view, clusters, ok = siteViewOf(o, r, now, key)
			if !ok {
				return
			}
			err = s.send(now, siteDocumentOf(view), siteChartsOf(view, r.SiteSeries(clusters)))

		case beat, ok := <-heartbeats:
			if !ok || !slices.Contains(clusters, beat.Cluster) {
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

// siteChartsOf returns the points of the time series that the site view has,
// by the name of each series.
func siteChartsOf(view observe.SiteView, series observe.Series) map[string][]observe.TrailPoint {
	charts := map[string][]observe.TrailPoint{}

	if e := view.Events; e != nil && e.Rate != nil {
		charts["events"] = series.Events
	}
	if q := view.Queues; q != nil && q.Throughput != nil {
		charts["throughput"] = series.Throughput
	}

	return charts
}

// siteDocumentOf returns the state document of a site, as the stream describes
// it, from its view.
func siteDocumentOf(view observe.SiteView) map[string]any {
	doc := map[string]any{}

	if view.Site != nil {
		doc["site"] = map[string]any{
			"name": view.Site.Name,
			"key":  view.Site.Key,
		}
	}

	if e := view.Events; e != nil {
		events := map[string]any{}
		if e.Rate != nil {
			events["rate"] = rateDocument(e.Rate)
		}
		if e.Streams != nil {
			events["streams"] = streamsDocument(*e.Streams)
		}
		if e.Coverage != nil {
			events["coverage"] = *e.Coverage
		}
		doc["events"] = events
	}

	if q := view.Queues; q != nil {
		queues := map[string]any{
			"messages": q.Messages,
			"failing":  q.Failing,
		}
		if q.Queues != nil {
			queues["queues"] = *q.Queues
		}
		if q.Throughput != nil {
			queues["throughput"] = rateDocument(q.Throughput)
		}
		if q.Coverage != nil {
			queues["coverage"] = *q.Coverage
		}
		doc["queues"] = queues
	}

	applications := map[string]any{}
	for _, a := range view.Applications {
		app := map[string]any{"name": a.Application.Name}

		nodes := map[string]any{}
		for _, m := range a.Members {
			node := map[string]any{}
			if !m.Reporting {
				node["noSignal"] = true
			}
			nodes[m.ID] = node
		}
		app["nodes"] = nodes

		if a.Coverage != nil {
			app["coverage"] = *a.Coverage
		}

		if e := a.Events; e != nil {
			events := map[string]any{}
			if e.Rate != nil {
				events["rate"] = rateDocument(e.Rate)
			}
			if e.Streams != nil {
				events["streams"] = streamsDocument(*e.Streams)
			}
			app["events"] = events
		}

		if q := a.Queues; q != nil {
			queues := map[string]any{
				"messages": q.Messages,
				"failing":  q.Failing,
			}
			if q.Queues != nil {
				queues["queues"] = *q.Queues
			}
			app["queues"] = queues
		}

		applications[a.Application.Key] = app
	}
	doc["applications"] = applications

	return doc
}

// streamsDocument returns the part of a document that is some event streams.
func streamsDocument(s observe.StreamCount) map[string]any {
	return map[string]any{"count": s.Count, "events": s.Events}
}
