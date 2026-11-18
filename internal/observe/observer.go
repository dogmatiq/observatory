package observe

import (
	"context"
	"errors"
	"io"
	"sync"
	"time"

	"github.com/dogmatiq/protobuf/enginegrpc"
)

// ErrSuperseded is the error that [Observer.Serve] returns when a newer
// connection from the same node replaced the one that it was serving.
var ErrSuperseded = errors.New("the node connected again")

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

	// Connected is true while the node's latest connection is open.
	Connected bool

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

	nodes := make([]Node, 0, len(o.nodes))
	for _, e := range o.nodes {
		n := e.node
		n.Metrics = e.metrics.snapshot()

		if n.Heartbeat != nil {
			expiry := e.expiry
			if expiry <= 0 {
				expiry = timeouts[n.Preamble.GetClusterId().AsString()]
			}
			if expiry > 0 {
				n.Deadline = n.HeartbeatAt.Add(expiry)
			}
		}

		nodes = append(nodes, n)
	}

	return nodes
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

	// Nothing that the earlier connection's calls reported is current.
	e.metrics = nil
	e.node.MetricsErr = nil
}

// detach records that a connection has ended, unless a newer connection from
// the same node has replaced it.
func (o *Observer) detach(id string, c *connection) {
	o.m.Lock()
	defer o.m.Unlock()

	if e := o.nodes[id]; e.conn == c {
		e.conn = nil
		e.node.Connected = false
		e.metrics = nil
	}
}

// apply records a response from the connection c. It returns false, and
// records nothing, if c has been replaced.
func (o *Observer) apply(id string, c *connection, res *enginegrpc.WatchEngineResponse) bool {
	o.m.Lock()
	defer o.m.Unlock()

	e := o.nodes[id]
	if e.conn != c {
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
