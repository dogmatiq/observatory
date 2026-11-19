package observe

import (
	"cmp"
	"math"
	"slices"
	"sync"
	"time"

	"github.com/dogmatiq/protobuf/configpb"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/protobuf/proto"
)

// chartSpan is how much history the charts of an [Overview] hold. The sparklines
// show the last minute, and the extra seconds let the page scroll them without a
// gap at the left-hand edge.
const chartSpan = 70 * time.Second

// ClusterSummary is one cluster in the list of the clusters that the Observatory
// knows.
type ClusterSummary struct {
	// ID is the ID of the cluster, as a UUID.
	ID string `json:"id"`

	Application Application `json:"application"`

	// Site is the name of the site that the cluster is deployed to. It is empty
	// if the cluster's nodes name no site.
	Site string `json:"site,omitempty"`
}

// Application is the application that a cluster runs.
type Application struct {
	// Name is the name of the application's identity.
	Name string `json:"name"`

	// Key is the key of the application's identity, as a UUID.
	Key string `json:"key"`
}

// Clusters returns the clusters that the given nodes belong to, at the time
// now, sorted by the ID of the cluster. The nodes are those that
// [Observer.Nodes] returns.
func Clusters(now time.Time, nodes []Node) []ClusterSummary {
	var out []ClusterSummary
	for id, members := range clustersOf(nodes) {
		app, _ := applicationOf(now, members)
		out = append(out, ClusterSummary{ID: id, Application: app, Site: siteOf(members)})
	}

	slices.SortFunc(out, func(a, b ClusterSummary) int {
		return cmp.Compare(a.ID, b.ID)
	})

	return out
}

// clustersOf groups nodes by the ID of their cluster.
func clustersOf(nodes []Node) map[string][]Node {
	clusters := map[string][]Node{}
	for _, n := range nodes {
		id := n.Preamble.GetClusterId().AsString()
		clusters[id] = append(clusters[id], n)
	}
	return clusters
}

// applicationOf returns the application that a cluster's nodes run, at the
// time now, and the description of it that the cluster view reads handlers
// from.
//
// The nodes of a cluster may run different versions of an application, such as
// during a deploy. The application is the one that the nodes that [Combine]
// reads describe, and the first of them to begin its call to the metrics API
// decides, because the keys of handlers in the samples are those of that
// node's application. Without such a node, it is the application of a node
// that is reporting, or of any node, whichever has the lowest ID.
func applicationOf(now time.Time, nodes []Node) (Application, *configpb.Application) {
	var config *configpb.Application

	if readers := contributors(now, nodes); len(readers) > 0 {
		config = readers[0].Metrics.Preamble.GetApplication()
	} else {
		sorted := slices.Clone(nodes)
		slices.SortFunc(sorted, func(a, b Node) int {
			if a, b := a.Reporting(now), b.Reporting(now); a != b {
				if a {
					return -1
				}
				return 1
			}
			return cmp.Compare(
				a.Preamble.GetNodeId().AsString(),
				b.Preamble.GetNodeId().AsString(),
			)
		})
		if len(sorted) > 0 {
			config = sorted[0].Preamble.GetApplication()
		}
	}

	identity := config.GetIdentity()
	return Application{
		Name: identity.GetName(),
		Key:  identity.GetKey().AsString(),
	}, config
}

// siteOf returns the name of the site that a cluster's nodes name, or "" if none
// does. If they name different sites, it is the name of the node with the lowest
// ID that names one.
func siteOf(nodes []Node) string {
	site, from := "", ""
	for _, n := range nodes {
		name := n.Preamble.GetSite().GetName()
		id := n.Preamble.GetNodeId().AsString()
		if name != "" && (from == "" || id < from) {
			site, from = name, id
		}
	}
	return site
}

// ClusterView is everything that the cluster view of one cluster shows.
type ClusterView struct {
	Application Application `json:"application"`
	Overview    Overview    `json:"overview"`
}

// Overview is what the cluster view's three tiles and its handler cards show.
type Overview struct {
	// Events is the events tile. It is nil if no node of the cluster supports the
	// length of event streams or the metrics that the rate of events is derived
	// from.
	Events *EventsTile `json:"events,omitempty"`

	// Queues is the queues tile. It is nil if no node of the cluster supports the
	// number of messages in queues or the metrics that the rate of their removal
	// is derived from.
	Queues *QueuesTile `json:"queues,omitempty"`

	Cluster ClusterTile `json:"cluster"`

	// Handlers is a card for each handler of the application, aggregates first,
	// then processes, integrations and projections, each by name.
	Handlers []HandlerCard `json:"handlers"`
}

// A part of a tile that no node of the cluster supports the metrics for is
// nil, and the tile leaves it out. A part that the nodes do support, and that
// has no value yet, is present and empty.

// EventsTile is the events tile.
type EventsTile struct {
	// Rate is how many events per second the cluster records. It is nil if no
	// node supports the metrics that it is derived from.
	Rate *Rate `json:"rate,omitempty"`

	// Streams is the length of each of the cluster's event streams. It is nil if
	// no node supports the length of event streams.
	Streams []Spread `json:"streams"`

	// History is how Rate changed over the last minute. It is nil if Rate is.
	History *Chart `json:"history,omitempty"`
}

// QueuesTile is the queues tile.
type QueuesTile struct {
	// Queues is the number of messages that wait in each of the cluster's queues,
	// commands and deadlines together. It is nil if no node supports the number
	// of messages in queues.
	Queues []Spread `json:"queues"`

	// Failing is the number of messages whose latest delivery attempt failed. It
	// is zero if no node reports it.
	Failing uint64 `json:"failing"`

	// Throughput is how many messages per second the queues get through. It is
	// the commands and deadlines that handlers have handled successfully, if nodes
	// report both, because that is what was done, and is complete. Otherwise it is
	// the commands and deadlines that are removed from the queues, which are
	// complete too, but include those that are removed without being handled, such
	// as the deadlines of a process that has ended. If nodes report neither of
	// those, it is the commands or the deadlines that handlers have handled, if
	// nodes report one of them, which is only a part of the messages, and
	// Counted says which. It is nil if nodes report none of them.
	Throughput *Rate `json:"throughput,omitempty"`

	// Counted is what Throughput counts, which is "handled", "removed", "commands
	// handled" or "deadlines handled". It is empty if Throughput is nil.
	Counted string `json:"counted,omitempty"`

	// History is how Throughput changed over the last minute. It is nil if
	// Throughput is.
	History *Chart `json:"history,omitempty"`
}

// Rate is how often something happens, which the Observatory derives from the
// running totals that the nodes report.
type Rate struct {
	// PerSecond is the number of times per second. It is nil until the
	// Observatory can give it.
	PerSecond *float64 `json:"perSecond,omitempty"`
}

// Spread is one part of a quantity that is spread over several things, such as
// the messages in one of several queues.
type Spread struct {
	// ID is the ID of the thing, as a UUID.
	ID string `json:"id"`

	Size uint64 `json:"size"`
}

// ClusterTile is the cluster tile.
type ClusterTile struct {
	// Nodes is the cluster's members, sorted by node ID.
	Nodes []Member `json:"nodes"`
}

// Member is one of the nodes that make up a cluster. See [Members].
type Member struct {
	// ID is the ID of the node, as a UUID.
	ID string `json:"id"`

	// Workloads is the number of workloads that the node says it owns. It is zero
	// for a node that has not reported them.
	Workloads int `json:"workloads"`

	// Heartbeats is when the node's heartbeats arrived in the last ten minutes,
	// in milliseconds before the moment that the view was made, oldest first. It
	// is empty for a node that isn't connected.
	Heartbeats []float64 `json:"heartbeats"`
}

// Chart is the history of a number, to be drawn as a sparkline.
type Chart struct {
	// End is the time at the right-hand edge of the chart, on the same scale as
	// the points. It is always zero: the moment that the chart was made.
	End float64 `json:"end"`

	// Points is the values of the number, oldest first.
	Points []ChartPoint `json:"points"`
}

// ChartPoint is the value of a number at a moment.
type ChartPoint struct {
	// At is the moment, in milliseconds before the end of the chart. It is
	// never positive.
	At float64 `json:"at"`

	Value float64 `json:"value"`
}

// HandlerCard is the card of one handler.
type HandlerCard struct {
	// Key is the key of the handler's identity, as a UUID.
	Key string `json:"key"`

	Name string `json:"name"`

	// Kind is "aggregate", "process", "integration" or "projection".
	Kind string `json:"kind"`

	Disabled bool `json:"disabled,omitempty"`

	// MinimizesConcurrency is true if the handler asks the engine to minimize
	// concurrency.
	MinimizesConcurrency bool `json:"minimizesConcurrency,omitempty"`

	Summary HandlerSummary `json:"summary"`

	// Nodes is how fast each node handles the messages of the handler, if it is
	// an integration, which handles commands, or a projection, which handles
	// events. It is nil for other handlers, and for one whose messages the nodes
	// don't report the handling of. It is empty if no node has handled any. The
	// rates are smoothed. See [NodeRate].
	Nodes []NodeRate `json:"nodes,omitempty"`

	// History is how the number of messages per second that the handler works
	// with changed, chosen by the routes that the handler's description gives it,
	// which don't change while it runs: the events that an aggregate records, the
	// events that a process or a projection handles, and, for an integration, the
	// events that it records if it produces any type of event, or else the commands
	// that it handles. It is nil for a handler that no node reports that number
	// for.
	History *Chart `json:"history,omitempty"`

	// Charted is the kind of message that History counts, "events" or
	// "commands". It is empty if there is no History.
	Charted string `json:"charted,omitempty"`
}

// NodeRate is how fast one node handles the messages of a handler.
type NodeRate struct {
	// Node is the ID of the node, as a UUID.
	Node string `json:"node"`

	// Rate is the number of messages per second that the node handles, smoothed
	// with an exponentially weighted average whose half-life is
	// [nodeRateHalfLife], so that it follows the work of the node and not the
	// moment.
	Rate float64 `json:"rate"`
}

// HandlerSummary is the facts that a handler's card shows.
//
// A field that is a pointer is nil if the handler has no such fact, if no node
// supports the metric that it is derived from, or while the cluster has not
// reported it.
type HandlerSummary struct {
	// Failing is the number of messages for the handler whose latest delivery
	// attempt failed.
	Failing uint64 `json:"failing"`

	// Instances is the number of an aggregate's instances. It is nil for other
	// handlers.
	Instances *uint64 `json:"instances,omitempty"`

	// QueuedMessages is the number of commands, for an aggregate or an
	// integration, or deadlines, for a process, that wait to be delivered to the
	// handler.
	QueuedMessages *uint64 `json:"queuedMessages,omitempty"`

	// UnhandledEvents is the number of events that a process or a projection has
	// yet to handle.
	UnhandledEvents *uint64 `json:"unhandledEvents,omitempty"`

	// SchedulesDeadlines is true for a process that schedules deadlines.
	SchedulesDeadlines bool `json:"schedulesDeadlines,omitempty"`

	// Bindings is how the instances of an aggregate are spread over the event
	// streams, or those of a process over the queues of its deadlines. It is nil
	// for another kind of handler, and if no node supports the metric that it is
	// derived from. It is empty if the handler has no instances.
	Bindings []Binding `json:"bindings"`

	// Unbound is the number of a process's instances that are in progress and
	// bound to no queue. They are not in Bindings.
	Unbound uint64 `json:"unbound,omitempty"`
}

// Binding is the instances of a handler that are bound to one event stream or
// queue.
type Binding struct {
	// ID is the ID of the event stream or queue, as a UUID.
	ID string `json:"id"`

	Instances uint64 `json:"instances"`
}

// summedRate is the sum of the rates of several samples, such as the rates at
// which each handler records events.
//
// It is unknown if no sample has been added, or if any sample that was added has
// no rate yet.
type summedRate struct {
	perSecond float64
	samples   int
	unknown   bool
}

func (r *summedRate) add(s ClusterSample) {
	r.samples++
	if s.PerSecond == nil {
		r.unknown = true
		return
	}
	r.perSecond += *s.PerSecond
}

// rate returns the sum of the rates in times per second, or nil if it is
// unknown.
func (r summedRate) rate() *float64 {
	if r.samples == 0 || r.unknown {
		return nil
	}
	v := r.perSecond
	return &v
}

// handlerFigures is what the samples say about one handler.
type handlerFigures struct {
	commandsPending, deadlinesPending, eventsPending *uint64
	failing                                          uint64
	eventsRecorded, eventsHandled, commandsHandled   summedRate

	// bindings is the number of instances bound to each event stream, for an
	// aggregate, or queue, for a process, by ID.
	bindings map[string]uint64

	// unbound is the number of a process's instances that are in progress and
	// bound to no queue.
	unbound uint64
}

// figures is what the combined samples of a cluster say, in the form that an
// [Overview] is made from.
type figures struct {
	streams        map[string]uint64
	pendingInQueue map[string]uint64
	failing        uint64
	eventsRecorded summedRate
	removed        summedRate
	handled        summedRate
	handlers       map[string]*handlerFigures
}

// figuresOf sorts the combined samples of a cluster by what they measure.
func figuresOf(samples []ClusterSample) figures {
	f := figures{
		streams:        map[string]uint64{},
		pendingInQueue: map[string]uint64{},
		handlers:       map[string]*handlerFigures{},
	}

	handler := func(key *uuidpb.UUID) *handlerFigures {
		id := key.AsString()
		h, ok := f.handlers[id]
		if !ok {
			h = &handlerFigures{bindings: map[string]uint64{}}
			f.handlers[id] = h
		}
		return h
	}

	for _, s := range samples {
		v := valueOf(s.Message)

		switch m := s.Message.(type) {
		case *metricsgrpc.EventStreamLength:
			f.streams[m.GetEventStreamId().AsString()] = v

		case *metricsgrpc.QueueCommandsPending:
			f.pendingInQueue[m.GetQueueId().AsString()] += v
		case *metricsgrpc.QueueDeadlinesPending:
			f.pendingInQueue[m.GetQueueId().AsString()] += v
		case *metricsgrpc.QueueCommandsFailing:
			f.failing += v
		case *metricsgrpc.QueueDeadlinesFailing:
			f.failing += v
		case *metricsgrpc.QueueCommandsRemoved:
			f.removed.add(s)
		case *metricsgrpc.QueueDeadlinesRemoved:
			f.removed.add(s)

		case *metricsgrpc.HandlerCommandsPending:
			handler(m.GetHandlerKey()).commandsPending = &v
		case *metricsgrpc.HandlerDeadlinesPending:
			handler(m.GetHandlerKey()).deadlinesPending = &v
		case *metricsgrpc.HandlerEventsPending:
			handler(m.GetHandlerKey()).eventsPending = &v
		case *metricsgrpc.HandlerCommandsFailing:
			handler(m.GetHandlerKey()).failing += v
		case *metricsgrpc.HandlerDeadlinesFailing:
			handler(m.GetHandlerKey()).failing += v
		case *metricsgrpc.HandlerCommandsHandled:
			handler(m.GetHandlerKey()).commandsHandled.add(s)
			f.handled.add(s)
		case *metricsgrpc.HandlerDeadlinesHandled:
			f.handled.add(s)
		case *metricsgrpc.HandlerEventsRecorded:
			handler(m.GetHandlerKey()).eventsRecorded.add(s)
			f.eventsRecorded.add(s)
		case *metricsgrpc.HandlerEventsHandled:
			handler(m.GetHandlerKey()).eventsHandled.add(s)

		case *metricsgrpc.AggregateInstanceEventStreamBindings:
			handler(m.GetHandlerKey()).bindings[m.GetEventStreamId().AsString()] += v
		case *metricsgrpc.ProcessInstanceQueueBindings:
			if m.HasQueueId() {
				handler(m.GetHandlerKey()).bindings[m.GetQueueId().AsString()] += v
			} else {
				handler(m.GetHandlerKey()).unbound += v
			}
		}
	}

	return f
}

// metric returns the full name of the message that holds a metric.
func metric(m proto.Message) string {
	return string(proto.MessageName(m))
}

// kinds is how a handler type is named in an [Overview].
var kinds = map[configpb.HandlerType]string{
	configpb.HandlerType_HANDLER_TYPE_AGGREGATE:   "aggregate",
	configpb.HandlerType_HANDLER_TYPE_PROCESS:     "process",
	configpb.HandlerType_HANDLER_TYPE_INTEGRATION: "integration",
	configpb.HandlerType_HANDLER_TYPE_PROJECTION:  "projection",
}

// overviewOf returns the overview of a cluster at the time now, with charts
// that have no points, together with the latest value of each chart's number.
func overviewOf(now time.Time, nodes []Node) (Application, Overview, chartValues) {
	app, config := applicationOf(now, nodes)
	supported := Supported(now, nodes)
	f := figuresOf(Combine(now, nodes))

	var (
		o Overview
		r = chartValues{handlers: map[string]*float64{}}
	)

	recorded := supported[metric(new(metricsgrpc.HandlerEventsRecorded))]
	streamed := supported[metric(new(metricsgrpc.EventStreamLength))]
	if recorded || streamed {
		o.Events = &EventsTile{}

		if streamed {
			o.Events.Streams = spreadOf(f.streams)
		}
		if recorded {
			o.Events.Rate = &Rate{f.eventsRecorded.rate()}
			o.Events.History = &Chart{Points: []ChartPoint{}}
			r.events = o.Events.Rate.PerSecond
		}
	}

	pending := supported[metric(new(metricsgrpc.QueueCommandsPending))] ||
		supported[metric(new(metricsgrpc.QueueDeadlinesPending))]
	removed := supported[metric(new(metricsgrpc.QueueCommandsRemoved))] ||
		supported[metric(new(metricsgrpc.QueueDeadlinesRemoved))]
	handledCommands := supported[metric(new(metricsgrpc.HandlerCommandsHandled))]
	handledDeadlines := supported[metric(new(metricsgrpc.HandlerDeadlinesHandled))]
	if pending || removed || handledCommands || handledDeadlines {
		o.Queues = &QueuesTile{Failing: f.failing}

		if pending {
			o.Queues.Queues = spreadOf(f.pendingInQueue)
		}

		// The messages that have been handled are the throughput, if all kinds of
		// them are reported, and, if not, those that are removed from the queues
		// are, and, if they are not either, the kind of message that is reported.
		switch {
		case handledCommands && handledDeadlines:
			o.Queues.Throughput = &Rate{f.handled.rate()}
			o.Queues.Counted = "handled"
		case removed:
			o.Queues.Throughput = &Rate{f.removed.rate()}
			o.Queues.Counted = "removed"
		case handledCommands:
			o.Queues.Throughput = &Rate{f.handled.rate()}
			o.Queues.Counted = "commands handled"
		case handledDeadlines:
			o.Queues.Throughput = &Rate{f.handled.rate()}
			o.Queues.Counted = "deadlines handled"
		}
		if o.Queues.Throughput != nil {
			o.Queues.History = &Chart{Points: []ChartPoint{}}
			r.throughput = o.Queues.Throughput.PerSecond
		}
	}

	o.Cluster.Nodes = membersOf(now, nodes)
	o.Handlers = handlerCards(config, supported, f, r.handlers)

	return app, o, r
}

// chartValues is the latest value of each number that a chart of an [Overview]
// shows the history of, at the moment that the overview was made.
type chartValues struct {
	// events is the events per second, or nil if it is unknown.
	events *float64

	// throughput is the messages per second that are removed from the queues, or
	// handled, or nil if it is unknown.
	throughput *float64

	// handlers is the events recorded or handled per second, for each handler
	// that has a chart, by key. It is nil for a handler whose rate is unknown.
	handlers map[string]*float64
}

// spreadOf returns the parts of a spread, sorted by ID.
func spreadOf(sizes map[string]uint64) []Spread {
	out := make([]Spread, 0, len(sizes))
	for id, size := range sizes {
		out = append(out, Spread{id, size})
	}
	slices.SortFunc(out, func(a, b Spread) int { return cmp.Compare(a.ID, b.ID) })
	return out
}

// membersOf returns the members of a cluster, sorted by node ID.
func membersOf(now time.Time, nodes []Node) []Member {
	byID := map[string]Node{}
	for _, n := range nodes {
		byID[n.Preamble.GetNodeId().AsString()] = n
	}

	out := []Member{}
	for _, id := range Members(now, nodes) {
		key := id.AsString()
		live := Member{ID: key, Heartbeats: []float64{}}

		if n, ok := byID[key]; ok {
			live.Workloads = len(n.Workloads.GetWorkloads())
			if n.Connected {
				for _, at := range n.Heartbeats {
					live.Heartbeats = append(live.Heartbeats, millisecondsBefore(now, at))
				}
			}
		}

		out = append(out, live)
	}

	slices.SortFunc(out, func(a, b Member) int { return cmp.Compare(a.ID, b.ID) })
	return out
}

// millisecondsBefore returns how long before now the time at was, in
// milliseconds. It is never negative.
func millisecondsBefore(now, at time.Time) float64 {
	return float64(max(0, now.Sub(at))) / float64(time.Millisecond)
}

// handlerCards returns the cards of the handlers of an application, and adds to
// handlerRates the latest value of each card's chart's number.
func handlerCards(
	app *configpb.Application,
	supported map[string]bool,
	f figures,
	handlerRates map[string]*float64,
) []HandlerCard {
	deadlines, events := map[string]bool{}, map[string]bool{}
	for name, kind := range app.GetMessages() {
		switch kind {
		case configpb.MessageKind_MESSAGE_KIND_DEADLINE:
			deadlines[name] = true
		case configpb.MessageKind_MESSAGE_KIND_EVENT:
			events[name] = true
		}
	}

	// The types are numbered in the order that the handlers are listed in.
	handlers := slices.SortedStableFunc(slices.Values(app.GetHandlers()), func(a, b *configpb.Handler) int {
		return cmp.Or(
			cmp.Compare(a.GetType(), b.GetType()),
			cmp.Compare(a.GetIdentity().GetName(), b.GetIdentity().GetName()),
		)
	})

	cards := []HandlerCard{}
	for _, h := range handlers {
		kind, ok := kinds[h.GetType()]
		if !ok {
			continue
		}

		key := h.GetIdentity().GetKey().AsString()
		figs := f.handlers[key]
		if figs == nil {
			figs = &handlerFigures{bindings: map[string]uint64{}}
		}

		card := HandlerCard{
			Key:      key,
			Name:     h.GetIdentity().GetName(),
			Kind:     kind,
			Disabled: h.GetIsDisabled(),

			MinimizesConcurrency: h.GetConcurrencyPreference() ==
				configpb.ConcurrencyPreference_CONCURRENCY_PREFERENCE_MINIMIZE,
			Summary: HandlerSummary{Failing: figs.failing},
		}
		s := &card.Summary

		var recorded *summedRate
		charted := "events"
		switch h.GetType() {
		case configpb.HandlerType_HANDLER_TYPE_AGGREGATE:
			s.QueuedMessages = figs.commandsPending
			recorded = &figs.eventsRecorded
			if supported[metric(new(metricsgrpc.AggregateInstanceEventStreamBindings))] {
				s.Bindings = bindingsOf(figs.bindings)

				var n uint64
				for _, b := range s.Bindings {
					n += b.Instances
				}
				s.Instances = &n
			}

		case configpb.HandlerType_HANDLER_TYPE_PROCESS:
			s.QueuedMessages = figs.deadlinesPending
			s.UnhandledEvents = figs.eventsPending
			recorded = &figs.eventsHandled
			for name, use := range h.GetMessages() {
				if use.GetIsProduced() && deadlines[name] {
					s.SchedulesDeadlines = true
				}
			}
			if supported[metric(new(metricsgrpc.ProcessInstanceQueueBindings))] {
				s.Bindings = bindingsOf(figs.bindings)
				s.Unbound = figs.unbound
			}

		case configpb.HandlerType_HANDLER_TYPE_INTEGRATION:
			s.QueuedMessages = figs.commandsPending

			// An integration that produces events has its events recorded charted,
			// and one that produces none has its commands handled charted.
			recorded, charted = &figs.commandsHandled, "commands"
			for name, use := range h.GetMessages() {
				if use.GetIsProduced() && events[name] {
					recorded, charted = &figs.eventsRecorded, "events"
				}
			}

		case configpb.HandlerType_HANDLER_TYPE_PROJECTION:
			s.UnhandledEvents = figs.eventsPending
			recorded = &figs.eventsHandled
		}

		if recorded.samples > 0 {
			card.History = &Chart{Points: []ChartPoint{}}
			card.Charted = charted
			handlerRates[key] = recorded.rate()
		}

		cards = append(cards, card)
	}

	return cards
}

// bindingsOf returns the bindings of a handler that hold instances, sorted by
// ID.
func bindingsOf(instances map[string]uint64) []Binding {
	out := []Binding{}
	for id, n := range instances {
		if n > 0 {
			out = append(out, Binding{id, n})
		}
	}
	slices.SortFunc(out, func(a, b Binding) int { return cmp.Compare(a.ID, b.ID) })
	return out
}

// Recorder keeps the history that the charts of the cluster views show.
//
// The charts of a cluster view show how a number changed over the last minute,
// but the nodes report only its latest value, so the Observatory records it as
// the nodes report. Call [Recorder.Record] regularly, such as once a second, and
// ask for a view with [Recorder.View]. It is safe to use from several
// goroutines.
type Recorder struct {
	m        sync.Mutex
	clusters map[string]*history
}

// history is the charts of one cluster.
type history struct {
	events     *Trail
	throughput *Trail
	handlers   map[string]*Trail

	// nodeRates is the smoothed rate of each node, by the key of the handler.
	nodeRates map[string]map[string]float64
}

func newHistory() *history {
	return &history{
		events:     NewTrail(chartSpan),
		throughput: NewTrail(chartSpan),
		handlers:   map[string]*Trail{},

		nodeRates: map[string]map[string]float64{},
	}
}

// NewRecorder returns a Recorder that has recorded nothing.
func NewRecorder() *Recorder {
	return &Recorder{clusters: map[string]*history{}}
}

// Record adds the clusters' numbers at the time now to their histories, and
// forgets the history of a cluster that none of the nodes belong to. The nodes
// are those that [Observer.Nodes] returns. Times that are recorded must not go
// backward.
func (r *Recorder) Record(now time.Time, nodes []Node) {
	r.m.Lock()
	defer r.m.Unlock()

	clusters := clustersOf(nodes)

	for id := range r.clusters {
		if _, ok := clusters[id]; !ok {
			delete(r.clusters, id)
		}
	}

	for id, members := range clusters {
		_, o, rs := overviewOf(now, members)

		h, ok := r.clusters[id]
		if !ok {
			h = newHistory()
			r.clusters[id] = h
		}

		if rs.events != nil {
			h.events.Add(now, *rs.events)
		}
		if rs.throughput != nil {
			h.throughput.Add(now, *rs.throughput)
		}
		for key, rate := range rs.handlers {
			if rate == nil {
				continue
			}
			t, ok := h.handlers[key]
			if !ok {
				t = NewTrail(chartSpan)
				h.handlers[key] = t
			}
			t.Add(now, *rate)
		}

		h.smoothNodeRates(now, members, o.Handlers)
	}
}

// nodeRateHalfLife is the time in which the smoothed rate of a node closes half
// of its distance to the rate that the node has now.
const nodeRateHalfLife = 30 * time.Second

// smoothNodeRates moves the smoothed rate of each node of each integration and
// projection towards the rate that it has at the time now. A node that has no
// rate, such as one that has gone, moves towards zero.
func (h *history) smoothNodeRates(now time.Time, nodes []Node, cards []HandlerCard) {
	commands, events := handledByNode(now, nodes)

	// The Recorder is called once a second, so each call moves the rates by the
	// share of a half-life that a second is.
	alpha := 1 - math.Pow(0.5, float64(time.Second)/float64(nodeRateHalfLife))

	for _, card := range cards {
		var raw map[string]float64
		switch card.Kind {
		case "integration":
			raw = commands[card.Key]
		case "projection":
			raw = events[card.Key]
		default:
			continue
		}

		smoothed := h.nodeRates[card.Key]
		if smoothed == nil {
			smoothed = map[string]float64{}
			h.nodeRates[card.Key] = smoothed
		}

		for node, rate := range raw {
			if old, ok := smoothed[node]; ok {
				smoothed[node] = old + alpha*(rate-old)
			} else {
				smoothed[node] = rate
			}
		}

		for node, old := range smoothed {
			if _, ok := raw[node]; ok {
				continue
			}
			if smoothed[node] = old * (1 - alpha); smoothed[node] < 1e-9 {
				delete(smoothed, node)
			}
		}
	}
}

// handledByNode returns how many commands and how many events per second each
// node handles for each handler, by the key of the handler and then the ID of
// the node. A node whose rate isn't known yet is left out.
//
// The totals that the nodes report are their own, so the rates are too. See
// [Combine], which adds them up.
func handledByNode(now time.Time, nodes []Node) (commands, events map[string]map[string]float64) {
	commands = map[string]map[string]float64{}
	events = map[string]map[string]float64{}

	readers := contributors(now, nodes)
	decisions := decide(readers)

	for _, n := range readers {
		id := n.Preamble.GetNodeId().AsString()

		for _, s := range n.Metrics.Samples {
			d := decisions[s.Metric]
			if s.Reach != metricsgrpc.Reach_REACH_NODE || d.reach != metricsgrpc.Reach_REACH_NODE {
				continue
			}

			rate, ok := s.perSecond(now)
			if !ok {
				continue
			}

			switch m := s.Message.(type) {
			case *metricsgrpc.HandlerCommandsHandled:
				add(commands, m.GetHandlerKey().AsString(), id, rate)
			case *metricsgrpc.HandlerEventsHandled:
				add(events, m.GetHandlerKey().AsString(), id, rate)
			}
		}
	}

	return commands, events
}

func add(m map[string]map[string]float64, key, node string, rate float64) {
	if m[key] == nil {
		m[key] = map[string]float64{}
	}
	m[key][node] = rate
}

// View returns the cluster view of the cluster that has the given ID, at the
// time now. The nodes are those that [Observer.Nodes] returns. It returns false
// if none of the nodes belong to the cluster.
func (r *Recorder) View(now time.Time, nodes []Node, cluster string) (ClusterView, bool) {
	members := clustersOf(nodes)[cluster]
	if len(members) == 0 {
		return ClusterView{}, false
	}

	app, o, _ := overviewOf(now, members)
	supported := Supported(now, members)

	r.m.Lock()
	defer r.m.Unlock()

	h := r.clusters[cluster]
	if h == nil {
		h = newHistory()
	}

	if o.Events != nil && o.Events.History != nil {
		c := chartOf(now, h.events)
		o.Events.History = &c
	}
	if o.Queues != nil && o.Queues.History != nil {
		c := chartOf(now, h.throughput)
		o.Queues.History = &c
	}
	for i, card := range o.Handlers {
		if card.History != nil {
			if t, ok := h.handlers[card.Key]; ok {
				c := chartOf(now, t)
				o.Handlers[i].History = &c
			}
		}

		var handled string
		switch card.Kind {
		case "integration":
			handled = metric(new(metricsgrpc.HandlerCommandsHandled))
		case "projection":
			handled = metric(new(metricsgrpc.HandlerEventsHandled))
		default:
			continue
		}
		if !supported[handled] {
			continue
		}

		rates := []NodeRate{}
		for node, rate := range h.nodeRates[card.Key] {
			rates = append(rates, NodeRate{node, rate})
		}
		slices.SortFunc(rates, func(a, b NodeRate) int { return cmp.Compare(a.Node, b.Node) })
		o.Handlers[i].Nodes = rates
	}

	return ClusterView{Application: app, Overview: o}, true
}

// Series is what the charts of one cluster have recorded, oldest first.
type Series struct {
	// Events is the chart of the events tile, and Throughput that of the queues
	// tile.
	Events, Throughput []TrailPoint

	// Handlers is the chart of each handler that has one, by the handler's key.
	Handlers map[string][]TrailPoint
}

// Series returns what the charts of the cluster that has the given ID have
// recorded. It is empty if the Recorder has recorded nothing for the cluster.
func (r *Recorder) Series(cluster string) Series {
	r.m.Lock()
	defer r.m.Unlock()

	s := Series{Handlers: map[string][]TrailPoint{}}

	h := r.clusters[cluster]
	if h == nil {
		return s
	}

	s.Events = h.events.Points()
	s.Throughput = h.throughput.Points()
	for key, t := range h.handlers {
		s.Handlers[key] = t.Points()
	}

	return s
}

// chartOf returns the chart of a trail, as it is at the time now.
func chartOf(now time.Time, t *Trail) Chart {
	points := t.Points()

	c := Chart{Points: make([]ChartPoint, 0, len(points))}
	for _, p := range points {
		c.Points = append(c.Points, ChartPoint{
			At:    -millisecondsBefore(now, p.At),
			Value: p.Value,
		})
	}

	return c
}
