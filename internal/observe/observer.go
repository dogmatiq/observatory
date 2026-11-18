package observe

import (
	"context"
	"errors"
	"io"
	"slices"
	"sync"
	"time"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
)

// ErrForgotten is the error that [Observer.Serve] returns when the Observer
// forgot the node while its connection was open.
var ErrForgotten = errors.New("the observer forgot the node")

// ErrSuperseded is the error that [Observer.Serve] returns when a newer
// connection from the same node replaced the one that it was serving.
var ErrSuperseded = errors.New("the node connected again")

// historySpan is how far back the Observer remembers what happened, such as
// when a node sent its heartbeats.
const historySpan = 10 * time.Minute

// Observer holds what the nodes of engines report about themselves.
//
// It learns who each connection is from the node ID in the preamble of the
// node's engine API, and keeps one entry for each node ID.
type Observer struct {
	m     sync.Mutex
	nodes map[string]*entry

	// calls is the number of calls to the metrics API that have begun.
	calls uint64
}

// NewObserver returns an Observer that knows no nodes.
func NewObserver() *Observer {
	return &Observer{nodes: map[string]*entry{}}
}

// Node is what an [Observer] knows about one node at one moment.
//
// The messages in a Node are shared with the Observer, and must not be
// modified.
type Node struct {
	// Preamble is the preamble that the node sent when its latest connection
	// began.
	Preamble *enginegrpc.WatchEngineResponse_Preamble

	// LiveNodes is the latest set of nodes that the node believes are live. It
	// is nil until the node sends one on its latest connection.
	LiveNodes *enginegrpc.LiveNodes

	// Workloads is the latest set of workloads that the node believes it owns.
	// It is nil until the node sends one on its latest connection.
	Workloads *enginegrpc.Workloads

	// Heartbeat is the latest heartbeat that the node sent. It is nil if the
	// node hasn't sent one.
	Heartbeat *enginegrpc.WatchEngineResponse_Heartbeat

	// HeartbeatAt is the time at which the heartbeat arrived, by the clock of
	// the process that runs the Observer. It is the zero time if Heartbeat is
	// nil.
	HeartbeatAt time.Time

	// Heartbeats is the time at which each heartbeat arrived in the last ten
	// minutes, oldest first, by the clock of the process that runs the Observer.
	// It includes heartbeats that arrived on earlier connections of the node.
	Heartbeats []time.Time

	// Connected is true while the node's latest connection is open.
	Connected bool

	// DisconnectedAt is the time at which the node's latest connection ended, by
	// the clock of the process that runs the Observer. It is the zero time while
	// the connection is open.
	DisconnectedAt time.Time

	// Deadline is the time after which the node has stopped reporting, unless
	// another heartbeat arrives first. It is the zero time if the node's
	// heartbeats give no way to calculate one. See [Node.Reporting].
	Deadline time.Time

	// Metrics is what the node has reported in its current call to the metrics
	// API. It is nil while there is no such call: before the first one begins,
	// between calls, and once the node's connection has ended. The values of an
	// ended call are never kept.
	Metrics *Metrics

	// MetricsErr is why the node's latest call to the metrics API ended. It is
	// nil until a call ends, and again once the next call begins. The status
	// code is UNIMPLEMENTED if the node doesn't report metrics, in which case
	// the Observer doesn't call it again on the same connection.
	MetricsErr error
}

// Reporting returns true if the node is reporting at the time now.
//
// A node is reporting until the heartbeat that it last sent has expired. A
// heartbeat expires after the length of time that it gives, or, if it gives
// none, after the shortest heartbeat timeout that any node of the node's
// cluster gave in its preamble. Both are measured from the time that the
// heartbeat arrived.
//
// A node is reporting for as long as its connection is open if it has sent no
// heartbeat, or if its heartbeats give no way to tell when one expires.
func (n Node) Reporting(now time.Time) bool {
	if n.Deadline.IsZero() {
		return n.Connected
	}
	return now.Before(n.Deadline)
}

// Nodes returns every node that the Observer has had a connection from, in no
// particular order.
func (o *Observer) Nodes() []Node {
	o.m.Lock()
	defer o.m.Unlock()

	snapshot := o.snapshot()
	nodes := make([]Node, 0, len(snapshot))
	for _, n := range snapshot {
		nodes = append(nodes, n)
	}

	return nodes
}

// snapshot returns every node that the Observer knows, by node ID. o.m must be
// held.
func (o *Observer) snapshot() map[string]Node {
	timeouts := map[string]time.Duration{}
	for _, e := range o.nodes {
		timeout := e.node.Preamble.GetHeartbeatTimeout().AsDuration()
		if timeout <= 0 {
			continue
		}
		cluster := e.node.Preamble.GetClusterId().AsString()
		if shortest, ok := timeouts[cluster]; !ok || timeout < shortest {
			timeouts[cluster] = timeout
		}
	}

	nodes := make(map[string]Node, len(o.nodes))
	for id, e := range o.nodes {
		n := e.node
		n.Metrics = e.metrics.snapshot()
		n.Heartbeats = slices.Clone(e.heartbeats)

		if n.Heartbeat != nil {
			expiry := e.expiry
			if expiry <= 0 {
				expiry = timeouts[n.Preamble.GetClusterId().AsString()]
			}
			if expiry > 0 {
				n.Deadline = n.HeartbeatAt.Add(expiry)
			}
		}

		nodes[id] = n
	}

	return nodes
}

// idleLimit is how long none of a cluster's nodes may report, before the
// Observer forgets the cluster.
const idleLimit = 3 * 24 * time.Hour

// ForgetIdle forgets every cluster that none of whose nodes has reported for
// three days, at the time now. See [Observer.Forget].
func (o *Observer) ForgetIdle(now time.Time) {
	o.m.Lock()
	defer o.m.Unlock()

	nodes := o.snapshot()

	latest := map[string]time.Time{}
	for _, n := range nodes {
		cluster := n.Preamble.GetClusterId().AsString()
		if t := n.reportedAt(now); t.After(latest[cluster]) {
			latest[cluster] = t
		}
	}

	for id, n := range nodes {
		if now.Sub(latest[n.Preamble.GetClusterId().AsString()]) >= idleLimit {
			o.forget(id)
		}
	}
}

// Forget forgets every node of the cluster, and ends their connections. A node
// that connects again afterward is a new node to the Observer, without the
// history of the one that it forgot.
func (o *Observer) Forget(cluster *uuidpb.UUID) {
	o.m.Lock()
	defer o.m.Unlock()

	for id, e := range o.nodes {
		if e.node.Preamble.GetClusterId().Equal(cluster) {
			o.forget(id)
		}
	}
}

// forget forgets a node. o.m must be held.
func (o *Observer) forget(id string) {
	if c := o.nodes[id].conn; c != nil {
		c.cancel(ErrForgotten)
	}
	delete(o.nodes, id)
}

// reportedAt returns the latest time, up to the time now, at which the node was
// reporting.
func (n Node) reportedAt(now time.Time) time.Time {
	switch {
	case n.Reporting(now):
		return now
	case !n.Deadline.IsZero():
		return n.Deadline
	default:
		return n.DisconnectedAt
	}
}

// Serve observes the node that clients call, until the node's engine API call
// ends or ctx ends. It takes ownership of clients, and closes them before it
// returns, once every call that it made through them has ended.
//
// It also watches the node's metrics, for as long as the engine API call lasts.
// A call to the metrics API that ends is made again after a delay, unless the
// node doesn't report metrics.
//
// It returns nil if the node ended its call with an OK status, and otherwise it
// returns why the call ended. It returns [ErrSuperseded] if a newer connection
// from the same node replaced this one.
func (o *Observer) Serve(ctx context.Context, clients *Clients) error {
	defer clients.Close()

	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)

	stream, err := clients.Engine.WatchEngine(ctx, &enginegrpc.WatchEngineRequest{})
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
	if !preamble.HasNodeId() {
		return errors.New("the preamble has no node ID")
	}

	id := preamble.GetNodeId().AsString()
	c := &connection{cancel}
	o.attach(id, preamble, c)

	var metrics sync.WaitGroup
	metrics.Go(func() {
		o.watchMetrics(ctx, id, preamble.GetClusterId().AsString(), c, clients.Metrics)
	})

	defer func() {
		cancel(nil)
		metrics.Wait()
		o.detach(id, c)
	}()

	for {
		res, err := stream.Recv()
		if err != nil {
			return endOf(ctx, err)
		}

		if res.HasPreamble() {
			return errors.New("the node sent a second preamble")
		}

		if !o.apply(id, c, res) {
			return context.Cause(ctx)
		}
	}
}

// endOf returns the reason that a stream ended, given the error that its Recv
// method returned.
func endOf(ctx context.Context, err error) error {
	if errors.Is(err, io.EOF) {
		return nil
	}
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	return err
}

// connection identifies one call to [Observer.Serve], so that the Observer can
// end it.
type connection struct {
	cancel context.CancelCauseFunc
}

// entry is what an Observer knows about one node ID.
type entry struct {
	node Node

	// conn is the node's latest connection. It is nil once that connection has
	// ended.
	conn *connection

	// expiry is the length of time after which the node's latest heartbeat
	// expires, by its own account. It is zero if it gave none.
	expiry time.Duration

	// heartbeats is the value of [Node.Heartbeats].
	heartbeats []time.Time

	// metrics is the node's current call to the metrics API. It is nil if there
	// is none.
	metrics *metricsCall
}

// attach records the preamble of a new connection from a node. It ends the
// node's earlier connection, if it has one.
func (o *Observer) attach(id string, p *enginegrpc.WatchEngineResponse_Preamble, c *connection) {
	o.m.Lock()
	defer o.m.Unlock()

	e, ok := o.nodes[id]
	if !ok {
		e = &entry{}
		o.nodes[id] = e
	}

	if e.conn != nil {
		e.conn.cancel(ErrSuperseded)
	}

	// The earlier heartbeat stays, because it is still the latest heartbeat
	// that the node sent.
	e.conn = c
	e.node.Preamble = p
	e.node.LiveNodes = nil
	e.node.Workloads = nil
	e.node.Connected = true
	e.node.DisconnectedAt = time.Time{}

	// Nothing that the earlier connection's calls reported is current.
	e.metrics = nil
	e.node.MetricsErr = nil
}

// live returns the entry of the node, if the connection c is still the node's
// latest. It returns nil if a newer connection has replaced c, or if the
// Observer has forgotten the node. o.m must be held.
func (o *Observer) live(id string, c *connection) *entry {
	if e := o.nodes[id]; e != nil && e.conn == c {
		return e
	}
	return nil
}

// detach records that a connection has ended, unless a newer connection from
// the same node has replaced it.
func (o *Observer) detach(id string, c *connection) {
	o.m.Lock()
	defer o.m.Unlock()

	if e := o.live(id, c); e != nil {
		e.conn = nil
		e.node.Connected = false
		e.node.DisconnectedAt = time.Now()
		e.metrics = nil
	}
}

// apply records a response from the connection c. It returns false, and
// records nothing, if c has been replaced.
func (o *Observer) apply(id string, c *connection, res *enginegrpc.WatchEngineResponse) bool {
	o.m.Lock()
	defer o.m.Unlock()

	e := o.live(id, c)
	if e == nil {
		return false
	}

	switch {
	case res.HasLiveNodes():
		e.node.LiveNodes = res.GetLiveNodes()
	case res.HasWorkloads():
		e.node.Workloads = res.GetWorkloads()
	case res.HasHeartbeat():
		h := res.GetHeartbeat()
		e.node.Heartbeat = h
		e.node.HeartbeatAt = time.Now()
		e.expiry = expiryOf(h)

		e.heartbeats = append(e.heartbeats, e.node.HeartbeatAt)
		for e.heartbeats[0].Before(e.node.HeartbeatAt.Add(-historySpan)) {
			e.heartbeats = e.heartbeats[1:]
		}
	}

	return true
}

// expiryOf returns the length of time after which a heartbeat expires, or zero
// if the heartbeat doesn't say.
//
// A heartbeat that gives the time at which it expires, instead of the length
// of time, gives it by the sending node's clock, so the length is the
// difference between that and the time at which it was sent, by the same
// clock.
func expiryOf(h *enginegrpc.WatchEngineResponse_Heartbeat) time.Duration {
	var d time.Duration

	switch {
	case h.HasExpiresAfter():
		d = h.GetExpiresAfter().AsDuration()
	case h.HasExpiresAt() && h.HasSentAt():
		d = h.GetExpiresAt().AsTime().Sub(h.GetSentAt().AsTime())
	}

	return max(d, 0)
}
