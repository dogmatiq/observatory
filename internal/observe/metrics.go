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

	// identity says what the sample describes, in a way that is the same on
	// every node: the message without its value. A subject is only meaningful
	// on the stream that it came from, so this is what the samples of different
	// nodes are matched by.
	identity string
}

// metricsCall is the state of one call to a node's metrics API.
type metricsCall struct {
	number   uint64
	preamble *metricsgrpc.WatchMetricsResponse_Preamble
	series   map[seriesKey]Sample
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
		m.Samples = append(m.Samples, s)
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

	e := o.nodes[id]
	if e.conn != c {
		return nil
	}

	o.calls++
	e.metrics = &metricsCall{
		number:   o.calls,
		preamble: p,
		series:   map[seriesKey]Sample{},
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

	if o.nodes[id].conn != c {
		return false
	}

	if current, ok := call.series[key]; ok {
		if metricsgrpc.CompareRevisions(s.Revision, current.Revision) < 0 {
			return true
		}
	}

	call.series[key] = s
	return true
}

// endMetrics records that a call to the metrics API has ended, and why. It
// discards what the call reported. It does nothing if the connection c has been
// replaced.
func (o *Observer) endMetrics(id string, c *connection, err error) {
	o.m.Lock()
	defer o.m.Unlock()

	e := o.nodes[id]
	if e.conn != c {
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

	identity, err := identityOf(m)
	if err != nil {
		return seriesKey{}, Sample{}, false, err
	}

	return seriesKey{e.name, string(s.GetSubject())},
		Sample{
			Metric:   e.name,
			Reach:    e.reach,
			Message:  m,
			Revision: s.GetRevision(),
			At:       at,
			identity: identity,
		},
		true,
		nil
}

// identityOf returns what the message describes, which is the message without
// its value.
func identityOf(m proto.Message) (string, error) {
	m = proto.Clone(m)
	r := m.ProtoReflect()
	r.Clear(valueField(r.Descriptor()))

	b, err := proto.MarshalOptions{Deterministic: true}.Marshal(m)
	return string(b), err
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
//     node owns. For each thing that nodes measure, the result is the sum of
//     their values.
//
// If nodes don't agree about a metric's reach, the first node to begin a call
// decides, and the nodes that disagree are ignored for that metric.
func Combine(now time.Time, nodes []Node) []ClusterSample {
	var contributors []Node
	for _, n := range nodes {
		if n.Metrics != nil && n.Reporting(now) {
			contributors = append(contributors, n)
		}
	}
	slices.SortFunc(contributors, func(a, b Node) int {
		return cmp.Compare(a.Metrics.Call, b.Metrics.Call)
	})

	// The first node to list a metric decides its reach, and is the one that is
	// read if the reach is the cluster.
	type decision struct {
		reach  metricsgrpc.Reach
		source uint64
	}
	decisions := map[string]decision{}
	for _, n := range contributors {
		for _, m := range n.Metrics.Preamble.GetSupportedMetrics() {
			if _, ok := decisions[m.GetMessageName()]; !ok {
				decisions[m.GetMessageName()] = decision{m.GetReach(), n.Metrics.Call}
			}
		}
	}

	type thing struct {
		metric, identity string
	}
	var out []ClusterSample
	sums := map[thing]int{} // the index in out of what has been summed

	for _, n := range contributors {
		for _, s := range n.Metrics.Samples {
			d := decisions[s.Metric]
			if s.Reach != d.reach {
				continue
			}

			switch d.reach {
			case metricsgrpc.Reach_REACH_CLUSTER:
				if n.Metrics.Call == d.source {
					out = append(out, ClusterSample{s.Metric, s.Message})
				}

			case metricsgrpc.Reach_REACH_NODE:
				k := thing{s.Metric, s.identity}
				i, ok := sums[k]
				if !ok {
					sums[k] = len(out)
					out = append(out, ClusterSample{s.Metric, proto.Clone(s.Message)})
					continue
				}

				r := out[i].Message.ProtoReflect()
				f := valueField(r.Descriptor())
				total := r.Get(f).Uint() + s.Message.ProtoReflect().Get(f).Uint()
				r.Set(f, protoreflect.ValueOfUint64(total))
			}
		}
	}

	return out
}
