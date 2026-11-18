// Package server serves what the Observatory knows to the user interface, as
// JSON over HTTP.
//
// # The stream
//
// GET /api/clusters/{id}/watch serves a stream of server-sent events. It
// describes the cluster as a state document, and then says only what changes,
// so that the same data is never sent twice to a page that already has it. The
// document is the cluster's own data. How a page lays it out is the page's
// business.
//
// Each event has a name and one line of JSON as its data. There are four:
//
//   - changed: a merge patch, as RFC 7396 defines it, of the state document.
//     The fields of an object merge into the page's object. A null removes a
//     field, and anything else replaces whatever the page has, including an
//     array.
//   - recorded: {"series": string, "points": [[msBefore, value], ...]}. These
//     points come after those that the page has of the time series, oldest
//     first. Each is the value that the series has, and how many milliseconds
//     before the moment of sending it was recorded. The first event of a series
//     makes it, which may be with no points.
//   - heartbeat: {"node": string, "msBefore": number}. A heartbeat from the node
//     arrived that many milliseconds before the moment of sending. It is 0 for a
//     heartbeat that has just arrived.
//   - synced: {}. See below.
//
// Every connection starts with a burst: one changed event that is the whole
// document, a recorded event for each time series with its history, a heartbeat
// event for each of the recent heartbeats of each node, oldest first, and then
// synced. A page that reconnects therefore gets the whole state again, and
// replaces what it had with what the burst built.
//
// The document has these fields. Every collection is an object that is keyed by
// the ID of what it holds, so that a patch can add, change or remove one entry:
//
//   - "application": {"name", "key"}.
//   - "nodes": the members of the cluster, each {"workloads"}.
//   - "eventStreams": each event stream, {"length"}. It is absent if the nodes
//     don't report event streams.
//   - "queues": each queue, {"messages"}. It is absent if the nodes don't report
//     queues.
//   - "failing": the number of messages whose delivery is failing, with "queues".
//   - "rates": {"events", "removed"}, which are the events recorded and the
//     messages removed from the queues. A rate that isn't known yet is absent.
//   - "handlers": each handler, {"name", "kind", "disabled",
//     "minimizesConcurrency", "failing", "instances", "queued",
//     "unhandledEvents", "schedulesDeadlines", "bindings"}. A fact that the
//     nodes don't report, or that the handler doesn't have, is absent, and so
//     are the flags that are false. "bindings" is keyed by the ID of the event
//     stream or the queue, each {"instances"}. An integration or a projection
//     also has "nodes", keyed by the ID of the node, each {"rate"}, which is the
//     smoothed rate at which the node handles the handler's messages. It is
//     absent if the nodes don't report that.
//
// The time series are "events" (the events recorded per second), "queues" (the
// messages in the queues) and "handlers/<handler key>" (the events that the
// handler records or handles per second).
//
// A rate is in times per second, whatever it counts, and is rounded to three
// significant figures, so that a rate whose value only wavers is not sent
// again. The stream is not cached.
package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/dogmatiq/observatory/internal/observe"
)

// New returns a handler that serves the API that the user interface calls:
//
//   - GET /api/clusters lists the clusters, as an array of
//     [observe.ClusterSummary].
//   - GET /api/clusters/{id} gives the cluster view of one cluster, as an
//     [observe.ClusterView]. It fails with the status 404 if the Observatory
//     doesn't know the cluster.
//   - GET /api/clusters/{id}/watch keeps what a page draws of the cluster up to
//     date, as a stream of server-sent events that only say what changed. See
//     the package documentation. It fails with the status 404 if the Observatory doesn't know the
//     cluster.
//
// None is cached.
func New(o *observe.Observer, r *observe.Recorder) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/clusters", func(w http.ResponseWriter, _ *http.Request) {
		clusters := observe.Clusters(time.Now(), o.Nodes())
		if clusters == nil {
			clusters = []observe.ClusterSummary{}
		}
		respond(w, clusters)
	})

	mux.HandleFunc("GET /api/clusters/{id}", func(w http.ResponseWriter, req *http.Request) {
		view, ok := r.View(time.Now(), o.Nodes(), req.PathValue("id"))
		if !ok {
			http.NotFound(w, req)
			return
		}
		respond(w, view)
	})

	mux.HandleFunc("GET /api/clusters/{id}/watch", func(w http.ResponseWriter, req *http.Request) {
		serveStream(w, req, o, r)
	})

	return mux
}

// respond writes v as the body of a response.
func respond(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	// The status and headers are sent with the first write, so there is no
	// telling the client if the encoding fails halfway. It will see invalid JSON.
	_ = json.NewEncoder(w).Encode(v)
}
