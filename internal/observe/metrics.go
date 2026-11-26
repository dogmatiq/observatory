package observe

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
)

// metricsRetryDelay is how long the Observer waits before it calls a node's
// metrics API again, after the previous call ended.
const metricsRetryDelay = 5 * time.Second

const (
	// rateWindow is the length of time that a rate is averaged over.
	rateWindow = time.Minute

	// minRateSpan is the shortest length of time that a cumulative count must
	// have been observed for, before the Observatory gives a rate for it. A
	// shorter span would let one occurrence look like a burst.
	minRateSpan = 5 * time.Second
)

// Metrics is what a node has reported in one call to its metrics API, which is
// a call to WatchNodeMetrics or to WatchClusterMetrics.
type Metrics struct {
	// Call identifies the call. Calls that the same Observer made are numbered
	// in the order that they began, so a later call has a greater number.
	Call uint64

	// Preamble is the preamble that began the call.
	Preamble *metricsgrpc.WatchMetricsResponse_Preamble

	// Samples is the latest sample of each series that the node has reported in
	// the call, in no particular order. A series is the samples of one metric
	// for one subject. A series whose latest message is a Tombstone, which says
	// that the node has stopped reporting it, has no sample here.
	//
	// Only metrics that the Observatory knows appear here. See [Sample].
	Samples []Sample
}

// Sample is the latest measurement of one metric of one subject, such as the
// number of commands that are pending in one queue, that a node reported.
type Sample struct {
	// Metric is the full name of the Protocol Buffers message that holds the
	// measurement, such as "dogma.metrics.v1alpha1.QueueCommandsPending".
	Metric string

	// Message is the measurement. Its type is the one that Metric names. It is
	// shared with the Observer, and must not be modified.
	Message proto.Message

	// Revision orders the samples of one subject. See
	// [metricsgrpc.CompareRevisions].
	Revision []byte

	// At is the time at which the sample arrived, by the clock of the process
	// that runs the Observer.
	At time.Time

	// subject says what the sample describes. Equal subjects of the same
	// metric, from any nodes of one cluster, describe the same thing, so this is
	// what the samples of different nodes are matched by.
	subject string

	// run is the value of a cumulative count over the last [rateWindow], in the
	// order that the values arrived. It is nil for a metric that isn't a
	// cumulative count. See [isCumulative].
	run []point
}

// point is the value of a cumulative count at the time that it arrived.
type point struct {
	at    time.Time
	value uint64
}

// extend returns the run of a cumulative count after a new value of it
// arrives.
func extend(run []point, p point) []point {
	if n := len(run); n > 0 {
		switch last := run[n-1].value; {
		case p.value < last:
			// The node started counting again from zero. What it counted before
			// says nothing about the rate now.
			return []point{p}
		case p.value == last:
			return run
		}
	}

	run = append(run, p)

	// The latest point from before the window gives the value at its start, so
	// only that one is needed.
	for len(run) >= 2 && !run[1].at.After(p.at.Add(-rateWindow)) {
		run = run[1:]
	}

	return run
}

// perSecond returns how many times per second a cumulative count has grown, on
// average, over the last [rateWindow] before the time now.
//
// ok is false if the sample isn't of a cumulative count, or if the count has been
// observed for less than [minRateSpan]. The span is shorter than the window
// until the total has been observed for that long.
func (s Sample) perSecond(now time.Time) (rate float64, ok bool) {
	if len(s.run) == 0 {
		return 0, false
	}

	// The value at the start of the window is the value of the latest point
	// that arrived at or before it. If none did, the first value that arrived is
	// the best that there is.
	from := now.Add(-rateWindow)
	start := s.run[0]
	for _, p := range s.run {
		if p.at.After(from) {
			break
		}
		start = p
	}

	since := start.at
	if since.Before(from) {
		since = from
	}

	span := now.Sub(since)
	if span < minRateSpan {
		return 0, false
	}

	latest := s.run[len(s.run)-1]
	return float64(latest.value-start.value) / span.Seconds(), true
}

// isCumulative returns true if a metric's message holds a cumulative count,
// which is the number of times that something has happened since the engine
// started counting. Its field is cumulative_count, as the spec names it.
//
// Within one call, the engine lowers a cumulative count only by starting again
// from zero. It sends a sample only when the value changes, so the Observatory
// takes the value to be the same until the next sample arrives.
func isCumulative(d protoreflect.MessageDescriptor) bool {
	f := valueField(d)
	return f != nil && f.Name() == "cumulative_count"
}

// metricsCall is the state of one call to a node's metrics API.
type metricsCall struct {
	number   uint64
	preamble *metricsgrpc.WatchMetricsResponse_Preamble
	series   map[seriesKey]*Sample

	// tombstones is the revision of the latest Tombstone of each series whose
	// latest message was a Tombstone.
	tombstones map[seriesKey][]byte
}

// seriesKey identifies a series within one call.
type seriesKey struct {
	metric  string
	subject string
}

// snapshot returns what the call has reported so far. It returns nil if c is
// nil.
func (c *metricsCall) snapshot() *Metrics {
	if c == nil {
		return nil
	}

	m := &Metrics{
		Call:     c.number,
		Preamble: c.preamble,
		Samples:  make([]Sample, 0, len(c.series)),
	}
	for _, s := range c.series {
		sample := *s
		sample.run = slices.Clone(s.run)
		m.Samples = append(m.Samples, sample)
	}
	return m
}

// metricsMethod is a method of the metrics API that the Observer calls.
type metricsMethod int

const (
	// nodeMetrics is WatchNodeMetrics, which reports the metrics of the node
	// that serves the call.
	nodeMetrics metricsMethod = iota

	// clusterMetrics is WatchClusterMetrics, which reports the metrics of the
	// whole cluster.
	clusterMetrics
)

// open begins a call to the method.
func (m metricsMethod) open(
	ctx context.Context,
	api metricsgrpc.MetricsAPIClient,
) (grpc.ServerStreamingClient[metricsgrpc.WatchMetricsResponse], error) {
	if m == clusterMetrics {
		return api.WatchClusterMetrics(ctx, &metricsgrpc.WatchClusterMetricsRequest{})
	}
	return api.WatchNodeMetrics(ctx, &metricsgrpc.WatchNodeMetricsRequest{})
}

// call returns where an entry keeps its current call to the method.
func (m metricsMethod) call(e *entry) **metricsCall {
	if m == clusterMetrics {
		return &e.clusterMetrics
	}
	return &e.metrics
}

// err returns where an entry keeps why its latest call to the method ended.
func (m metricsMethod) err(e *entry) *error {
	if m == clusterMetrics {
		return &e.node.ClusterMetricsErr
	}
	return &e.node.MetricsErr
}

// watchNodeMetrics calls WatchNodeMetrics on the node that api calls, and calls
// it again after a delay whenever the call ends, until ctx ends or the node
// fails the call with UNIMPLEMENTED, which means that it doesn't report
// metrics. The node sent the preamble p on its engine API.
func (o *Observer) watchNodeMetrics(
	ctx context.Context,
	id string,
	p *enginegrpc.WatchEngineResponse_Preamble,
	c *connection,
	api metricsgrpc.MetricsAPIClient,
) {
	for {
		err := o.callMetrics(ctx, nodeMetrics, id, p, c, api)
		if ctx.Err() != nil {
			return
		}

		o.endMetrics(nodeMetrics, id, c, err)

		if !o.retry(ctx, err) {
			return
		}
	}
}

// watchClusterMetrics calls WatchClusterMetrics on the node that api calls,
// whenever no other node of its cluster is being called for them, and calls it
// again after a delay whenever the call ends, until ctx ends or the node fails
// the call with UNIMPLEMENTED. The node sent the preamble p on its engine API,
// and its engine runs as a cluster.
//
// Any node of a cluster can describe the whole cluster, so the Observer calls
// only one node of each cluster at a time, which spares the others the cost of
// measuring it. When that node's call ends, another node of the cluster is
// called in its place, and the node whose call ended waits before it is called
// again.
func (o *Observer) watchClusterMetrics(
	ctx context.Context,
	id string,
	p *enginegrpc.WatchEngineResponse_Preamble,
	c *connection,
	api metricsgrpc.MetricsAPIClient,
) {
	cluster := clusterOf(p)

	for {
		if released, ok := o.claim(cluster, c); !ok {
			select {
			case <-ctx.Done():
				return
			case <-released:
				continue
			}
		}

		err := o.callMetrics(ctx, clusterMetrics, id, p, c, api)
		ended := ctx.Err() != nil

		o.endClusterMetrics(cluster, id, c, err, ended)

		if ended || !o.retry(ctx, err) {
			return
		}
	}
}

// retry waits before a call to the metrics API is made again, after a call
// that ended with err. It returns false if the call is not to be made again,
// because ctx has ended, or because the node failed the call with
// UNIMPLEMENTED.
func (o *Observer) retry(ctx context.Context, err error) bool {
	if status.Code(err) == codes.Unimplemented {
		return false
	}

	t := time.NewTimer(metricsRetryDelay)
	select {
	case <-ctx.Done():
		t.Stop()
		return false
	case <-t.C:
		return true
	}
}

// claim makes the connection c the one that the Observer calls
// WatchClusterMetrics on for the cluster, if the cluster has none. If it has
// another, claim returns false, and a channel that is closed when that may have
// changed.
func (o *Observer) claim(cluster string, c *connection) (<-chan struct{}, bool) {
	o.m.Lock()
	defer o.m.Unlock()

	if r, ok := o.readers[cluster]; ok && r != c {
		return o.released, false
	}

	o.readers[cluster] = c
	return nil, true
}

// endClusterMetrics records that a call to WatchClusterMetrics has ended, and
// why, as [Observer.endMetrics] does, unless the call ended because the node's
// connection ended. Either way, the cluster can then be read through another
// node.
func (o *Observer) endClusterMetrics(cluster, id string, c *connection, err error, ended bool) {
	o.m.Lock()
	defer o.m.Unlock()

	if e := o.live(id, c); e != nil {
		e.clusterMetrics = nil
		if !ended {
			e.node.ClusterMetricsErr = err
		}
	}

	if o.readers[cluster] == c {
		delete(o.readers, cluster)
		close(o.released)
		o.released = make(chan struct{})
	}
}

// callMetrics makes one call to a method of the metrics API, and records what
// the node reports until the call ends. It returns why the call ended. The node
// sent the preamble p on its engine API.
func (o *Observer) callMetrics(
	ctx context.Context,
	m metricsMethod,
	id string,
	p *enginegrpc.WatchEngineResponse_Preamble,
	c *connection,
	api metricsgrpc.MetricsAPIClient,
) error {
	stream, err := m.open(ctx, api)
	if err != nil {
		return err
	}

	res, err := stream.Recv()
	if err != nil {
		return endOf(ctx, err)
	}

	preamble, ok := res.TryGetPreamble()
	if !ok {
		return errors.New("the first response wasn't a preamble")
	}

	// An engine has the same ID in every API that it serves, and so does the
	// cluster of an engine that runs as one. An engine that doesn't gives no
	// cluster ID in either.
	if preamble.GetId().AsString() != id {
		return errors.New("the preamble is from a different engine than the engine API's")
	}
	if preamble.GetClusterId().AsString() != p.GetCluster().GetId().AsString() {
		return errors.New("the preamble is from a different cluster than the engine API's")
	}

	metrics := newMetricTable(preamble)

	call := o.beginMetrics(m, id, c, preamble)
	if call == nil {
		return context.Cause(ctx)
	}

	for {
		res, err := stream.Recv()
		if err != nil {
			return endOf(ctx, err)
		}

		var recorded bool

		switch {
		case res.HasPreamble():
			return errors.New("the node sent a second preamble")

		case res.HasSample():
			key, s, known, err := metrics.decode(res.GetSample(), time.Now())
			if err != nil {
				return err
			}
			if !known {
				continue
			}
			recorded = o.recordSample(id, c, call, key, s)

		case res.HasTombstone():
			t := res.GetTombstone()
			key, known, err := metrics.keyOf(t.GetMetricIndex(), t.GetSubject())
			if err != nil {
				return err
			}
			if !known {
				continue
			}
			recorded = o.recordTombstone(id, c, call, key, t.GetRevision())

		default:
			continue
		}

		if !recorded {
			return context.Cause(ctx)
		}
	}
}

// beginMetrics records that a call to a method of the metrics API has begun on
// the connection c. It returns nil, and records nothing, if c has been
// replaced.
func (o *Observer) beginMetrics(
	m metricsMethod,
	id string,
	c *connection,
	p *metricsgrpc.WatchMetricsResponse_Preamble,
) *metricsCall {
	o.m.Lock()
	defer o.m.Unlock()

	e := o.live(id, c)
	if e == nil {
		return nil
	}

	o.calls++
	call := &metricsCall{
		number:     o.calls,
		preamble:   p,
		series:     map[seriesKey]*Sample{},
		tombstones: map[seriesKey][]byte{},
	}
	*m.call(e) = call
	*m.err(e) = nil

	return call
}

// recordSample records a sample in the call. It returns false, and records
// nothing, if the connection c has been replaced.
//
// It keeps the sample or the Tombstone that it already has of the series, if
// that has a greater revision.
func (o *Observer) recordSample(
	id string,
	c *connection,
	call *metricsCall,
	key seriesKey,
	s Sample,
) bool {
	o.m.Lock()
	defer o.m.Unlock()

	if o.live(id, c) == nil {
		return false
	}

	if t, ok := call.tombstones[key]; ok {
		if metricsgrpc.CompareRevisions(s.Revision, t) < 0 {
			return true
		}
		delete(call.tombstones, key)
	}

	current, ok := call.series[key]
	if ok && metricsgrpc.CompareRevisions(s.Revision, current.Revision) < 0 {
		return true
	}

	if isCumulative(s.Message.ProtoReflect().Descriptor()) {
		var run []point
		if ok {
			run = current.run
		}
		s.run = extend(run, point{s.At, valueOf(s.Message)})
	}

	call.series[key] = &s
	return true
}

// recordTombstone records in the call that the node has stopped reporting a
// series, which discards the sample that the call has of it. It returns false,
// and records nothing, if the connection c has been replaced.
//
// It keeps the sample or the Tombstone that it already has of the series, if
// that has a greater revision.
func (o *Observer) recordTombstone(
	id string,
	c *connection,
	call *metricsCall,
	key seriesKey,
	revision []byte,
) bool {
	o.m.Lock()
	defer o.m.Unlock()

	if o.live(id, c) == nil {
		return false
	}

	if current, ok := call.series[key]; ok {
		if metricsgrpc.CompareRevisions(revision, current.Revision) < 0 {
			return true
		}
		delete(call.series, key)
	}

	if t, ok := call.tombstones[key]; ok && metricsgrpc.CompareRevisions(revision, t) < 0 {
		return true
	}

	call.tombstones[key] = revision
	return true
}

// endMetrics records that a call to a method of the metrics API has ended, and
// why. It discards what the call reported. It does nothing if the connection c
// has been replaced.
func (o *Observer) endMetrics(m metricsMethod, id string, c *connection, err error) {
	o.m.Lock()
	defer o.m.Unlock()

	e := o.live(id, c)
	if e == nil {
		return
	}

	*m.call(e) = nil
	*m.err(e) = err
}

// metricsPackage is the Protocol Buffers package of the metrics that the
// Observatory knows.
var metricsPackage = new(metricsgrpc.QueueCommandsPending).
	ProtoReflect().
	Descriptor().
	ParentFile().
	Package()

// knownMetric returns the type of the message that holds the samples of the
// metric with the given full name, or nil if the Observatory doesn't know it.
//
// The Observatory knows the metrics that [metricsgrpc] defines. Each of their
// messages has one field that holds the measurement, which [valueField]
// returns, and its other fields say what is measured.
func knownMetric(name string) protoreflect.MessageType {
	t, err := protoregistry.GlobalTypes.FindMessageByName(protoreflect.FullName(name))
	if err != nil {
		return nil
	}

	d := t.Descriptor()
	if d.ParentFile().Package() != metricsPackage {
		return nil
	}

	if f := valueField(d); f == nil {
		return nil
	}

	return t
}

// valueFields is the names of the fields that hold the measurement of a metric
// that the spec defines. The message of each metric has one of them.
var valueFields = []protoreflect.Name{
	"cumulative_count",
	"current_count",
	"watermark",
	"gauge",
}

// valueField returns the field of a metric's message that holds the
// measurement, or nil if it has none.
func valueField(d protoreflect.MessageDescriptor) protoreflect.FieldDescriptor {
	for _, name := range valueFields {
		f := d.Fields().ByName(name)
		if f != nil && f.Kind() == protoreflect.Uint64Kind && f.Cardinality() != protoreflect.Repeated {
			return f
		}
	}
	return nil
}

// metricTable is the metrics that a call's preamble lists, by their index.
type metricTable []tableEntry

type tableEntry struct {
	name string

	// message is the type of the metric's message, or nil if the Observatory
	// doesn't know the metric.
	message protoreflect.MessageType
}

func newMetricTable(p *metricsgrpc.WatchMetricsResponse_Preamble) metricTable {
	supported := p.GetSupportedMetrics()
	t := make(metricTable, len(supported))

	for i, name := range supported {
		t[i] = tableEntry{
			name:    name,
			message: knownMetric(name),
		}
	}

	return t
}

// keyOf returns the series of the metric with the given index and the given
// subject. known is false if the metric is one that the Observatory doesn't
// know.
func (t metricTable) keyOf(index uint32, subject []byte) (key seriesKey, known bool, err error) {
	i := int(index)
	if i >= len(t) {
		return seriesKey{}, false, fmt.Errorf(
			"the message is of metric %d, but the preamble lists only %d",
			index,
			len(t),
		)
	}

	e := t[i]
	if e.message == nil {
		return seriesKey{}, false, nil
	}

	return seriesKey{e.name, string(subject)}, true, nil
}

// decode returns the sample that s reports, and the series that it belongs to.
// known is false if the sample is of a metric that the Observatory doesn't
// know, in which case nothing else is returned.
func (t metricTable) decode(
	s *metricsgrpc.WatchMetricsResponse_Sample,
	at time.Time,
) (key seriesKey, sample Sample, known bool, err error) {
	key, known, err = t.keyOf(s.GetMetricIndex(), s.GetSubject())
	if !known || err != nil {
		return seriesKey{}, Sample{}, false, err
	}

	e := t[s.GetMetricIndex()]
	m := e.message.New().Interface()
	if err := proto.Unmarshal(s.GetValue(), m); err != nil {
		return seriesKey{}, Sample{}, false, fmt.Errorf("the value of a %s sample is malformed: %w", e.name, err)
	}

	return key,
		Sample{
			Metric:   e.name,
			Message:  m,
			Revision: s.GetRevision(),
			At:       at,
			subject:  key.subject,
		},
		true,
		nil
}

// valueOf returns the measurement that a metric's message holds.
func valueOf(m proto.Message) uint64 {
	r := m.ProtoReflect()
	return r.Get(valueField(r.Descriptor())).Uint()
}

// setValue changes the measurement that a metric's message holds.
func setValue(m proto.Message, v uint64) {
	r := m.ProtoReflect()
	r.Set(valueField(r.Descriptor()), protoreflect.ValueOfUint64(v))
}

// ClusterSample is the value of one metric of one subject, such as the number
// of commands that are pending in one queue, for the cluster as a whole.
type ClusterSample struct {
	// Metric is the full name of the Protocol Buffers message that holds the
	// measurement.
	Metric string

	// Message is the measurement. Its type is the one that Metric names. It
	// isn't shared with the Observer.
	Message proto.Message

	// PerSecond is how many times per second the value has grown, on average,
	// over the last minute. It is nil if the metric isn't a cumulative count,
	// or if any sample that contributes to the value has been observed for less
	// than five seconds.
	//
	// Each node's rate comes from that node's own call, so it is never made from
	// values that came from different calls.
	PerSecond *float64

	// Measuring is true if a sample that contributes to the value is a
	// cumulative count that has been observed for less than five seconds, which
	// makes PerSecond nil. It is so for a few seconds after a node joins the
	// cluster or reconnects, until the Observatory has measured the node's count
	// for long enough to give its rate.
	Measuring bool
}

// addRates returns the sum of two rates, or nil if either is nil.
func addRates(a, b *float64) *float64 {
	if a == nil || b == nil {
		return nil
	}
	sum := *a + *b
	return &sum
}

// combination is how the samples of one metric and one subject that several
// nodes of a cluster report through WatchNodeMetrics make one value for the
// whole cluster.
type combination int

const (
	// summed is the combination of a current count or a cumulative count. The
	// spec says that the sum over the nodes is an estimate of the value for the
	// whole cluster.
	summed combination = iota

	// greatest is the combination of the length of an event stream, which the
	// spec says is the greatest value that any node reports.
	greatest

	// uncombined is the combination of a metric whose value the spec gives no
	// rule for combining, such as the lag of a handler, which several nodes can
	// report of the same events.
	uncombined
)

// combinationOf returns how the samples of a metric from several nodes make
// one value.
func combinationOf(metric string) combination {
	if metric == string(proto.MessageName(new(metricsgrpc.EventStreamLength))) {
		return greatest
	}

	t := knownMetric(metric)
	if t == nil {
		return uncombined
	}

	switch valueField(t.Descriptor()).Name() {
	case "cumulative_count", "current_count":
		return summed
	default:
		return uncombined
	}
}

// reading is what [Combine] reads of one cluster at a moment.
type reading struct {
	// nodes is the nodes that are reporting and have a current call to
	// WatchNodeMetrics, in the order that those calls began.
	nodes []Node

	// cluster is the node whose current call to WatchClusterMetrics is read. It
	// is nil if no node that is reporting has such a call.
	cluster *Node

	// clustered is true if the engine runs as a cluster.
	clustered bool
}

// readingOf returns what [Combine] reads of one cluster's nodes at the time
// now.
func readingOf(now time.Time, nodes []Node) reading {
	r := reading{nodes: contributors(now, nodes)}

	for _, n := range nodes {
		if n.Preamble.HasCluster() {
			r.clustered = true
		}
		if n.ClusterMetrics == nil || !n.Reporting(now) {
			continue
		}
		if r.cluster == nil || n.ClusterMetrics.Call < r.cluster.ClusterMetrics.Call {
			r.cluster = &n
		}
	}

	return r
}

// fromNodes returns how the samples of a metric from the nodes' calls to
// WatchNodeMetrics are combined. It returns false if they are not read: because
// the call to WatchClusterMetrics that is read reports the metric, or because
// the spec gives no rule for combining the metric and the engine runs as a
// cluster. An engine that doesn't run as a cluster has one node, whose samples
// describe the whole engine.
func (r reading) fromNodes(metric string) (combination, bool) {
	if r.cluster != nil && slices.Contains(r.cluster.ClusterMetrics.Preamble.GetSupportedMetrics(), metric) {
		return 0, false
	}

	c := combinationOf(metric)
	if c == uncombined && r.clustered {
		return 0, false
	}

	return c, true
}

// reads returns true if any node's call is read.
func (r reading) reads() bool {
	return len(r.nodes) > 0 || r.cluster != nil
}

// rateOf returns the rate of a sample at the time now, or nil if it has none,
// and whether it has none only because it is a cumulative count that has been
// observed for less than [minRateSpan].
func rateOf(now time.Time, s Sample) (rate *float64, measuring bool) {
	if r, ok := s.perSecond(now); ok {
		return &r, false
	}
	return nil, len(s.run) > 0
}

// Combine returns what the nodes of one cluster report about the cluster as a
// whole, at the time now, in no particular order.
//
// Only nodes that are reporting at now contribute. A part of the cluster that
// no such node can read is missing from the result.
//
// A metric that a node's current call to WatchClusterMetrics reports is read
// from that call alone, because it describes the whole cluster. Of the nodes
// that have such a call, it is the one whose call began first.
//
// Every other metric is read from the nodes' current calls to
// WatchNodeMetrics, each of which describes only the node's own work, unless
// the engine doesn't run as a cluster. For each subject, the values of the
// nodes' samples are combined as the spec says for the metric: a current count
// or a cumulative count is the sum, and the length of an event stream is the
// greatest. A metric that the spec gives no such rule for, such as the lag of a
// handler, is left out, unless the engine doesn't run as a cluster. A node that
// has stopped reporting a subject, with a Tombstone, adds nothing to it.
//
// The rate of a cumulative count is combined in the same way as its value.
func Combine(now time.Time, nodes []Node) []ClusterSample {
	r := readingOf(now, nodes)

	var out []ClusterSample
	if r.cluster != nil {
		for _, s := range r.cluster.ClusterMetrics.Samples {
			rate, measuring := rateOf(now, s)
			out = append(out, ClusterSample{s.Metric, proto.Clone(s.Message), rate, measuring})
		}
	}

	type thing struct {
		metric, subject string
	}
	combined := map[thing]int{} // the index in out of what has been combined

	for _, n := range r.nodes {
		for _, s := range n.Metrics.Samples {
			how, ok := r.fromNodes(s.Metric)
			if !ok {
				continue
			}

			rate, measuring := rateOf(now, s)

			k := thing{s.Metric, s.subject}
			i, ok := combined[k]
			if !ok {
				combined[k] = len(out)
				out = append(out, ClusterSample{s.Metric, proto.Clone(s.Message), rate, measuring})
				continue
			}

			switch how {
			case summed:
				setValue(out[i].Message, valueOf(out[i].Message)+valueOf(s.Message))
				out[i].PerSecond = addRates(out[i].PerSecond, rate)
				out[i].Measuring = out[i].Measuring || measuring
			case greatest:
				setValue(out[i].Message, max(valueOf(out[i].Message), valueOf(s.Message)))
			}
		}
	}

	return out
}

// Supported returns the full names of the metrics that the nodes of one
// cluster support, at the time now. A metric is supported if a call that
// [Combine] reads lists it in its preamble, and Combine reads that call's
// samples of it.
//
// A metric that is supported may still have no samples, such as the length of
// event streams in a cluster that has none yet. A metric that isn't supported
// never has samples.
func Supported(now time.Time, nodes []Node) map[string]bool {
	r := readingOf(now, nodes)
	supported := map[string]bool{}

	if r.cluster != nil {
		for _, name := range r.cluster.ClusterMetrics.Preamble.GetSupportedMetrics() {
			supported[name] = true
		}
	}

	for _, n := range r.nodes {
		for _, name := range n.Metrics.Preamble.GetSupportedMetrics() {
			if _, ok := r.fromNodes(name); ok {
				supported[name] = true
			}
		}
	}

	return supported
}

// Coverage returns the coverage of each metric that [Combine] reads from the
// nodes' calls to WatchNodeMetrics, at the time now, by its full name, if it is
// less than whole. A metric's coverage is the share of the nodes that it could
// be read from that list it, from 0 to 1: the nodes that Combine reads, and the
// members of the cluster that aren't reporting, which report nothing. Combine
// leaves out the nodes that don't list a metric, and the members that aren't
// reporting, so its sums of it are too small by an amount that isn't known.
// Nodes of one cluster that support different metrics may be partway through a
// deploy, but nothing here relies on that. See [Members].
//
// A metric that every one of those nodes lists isn't listed, because its
// coverage is whole. Nor is a metric that Combine reads from a call to
// WatchClusterMetrics, because one node describes the whole cluster.
func Coverage(now time.Time, nodes []Node) map[string]float64 {
	r := readingOf(now, nodes)

	reporting := map[string]bool{}
	for _, n := range nodes {
		if n.Reporting(now) {
			reporting[n.Preamble.GetId().AsString()] = true
		}
	}

	// The nodes that each metric could be read from.
	from := map[string]bool{}
	for _, n := range r.nodes {
		from[n.Preamble.GetId().AsString()] = true
	}
	for _, id := range Members(now, nodes) {
		if !reporting[id.AsString()] {
			from[id.AsString()] = true
		}
	}

	listing := map[string]int{}
	for _, n := range r.nodes {
		for _, name := range n.Metrics.Preamble.GetSupportedMetrics() {
			if _, ok := r.fromNodes(name); ok {
				listing[name]++
			}
		}
	}

	coverage := map[string]float64{}
	for name, count := range listing {
		if count < len(from) {
			coverage[name] = float64(count) / float64(len(from))
		}
	}

	return coverage
}

// contributors returns the nodes that are reporting at the time now and have a
// current call to WatchNodeMetrics, in the order that those calls began.
func contributors(now time.Time, nodes []Node) []Node {
	var out []Node
	for _, n := range nodes {
		if n.Metrics != nil && n.Reporting(now) {
			out = append(out, n)
		}
	}
	slices.SortFunc(out, func(a, b Node) int {
		return cmp.Compare(a.Metrics.Call, b.Metrics.Call)
	})
	return out
}
