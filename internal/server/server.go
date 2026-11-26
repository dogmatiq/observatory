// Package server serves what the Observatory knows to the user interface, as
// JSON over HTTP.
//
// # The stream
//
// GET /-/api/clusters/{id}/watch serves a stream of server-sent events. It
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
//   - "application": {"name", "key", "site"}. "site" is the name of the site,
//     and is absent if no node names a site.
//   - "cluster": {"reportsWorkloads"}, if the engine runs as a cluster. It is
//     absent for an engine that doesn't, whose ID is the ID in the address.
//     "reportsWorkloads" is true if any node says that it reports the
//     workloads that it owns, and is absent otherwise.
//   - "nodes": the members of the cluster, each {"workloads"}, which is the
//     number of workloads that the node owns, and is absent for a node that
//     doesn't report them or hasn't yet. For an engine that doesn't run as a
//     cluster, it holds only the engine, while the engine is reporting, and is
//     empty otherwise.
//   - "eventStreams": each event stream, {"length"}. It is absent if no node
//     supports the length of event streams.
//   - "oneStream": true if every node says that its engine appends every event
//     to one event stream, and absent otherwise.
//   - "queues": each queue, {"messages"}. It is absent if no node supports the
//     number of messages in queues.
//   - "oneQueue": true if every node says that its engine delivers every
//     message through one queue, and absent otherwise.
//   - "failing": the number of messages whose delivery is failing, present with
//     "queues" or "rates.throughput".
//   - "rates": {"events", "throughput"}, which are the events recorded and the
//     messages removed from the queues, each {"rate"} in times per second. A
//     rate that no node supports the metrics for is absent. A rate that the
//     nodes support and that isn't known yet is {}, which has no "rate", or
//     {"measuring": true} if it isn't known only because a node's count has been
//     observed for too short a time to give its rate, as for a few seconds after
//     the node joins the cluster or reconnects. The
//     throughput also has "of", which is what it counts: "handled", for the
//     commands and deadlines that handlers have handled, "removed", for the
//     messages that are removed from the queues, "commands handled", for only the
//     commands that handlers have handled, or "deadlines handled", for only the
//     deadlines.
//   - "handlers": each handler, {"name", "kind", "disabled",
//     "minimizesConcurrency", "failing", "instances", "queued",
//     "unhandledEvents", "schedulesDeadlines", "charted", "bindings"}. A fact
//     that the nodes don't report, or that the handler doesn't have, is absent,
//     and so are the flags that are false. "bindings" is keyed by the ID of the
//     event stream or the queue, each {"instances"}, and is absent if no node
//     supports the metric that it is derived from. A process's instances that are
//     in progress and bound to no queue are "unbound", a number, which is absent
//     when there are none. "charted" is "events" or "commands", the kind of
//     message that the handler's time series counts, and is absent if it has
//     none. An integration or a projection
//     also has "nodes", keyed by the ID of the node, each {"rate"}, which is the
//     smoothed rate at which the node handles the handler's messages. It is
//     absent if the nodes don't report that.
//
// A part of the document that no node supports is absent, and the page leaves
// out what it would show, which is different from a part that is present and
// has no value yet. A part appears or goes as the nodes' support does, even
// while a page is open.
//
// The time series are "events" (the events recorded per second), "throughput"
// (the messages removed from the queues per second, or handled) and
// "handlers/<handler key>" (the events that the handler records or handles per
// second, or, if "charted" is "commands", the commands that it handles).
//
// A rate is in times per second, whatever it counts, and is rounded to three
// significant figures, so that a rate whose value only wavers is not sent
// again. The stream is not cached.
package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"time"

	"github.com/dogmatiq/observatory/internal/observe"
)

// noSite is the key that the API uses for the site of an installation with no
// site, which is the nil UUID. Dogma doesn't allow the nil UUID as the key of an
// identity, so no site has it.
const noSite = "00000000-0000-0000-0000-000000000000"

// New returns a handler that serves the API that the user interface calls. Its
// paths begin with "/-/api/", because the Observatory's own paths all begin with
// "/-/", and the others are the names of sites and applications.
//
//   - GET /-/api/clusters lists the clusters that the Observatory sees each
//     installation through, as an array of [observe.ClusterSummary], sorted by
//     ID. With the query parameters "site" and "application", which are the keys
//     of a site and an application, it lists only those of that installation,
//     as [observe.Observer.ClustersOf] gives them. The array is empty if the
//     Observatory doesn't know the installation. It fails with the status 400
//     if only one of the two is given.
//   - GET /-/api/clusters/{id} gives the cluster view of one cluster, as an
//     [observe.ClusterView]. It fails with the status 404 if the Observatory
//     doesn't know the cluster.
//   - GET /-/api/clusters/{id}/watch keeps what a page draws of the cluster up to
//     date, as a stream of server-sent events that only say what changed. See
//     the package documentation. It fails with the status 404 if the Observatory doesn't know the
//     cluster.
//   - GET /-/api/installations lists the installations that the Observatory
//     knows, as an array of [observe.Installation], in the order that
//     [observe.Observer.Installations] gives. Each query parameter leaves out the
//     installations that don't match it: "site" is the key of the site,
//     "application" the key of the application, "site-name" the name of the site
//     and "application-name" the name of the application. A name matches only if
//     it is the same, byte for byte.
//
// The key of the site of an installation with no site is the nil UUID,
// 00000000-0000-0000-0000-000000000000, wherever the API takes a site's key. An
// installation with no site has no "site" in what the API gives.
//
// None is cached.
func New(o *observe.Observer, r *observe.Recorder) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /-/api/clusters", func(w http.ResponseWriter, req *http.Request) {
		q := req.URL.Query()
		var clusters []observe.ClusterSummary

		switch {
		case !q.Has("site") && !q.Has("application"):
			clusters = o.Clusters(time.Now())
		case q.Has("site") && q.Has("application"):
			clusters = o.ClustersOf(time.Now(), siteKeyOf(q.Get("site")), q.Get("application"))
		default:
			http.Error(w, `give both "site" and "application", or neither`, http.StatusBadRequest)
			return
		}

		if clusters == nil {
			clusters = []observe.ClusterSummary{}
		}
		respond(w, clusters)
	})

	mux.HandleFunc("GET /-/api/clusters/{id}", func(w http.ResponseWriter, req *http.Request) {
		view, ok := viewOf(o, r, time.Now(), req.PathValue("id"))
		if !ok {
			http.NotFound(w, req)
			return
		}
		respond(w, view)
	})

	mux.HandleFunc("GET /-/api/clusters/{id}/watch", func(w http.ResponseWriter, req *http.Request) {
		serveStream(w, req, o, r)
	})

	mux.HandleFunc("GET /-/api/installations", func(w http.ResponseWriter, req *http.Request) {
		q := req.URL.Query()

		installations := slices.DeleteFunc(o.Installations(), func(i observe.Installation) bool {
			return !matches(q, i)
		})

		respond(w, installations)
	})

	return mux
}

// matches returns true if the installation matches every query parameter of
// GET /-/api/installations. See [New].
func matches(q url.Values, i observe.Installation) bool {
	if i.Site == nil {
		// An installation with no site has no site's name to match.
		return !q.Has("site-name") &&
			matching(q, "site", noSite) &&
			matching(q, "application", i.Application.Key) &&
			matching(q, "application-name", i.Application.Name)
	}

	return matching(q, "site", i.Site.Key) &&
		matching(q, "site-name", i.Site.Name) &&
		matching(q, "application", i.Application.Key) &&
		matching(q, "application-name", i.Application.Name)
}

// matching returns true if the query has no parameter of the given name, or if
// the parameter is the given value.
func matching(q url.Values, name, value string) bool {
	return !q.Has(name) || q.Get(name) == value
}

// siteKeyOf returns the key of a site, as [observe.Observer.ClustersOf] takes
// it, from the key that the API uses, which is [noSite] for no site.
func siteKeyOf(key string) string {
	if key == noSite {
		return ""
	}
	return key
}

// viewOf returns the cluster view of a cluster, whether it has nodes now or only
// has had them, in which case it is down. It returns false for a cluster that the
// Observatory has never had a node of, which is unknown.
func viewOf(o *observe.Observer, r *observe.Recorder, now time.Time, id string) (observe.ClusterView, bool) {
	if view, ok := r.View(now, o.Nodes(), id); ok {
		return view, true
	}

	if rec, ok := o.Record(id); ok {
		return observe.DownView(rec), true
	}

	return observe.ClusterView{}, false
}

// respond writes v as the body of a response.
func respond(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	// The status and headers are sent with the first write, so there is no
	// telling the client if the encoding fails halfway. It will see invalid JSON.
	_ = json.NewEncoder(w).Encode(v)
}
