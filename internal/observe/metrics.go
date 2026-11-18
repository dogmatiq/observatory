package observe

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/dogmatiq/protobuf/metricsgrpc"
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

	// minRateSpan is the shortest length of time that a running total must have
	// been observed for, before the Observatory gives a rate for it. A shorter
	// span would let one occurrence look like a burst.
	minRateSpan = 5 * time.Second
)

// Metrics is what a node has reported in one call to its metrics API.
type Metrics struct {
	// Call identifies the call. Calls that the same Observer made are numbered
	// in the order that they began, so a later call has a greater number.
	Call uint64

	// Preamble is the preamble that began the call.
	Preamble *metricsgrpc.WatchMetricsResponse_Preamble

	// Samples is the latest sample of each series that the node has reported in
	// the call, in no particular order. A series is the samples of one metric
	// for one subject.
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

	// Reach is whether the node's samples of this metric describe the whole
	// cluster, or only the work that the node owns.
	Reach metricsgrpc.Reach

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

	// run is the value of a running total over the last [rateWindow], in the
	// order that the values arrived. It is nil for a metric that isn't a running
	// total. See [runningTotals].
	run []point
}

// point is the value of a running total at the time that it arrived.
type point struct {
	at    time.Time
	value uint64
}

// runningTotals is the metrics whose values are running totals. The doc of each
// of their messages in [metricsgrpc] says so.
//
// A node lowers a running total only by starting again from zero. The node
// sends a sample only when the value changes, so the Observatory takes the
// value of a running total to be the same until the next sample arrives.
var runningTotals = map[string]bool{
	string(proto.MessageName(new(metricsgrpc.QueueCommandsRemoved))):     true,
	string(proto.MessageName(new(metricsgrpc.QueueDeadlinesRemoved))):    true,
	string(proto.MessageName(new(metricsgrpc.HandlerCommandsHandled))):   true,
	string(proto.MessageName(new(metricsgrpc.HandlerDeadlinesHandled))):  true,
	string(proto.MessageName(new(metricsgrpc.HandlerDeadlinesCanceled))): true,
	string(proto.MessageName(new(metricsgrpc.HandlerEventsRecorded))):    true,
	string(proto.MessageName(new(metricsgrpc.HandlerEventsHandled))):     true,
	string(proto.MessageName(new(metricsgrpc.ProcessInstancesEnded))):    true,
}

// extend returns the run of a running total after a new value of it arrives.
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

// perSecond returns how many times per second a running total has grown, on
// average, over the last [rateWindow] before the time now.
//
// ok is false if the sample isn't of a running total, or if the total has been
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

// metricsCall is the state of one call to a node's metrics API.
type metricsCall struct {
	number   uint64
	preamble *metricsgrpc.WatchMetricsResponse_Preamble
	series   map[seriesKey]*Sample
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

// watchMetrics calls the metrics API of the node that api calls, and calls it
// again whenever the call ends, until ctx ends or the node says that it doesn't
// report metrics.
func (o *Observer) watchMetrics(
	ctx context.Context,
	id, cluster string,
	c *connection,
	api metricsgrpc.MetricsAPIClient,
) {
	for {
		err := o.callMetrics(ctx, id, cluster, c, api)
		if ctx.Err() != nil {
			return
		}

		o.endMetrics(id, c, err)

		if status.Code(err) == codes.Unimplemented {
			return
		}

		t := time.NewTimer(metricsRetryDelay)
		select {
		case <-ctx.Done():
			t.Stop()
			return
		case <-t.C:
		}
	}
}

// callMetrics makes one call to the metrics API, and records what the node
// reports until the call ends. It returns why the call ended.
func (o *Observer) callMetrics(
	ctx context.Context,
	id, cluster string,
	c *connection,
	api metricsgrpc.MetricsAPIClient,
) error {
	stream, err := api.WatchMetrics(ctx, &metricsgrpc.WatchMetricsRequest{})
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

	// A node has the same IDs in every API that it serves.
	if preamble.GetNodeId().AsString() != id {
		return errors.New("the preamble is from a different node than the engine API's")
	}
	if preamble.GetClusterId().AsString() != cluster {
		return errors.New("the preamble is from a different cluster than the engine API's")
	}

	metrics := newMetricTable(preamble)

	call := o.beginMetrics(id, c, preamble)
	if call == nil {
		return context.Cause(ctx)
	}

	for {
		res, err := stream.Recv()
		if err != nil {
			return endOf(ctx, err)
		}

		if res.HasPreamble() {
			return errors.New("the node sent a second preamble")
		}

		sample, ok := res.TryGetSample()
		if !ok {
			continue
		}

		key, s, known, err := metrics.decode(sample, time.Now())
		if err != nil {
			return err
		}
		if !known {
			continue
		}

		if !o.recordSample(id, c, call, key, s) {
			return context.Cause(ctx)
		}
	}
}

// beginMetrics records that a call to the metrics API has begun on the
// connection c. It returns nil, and records nothing, if c has been replaced.
func (o *Observer) beginMetrics(
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
	e.metrics = &metricsCall{
		number:   o.calls,
		preamble: p,
		series:   map[seriesKey]*Sample{},
	}
	e.node.MetricsErr = nil

	return e.metrics
}

// recordSample records a sample in the call. It returns false, and records
// nothing, if the connection c has been replaced.
//
// It keeps the sample that it already has of the series, if that has a greater
// revision.
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

	current, ok := call.series[key]
	if ok && metricsgrpc.CompareRevisions(s.Revision, current.Revision) < 0 {
		return true
	}

	if runningTotals[s.Metric] {
		var run []point
		if ok {
			run = current.run
		}
		s.run = extend(run, point{s.At, valueOf(s.Message)})
	}

	call.series[key] = &s
	return true
}

// endMetrics records that a call to the metrics API has ended, and why. It
// discards what the call reported. It does nothing if the connection c has been
// replaced.
func (o *Observer) endMetrics(id string, c *connection, err error) {
	o.m.Lock()
	defer o.m.Unlock()

	e := o.live(id, c)
	if e == nil {
		return
	}

	e.metrics = nil
	e.node.MetricsErr = err
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
// messages has a "value" field that holds the measurement, and its other
// fields say what is measured.
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

// valueField returns the field of a metric's message that holds the
// measurement, or nil if it has none.
func valueField(d protoreflect.MessageDescriptor) protoreflect.FieldDescriptor {
	f := d.Fields().ByName("value")
	if f == nil || f.Kind() != protoreflect.Uint64Kind || f.Cardinality() == protoreflect.Repeated {
		return nil
	}
	return f
}

// metricTable is the metrics that a call's preamble lists, by their index.
type metricTable []tableEntry

type tableEntry struct {
	name  string
	reach metricsgrpc.Reach

	// message is the type of the metric's message, or nil if the Observatory
	// doesn't know the metric, or the node gave it no reach.
	message protoreflect.MessageType
}

func newMetricTable(p *metricsgrpc.WatchMetricsResponse_Preamble) metricTable {
	supported := p.GetSupportedMetrics()
	t := make(metricTable, len(supported))

	for i, m := range supported {
		e := tableEntry{
			name:  m.GetMessageName(),
			reach: m.GetReach(),
		}
		if e.reach != metricsgrpc.Reach_REACH_UNSPECIFIED {
			e.message = knownMetric(e.name)
		}
		t[i] = e
	}

	return t
}

// decode returns the sample that s reports, and the series that it belongs to.
// known is false if the sample is of a metric that the Observatory doesn't
// know, in which case nothing else is returned.
func (t metricTable) decode(
	s *metricsgrpc.WatchMetricsResponse_Sample,
	at time.Time,
) (key seriesKey, sample Sample, known bool, err error) {
	i := int(s.GetMetricIndex())
	if i >= len(t) {
		return seriesKey{}, Sample{}, false, fmt.Errorf(
			"the sample is of metric %d, but the preamble lists only %d",
			s.GetMetricIndex(),
			len(t),
		)
	}

	e := t[i]
	if e.message == nil {
		return seriesKey{}, Sample{}, false, nil
	}

	m := e.message.New().Interface()
	if err := proto.Unmarshal(s.GetValue(), m); err != nil {
		return seriesKey{}, Sample{}, false, fmt.Errorf("the value of a %s sample is malformed: %w", e.name, err)
	}

	return seriesKey{e.name, string(s.GetSubject())},
		Sample{
			Metric:   e.name,
			Reach:    e.reach,
			Message:  m,
			Revision: s.GetRevision(),
			At:       at,
			subject:  string(s.GetSubject()),
		},
		true,
		nil
}

// valueOf returns the measurement that a metric's message holds.
func valueOf(m proto.Message) uint64 {
	r := m.ProtoReflect()
	return r.Get(valueField(r.Descriptor())).Uint()
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
	// over the last minute. It is nil if the metric isn't a running total, or
	// if any sample that contributes to the value has been observed for less
	// than five seconds.
	//
	// Each node's rate comes from that node's own call, so it is never made from
	// values that came from different calls.
	PerSecond *float64
}

// addRates returns the sum of two rates, or nil if either is nil.
func addRates(a, b *float64) *float64 {
	if a == nil || b == nil {
		return nil
	}
	sum := *a + *b
	return &sum
}

// Combine returns what the nodes of one cluster report about the cluster as a
// whole, at the time now, in no particular order.
//
// Only nodes that are reporting at now, and that have a current call to the
// metrics API, contribute. A part of the cluster that no such node can read is
// missing from the result.
//
// How a metric's samples are combined depends on its reach:
//
//   - When it is the cluster, any node's samples describe the whole cluster,
//     so the result is from one node, which is the one whose call began first.
//     Samples from the others are ignored, so that the result never mixes
//     values from different calls.
//   - When it is the node, each node's samples describe only the work that
//     node owns. For each subject, the result is the sum of the values of the
//     nodes' samples of it.
//
// If nodes don't agree about a metric's reach, the first node to begin a call
// decides, and the nodes that disagree are ignored for that metric.
//
// The rate of a running total is combined in the same way as its value.
func Combine(now time.Time, nodes []Node) []ClusterSample {
	readers := contributors(now, nodes)
	decisions := decide(readers)

	type thing struct {
		metric, subject string
	}
	var out []ClusterSample
	sums := map[thing]int{} // the index in out of what has been summed

	for _, n := range readers {
		for _, s := range n.Metrics.Samples {
			d := decisions[s.Metric]
			if s.Reach != d.reach {
				continue
			}

			var rate *float64
			if r, ok := s.perSecond(now); ok {
				rate = &r
			}

			switch d.reach {
			case metricsgrpc.Reach_REACH_CLUSTER:
				if n.Metrics.Call == d.source {
					out = append(out, ClusterSample{s.Metric, s.Message, rate})
				}

			case metricsgrpc.Reach_REACH_NODE:
				k := thing{s.Metric, s.subject}
				i, ok := sums[k]
				if !ok {
					sums[k] = len(out)
					out = append(out, ClusterSample{s.Metric, proto.Clone(s.Message), rate})
					continue
				}

				r := out[i].Message.ProtoReflect()
				f := valueField(r.Descriptor())
				r.Set(f, protoreflect.ValueOfUint64(valueOf(out[i].Message)+valueOf(s.Message)))
				out[i].PerSecond = addRates(out[i].PerSecond, rate)
			}
		}
	}

	return out
}

// Supported returns the full names of the metrics that the nodes of one
// cluster support, at the time now. A metric is supported if a node that
// contributes to [Combine] lists it in the preamble of its call to the metrics
// API.
//
// A metric that is supported may still have no samples, such as the length of
// event streams in a cluster that has none yet. A metric that isn't supported
// never has samples.
func Supported(now time.Time, nodes []Node) map[string]bool {
	supported := map[string]bool{}
	for name := range decide(contributors(now, nodes)) {
		supported[name] = true
	}
	return supported
}

// contributors returns the nodes that [Combine] reads, in the order that their
// current calls to the metrics API began.
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

// decision is what [Combine] reads of one metric: its reach, and, if the reach
// is the cluster, the call that it reads.
type decision struct {
	reach  metricsgrpc.Reach
	source uint64
}

// decide returns the decision for each metric that the contributors list. The
// first node to list a metric decides its reach, and is the one that is read if
// the reach is the cluster.
func decide(contributors []Node) map[string]decision {
	decisions := map[string]decision{}
	for _, n := range contributors {
		for _, m := range n.Metrics.Preamble.GetSupportedMetrics() {
			if _, ok := decisions[m.GetMessageName()]; !ok {
				decisions[m.GetMessageName()] = decision{m.GetReach(), n.Metrics.Call}
			}
		}
	}
	return decisions
}
