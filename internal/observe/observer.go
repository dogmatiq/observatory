package observe

import (
	"cmp"
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

// ErrNoPreamble is the error that [Observer.Serve] returns when the node doesn't
// send its preamble soon enough.
var ErrNoPreamble = errors.New("the node sent no preamble in time")

// preambleTimeout is how long a node has to send its preamble after the Observer
// calls it. A tunnel can be opened by anything that reaches the Observatory, so
// one that sends nothing must not be held open.
const preambleTimeout = 10 * time.Second

// historySpan is how far back the Observer remembers what happened, such as
// when a node sent its heartbeats.
const historySpan = 10 * time.Minute

// Observer holds what the nodes of engines report about themselves.
//
// It learns who each connection is from the ID in the preamble of the node's
// engine API, and keeps one entry for each ID.
//
// The Observer groups nodes by their cluster. An engine that runs as a cluster
// gives the ID of its cluster in its preamble. An engine that doesn't run as a
// cluster is one node, which the Observer treats as the only node of a cluster
// whose ID is the engine's own ID. Wherever the Observatory gives the ID of a
// cluster, it is that ID for such an engine.
type Observer struct {
	m     sync.Mutex
	nodes map[string]*entry

	// records is what the Observer remembers about each cluster that it has had a
	// node of, by the ID of the cluster, even after it has forgotten the nodes.
	records map[string]ClusterRecord

	// remembered is the number of clusters that the Observer has begun to
	// remember, which gives each record its place in [ClusterRecord.seen].
	remembered uint64

	// calls is the number of calls to the metrics API that have begun.
	calls uint64

	// readers is the connection of the node that the Observer calls
	// WatchClusterMetrics on, for each cluster that has one, by the ID of the
	// cluster. See [Observer.watchClusterMetrics].
	readers map[string]*connection

	// released is closed, and replaced, each time that a cluster loses its
	// reader.
	released chan struct{}

	// heartbeats are the channels that [Observer.WatchHeartbeats] returned.
	heartbeats map[chan Heartbeat]struct{}
}

// NewObserver returns an Observer that knows no nodes.
func NewObserver() *Observer {
	return &Observer{
		nodes:      map[string]*entry{},
		records:    map[string]ClusterRecord{},
		readers:    map[string]*connection{},
		released:   make(chan struct{}),
		heartbeats: map[chan Heartbeat]struct{}{},
	}
}

// clusterIDOf returns the ID of the cluster of a node that sent the preamble p.
// It is the ID of the engine's cluster if the engine runs as a cluster, and
// otherwise the ID of the engine itself. See [Observer].
func clusterIDOf(p *enginegrpc.WatchEngineResponse_Preamble) *uuidpb.UUID {
	if p.HasCluster() {
		return p.GetCluster().GetId()
	}
	return p.GetId()
}

// clusterOf returns the ID of the cluster of a node that sent the preamble p,
// as a UUID. See [clusterIDOf].
func clusterOf(p *enginegrpc.WatchEngineResponse_Preamble) string {
	return clusterIDOf(p).AsString()
}

// Heartbeat is a heartbeat that a node sent.
type Heartbeat struct {
	// Cluster is the ID of the node's cluster, as a UUID. See [Observer].
	Cluster string

	// Node is the ID of the node, as a UUID.
	Node string

	// Expiry is how long after it arrived the heartbeat expires, which is when
	// the node stops sending a signal unless another heartbeat arrives first. It
	// is zero if the heartbeat gives no way to calculate it. See
	// [Node.Reporting].
	Expiry time.Duration
}

// WatchHeartbeats returns a channel that receives each heartbeat that a node
// sends, as it arrives. The channel is closed when ctx ends.
//
// A slow receiver misses heartbeats instead of holding up the Observer, so it
// must not rely on seeing every one.
func (o *Observer) WatchHeartbeats(ctx context.Context) <-chan Heartbeat {
	ch := make(chan Heartbeat, 16)

	o.m.Lock()
	o.heartbeats[ch] = struct{}{}
	o.m.Unlock()

	go func() {
		<-ctx.Done()

		o.m.Lock()
		defer o.m.Unlock()

		delete(o.heartbeats, ch)
		close(ch)
	}()

	return ch
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
	// is nil until the node sends one on its latest connection, and stays nil
	// for a node that doesn't report the live nodes of its cluster.
	LiveNodes *enginegrpc.LiveClusterNodes

	// Workloads is the latest set of workloads that the node believes it owns.
	// It is nil until the node sends one on its latest connection, and stays nil
	// for a node that doesn't report its workloads.
	Workloads *enginegrpc.ClusterWorkloads

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

	// Metrics is what the node has reported in its current call to
	// WatchNodeMetrics, which describes only the node's own work, unless the
	// engine doesn't run as a cluster. It is nil while there is no such call:
	// before the first one begins, between calls, and once the node's connection
	// has ended. The values of an ended call are never kept.
	Metrics *Metrics

	// MetricsErr is why the node's latest call to WatchNodeMetrics ended. It is
	// nil until a call ends, and again once the next call begins. The status
	// code is UNIMPLEMENTED if the node doesn't report metrics, in which case
	// the Observer doesn't call it again on the same connection.
	MetricsErr error

	// ClusterMetrics is what the node has reported in its current call to
	// WatchClusterMetrics, which describes the whole cluster. It is nil while
	// there is no such call, in the same way as Metrics. The Observer makes
	// that call to only one node of a cluster at a time, and never to a node
	// whose engine doesn't run as a cluster.
	ClusterMetrics *Metrics

	// ClusterMetricsErr is why the node's latest call to WatchClusterMetrics
	// ended, in the same way as MetricsErr.
	ClusterMetricsErr error
}

// missedHeartbeats is how many heartbeat intervals may pass after a heartbeat
// that doesn't say when it expires, before the node is taken to have stopped
// reporting.
const missedHeartbeats = 3

// Reporting returns true if the node is reporting at the time now.
//
// A node is reporting until the heartbeat that it last sent has expired. A
// heartbeat expires after the length of time that it gives, measured from the
// time that the heartbeat arrived. A heartbeat that gives none expires after
// [missedHeartbeats] of the node's heartbeat intervals, if the node gives an
// interval.
//
// A node is reporting for as long as its connection is open if it has sent no
// heartbeat, or if neither its heartbeats nor its preamble give a way to tell
// when one expires.
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
	nodes := make(map[string]Node, len(o.nodes))
	for id, e := range o.nodes {
		n := e.node
		n.Metrics = e.metrics.snapshot()
		n.ClusterMetrics = e.clusterMetrics.snapshot()
		n.Heartbeats = slices.Clone(e.heartbeats)

		if n.Heartbeat != nil && e.expiry > 0 {
			n.Deadline = n.HeartbeatAt.Add(e.expiry)
		}

		nodes[id] = n
	}

	return nodes
}

// idleLimit is how long none of a cluster's nodes may report, before the
// Observer forgets the cluster.
const idleLimit = 3 * 24 * time.Hour

// ForgetIdle forgets the nodes of every cluster that none of whose nodes has
// reported for three days, at the time now, as [Observer.Forget] does, but keeps
// what it remembers about the cluster itself, as a [ClusterRecord].
//
// It forgets the record too if the Observer began to remember another cluster
// of the same installation after it, which has replaced it, such as when an
// engine that doesn't run as a cluster restarts with a new ID. A cluster that
// nothing has replaced is remembered until the Observer is stopped.
func (o *Observer) ForgetIdle(now time.Time) {
	o.m.Lock()
	defer o.m.Unlock()

	nodes := o.snapshot()

	latest := map[string]time.Time{}
	for _, n := range nodes {
		cluster := clusterOf(n.Preamble)
		if t := n.reportedAt(now); t.After(latest[cluster]) {
			latest[cluster] = t
		}
	}

	for id, n := range nodes {
		if now.Sub(latest[clusterOf(n.Preamble)]) >= idleLimit {
			o.forget(id)
		}
	}

	newest := map[installationKey]uint64{}
	for _, rec := range o.records {
		k := rec.installationKey()
		newest[k] = max(newest[k], rec.seen)
	}

	// A record whose nodes have all been forgotten is of a cluster that has been
	// idle for at least as long.
	for id, rec := range o.records {
		at, ok := latest[id]
		idle := !ok || now.Sub(at) >= idleLimit
		if idle && rec.seen < newest[rec.installationKey()] {
			delete(o.records, id)
		}
	}
}

// ClusterRecord is what an [Observer] remembers about a cluster that it has had
// a node of, which it keeps after it has forgotten the nodes, so that the
// cluster still has a page, and shows as down, until the Observer is stopped.
type ClusterRecord struct {
	// ID is the ID of the cluster, as a UUID. See [Observer].
	ID string

	// Clustered is true if the engine runs as a cluster, and false for an engine
	// that doesn't, whose ID is ID.
	Clustered bool

	Application Application

	// Site is the site that the cluster is deployed to. It is nil if its nodes
	// named none.
	Site *Site

	// seen orders the records by when the Observer began to remember them: a
	// record that it began to remember later has a greater number.
	seen uint64
}

// remember updates what the Observer remembers about the cluster of a node that
// has sent the preamble p. The latest node to connect decides. o.m must be held.
func (o *Observer) remember(p *enginegrpc.WatchEngineResponse_Preamble) {
	id := clusterOf(p)
	rec, ok := o.records[id]
	if !ok {
		o.remembered++
		rec.seen = o.remembered
	}
	rec.ID = id
	rec.Clustered = p.HasCluster()

	if identity := p.GetApplication().GetIdentity(); identity != nil {
		rec.Application = Application{
			Name: identity.GetName(),
			Key:  identity.GetKey().AsString(),
		}
	}
	if site := siteIn(p); site != nil {
		rec.Site = site
	}

	o.records[id] = rec
}

// Record returns what the Observer remembers about the cluster with the given
// ID, if it has ever had a node of it, whether or not it still has one.
func (o *Observer) Record(cluster string) (ClusterRecord, bool) {
	o.m.Lock()
	defer o.m.Unlock()

	rec, ok := o.records[cluster]
	return rec, ok
}

// Records returns what the Observer remembers about every cluster that it has
// had a node of, sorted by the ID of the cluster.
func (o *Observer) Records() []ClusterRecord {
	o.m.Lock()
	defer o.m.Unlock()

	out := make([]ClusterRecord, 0, len(o.records))
	for _, rec := range o.records {
		out = append(out, rec)
	}
	slices.SortFunc(out, func(a, b ClusterRecord) int {
		return cmp.Compare(a.ID, b.ID)
	})

	return out
}

// Forget forgets every node of the cluster, and ends their connections, and
// forgets the cluster itself, which then has no page until a node of it connects
// again. A node that connects again afterward is a new node to the Observer,
// without the history of the one that it forgot.
func (o *Observer) Forget(cluster *uuidpb.UUID) {
	o.m.Lock()
	defer o.m.Unlock()

	delete(o.records, cluster.AsString())

	for id, e := range o.nodes {
		if clusterOf(e.node.Preamble) == cluster.AsString() {
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
// It also watches the node's metrics, for as long as the engine API call lasts:
// the node's own, through WatchNodeMetrics, and, if its engine runs as a
// cluster and no other node of the cluster is being called for them, the
// cluster's, through WatchClusterMetrics. A call to the metrics API that ends
// is made again after a delay, unless the node fails it with UNIMPLEMENTED.
//
// It returns nil if the node ended its call with an OK status, and otherwise it
// returns why the call ended. It returns [ErrSuperseded] if a newer connection
// from the same node replaced this one, and [ErrNoPreamble] if the node doesn't
// send its preamble within 10 seconds.
func (o *Observer) Serve(ctx context.Context, clients *Clients) error {
	defer clients.Close()

	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)

	stream, err := clients.Engine.WatchEngine(ctx, &enginegrpc.WatchEngineRequest{})
	if err != nil {
		return err
	}

	late := time.AfterFunc(preambleTimeout, func() { cancel(ErrNoPreamble) })
	res, err := stream.Recv()
	late.Stop()
	if err != nil {
		return endOf(ctx, err)
	}

	preamble, ok := res.TryGetPreamble()
	if !ok {
		return errors.New("the first response wasn't a preamble")
	}
	if !preamble.HasId() {
		return errors.New("the preamble has no engine ID")
	}
	if preamble.HasCluster() && !preamble.GetCluster().HasId() {
		return errors.New("the preamble has no cluster ID")
	}

	id := preamble.GetId().AsString()
	c := &connection{cancel}
	o.attach(id, preamble, c)

	var metrics sync.WaitGroup
	metrics.Go(func() {
		o.watchNodeMetrics(ctx, id, preamble, c, clients.Metrics)
	})
	if preamble.HasCluster() {
		metrics.Go(func() {
			o.watchClusterMetrics(ctx, id, preamble, c, clients.Metrics)
		})
	}

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

	// metrics is the node's current call to WatchNodeMetrics, and
	// clusterMetrics its current call to WatchClusterMetrics. Each is nil if
	// there is none.
	metrics, clusterMetrics *metricsCall
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
	o.remember(p)
	e.node.LiveNodes = nil
	e.node.Workloads = nil
	e.node.Connected = true
	e.node.DisconnectedAt = time.Time{}

	// Nothing that the earlier connection's calls reported is current.
	e.metrics, e.clusterMetrics = nil, nil
	e.node.MetricsErr, e.node.ClusterMetricsErr = nil, nil
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
		e.metrics, e.clusterMetrics = nil, nil
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
	case res.HasLiveClusterNodes():
		e.node.LiveNodes = res.GetLiveClusterNodes()
	case res.HasClusterWorkloads():
		e.node.Workloads = res.GetClusterWorkloads()
	case res.HasHeartbeat():
		h := res.GetHeartbeat()
		e.node.Heartbeat = h
		e.node.HeartbeatAt = time.Now()
		e.expiry = expiryOf(h)

		// A heartbeat that doesn't say when it expires is late once the node has
		// missed a few of the heartbeats that its interval says it aims to send.
		// This is the Observatory's own rule, because the spec gives none.
		if e.expiry == 0 && e.node.Preamble.GetHeartbeatInterval() != nil {
			e.expiry = missedHeartbeats * e.node.Preamble.GetHeartbeatInterval().AsDuration()
		}

		e.heartbeats = append(e.heartbeats, e.node.HeartbeatAt)
		for e.heartbeats[0].Before(e.node.HeartbeatAt.Add(-historySpan)) {
			e.heartbeats = e.heartbeats[1:]
		}

		beat := Heartbeat{
			Cluster: clusterOf(e.node.Preamble),
			Node:    e.node.Preamble.GetId().AsString(),
			Expiry:  e.expiry,
		}
		for ch := range o.heartbeats {
			select {
			case ch <- beat:
			default:
			}
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
