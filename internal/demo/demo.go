// Package demo simulates a cluster of an application that runs on an engine, so
// that the user interface can be developed and tried without one.
//
// The simulated application is the prototype's example: an account aggregate, a
// statement schedule process, a mailer integration and a balances projection.
// Its numbers move the way those of a busy cluster do, and some of its messages
// fail now and then.
package demo

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/dogmatiq/protobuf/configpb"
	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/identitypb"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/dogmatiq/observatory/internal/observe"
)

const (
	// nodeCount is the number of nodes that the cluster has when they are all up.
	nodeCount = 7

	// workloadCount is the number of workloads that the nodes that are up share.
	workloadCount = 10

	// steadyNodes is how many of the nodes never go down. The others go down and
	// come back, one after another, so that the number of nodes changes.
	steadyNodes = 3
)

// heartbeatIntervals is how often each node sends a heartbeat. They differ, as
// they do between real nodes, so the heartbeats don't arrive in step.
var heartbeatIntervals = []time.Duration{
	2 * time.Second,
	3 * time.Second,
	5 * time.Second,
	2 * time.Second,
	3 * time.Second,
	4 * time.Second,
	5 * time.Second,
}

const (
	// heartbeatTimeout is how long the nodes wait for a heartbeat before they
	// stop counting on it. It exceeds the longest of the nodes' intervals.
	heartbeatTimeout = 15 * time.Second

	// measureInterval is how often the cluster's numbers move, and how often a
	// node reports them.
	measureInterval = time.Second
)

// Run simulates a cluster of seven nodes, and connects each of them to o. Four
// of them go down for a while, now and then, and come back, so that the number
// of nodes, and the workloads that each owns, change.
//
// It returns when ctx ends, or when a node can't be served.
func Run(ctx context.Context, o *observe.Observer) error {
	c := newCluster()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var (
		wg   sync.WaitGroup
		once sync.Once
		err  error
	)

	wg.Go(func() { c.run(ctx) })

	for i := range nodeCount {
		wg.Go(func() {
			if e := c.runNode(ctx, o, i); e != nil {
				once.Do(func() { err = e })
				cancel()
			}
		})
	}

	wg.Wait()
	return err
}

// cluster is the simulated cluster, which the nodes report on.
type cluster struct {
	id         *uuidpb.UUID
	app        *configpb.Application
	nodes      []*uuidpb.UUID
	streams    [2]*uuidpb.UUID
	commandsQ  *uuidpb.UUID
	deadlinesQ *uuidpb.UUID
	account    *uuidpb.UUID
	schedule   *uuidpb.UUID
	mailer     *uuidpb.UUID
	balances   *uuidpb.UUID
	archive    *uuidpb.UUID

	// reconciliation is a process that schedules no deadlines.
	reconciliation *uuidpb.UUID
	randomness     *rand.Rand
	m              sync.Mutex

	// live is whether each node is up. The nodes that are up share the workloads,
	// and changed is closed, and replaced, each time that it changes.
	live         []bool
	workloadKeys []*uuidpb.UUID
	changed      chan struct{}

	ticks       int
	accumulated map[string]float64
	totals      map[string]uint64

	// shares is, for each running total, how much of it each node has counted.
	// A node's share only grows.
	shares map[string][]float64
	state  state

	// profile is the index in [profiles] of what the nodes support now.
	profile int
}

// state is the part of the cluster's state that is a number at a moment, not a
// running total.
type state struct {
	commandsQueued, deadlinesQueued int
	failing, failingDeadlines       int
	eventsPending                   int

	// reconciling is the number of instances of the reconciliation process that
	// are in progress.
	reconciling int
}

func newCluster() *cluster {
	c := &cluster{
		id:             uuidpb.Generate(),
		streams:        [2]*uuidpb.UUID{uuidpb.Generate(), uuidpb.Generate()},
		commandsQ:      uuidpb.Generate(),
		deadlinesQ:     uuidpb.Generate(),
		account:        uuidpb.Generate(),
		schedule:       uuidpb.Generate(),
		mailer:         uuidpb.Generate(),
		balances:       uuidpb.Generate(),
		archive:        uuidpb.Generate(),
		reconciliation: uuidpb.Generate(),
		randomness:     rand.New(rand.NewPCG(1, 2)),
		accumulated:    map[string]float64{},
		totals:         map[string]uint64{},
		shares:         map[string][]float64{},
		state:          state{deadlinesQueued: 19},
	}

	for range nodeCount {
		c.nodes = append(c.nodes, uuidpb.Generate())
		c.live = append(c.live, true)
	}
	for range workloadCount {
		c.workloadKeys = append(c.workloadKeys, uuidpb.Generate())
	}
	c.changed = make(chan struct{})

	c.app = configpb.Application_builder{
		Identity: identity("statements", uuidpb.Generate()),
		Handlers: []*configpb.Handler{
			handler("account", c.account, configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil),
			handler("statement-schedule", c.schedule, configpb.HandlerType_HANDLER_TYPE_PROCESS,
				map[string]*configpb.MessageUsage{
					"statements.StatementDue": configpb.MessageUsage_builder{
						IsProduced: true, IsConsumed: true,
					}.Build(),
				}),
			minimizingHandler("mailer", c.mailer, configpb.HandlerType_HANDLER_TYPE_INTEGRATION),
			handler("balances", c.balances, configpb.HandlerType_HANDLER_TYPE_PROJECTION, nil),
			handler("archive", c.archive, configpb.HandlerType_HANDLER_TYPE_PROJECTION, nil),
			handler("reconciliation", c.reconciliation, configpb.HandlerType_HANDLER_TYPE_PROCESS, nil),
		},
		Messages: map[string]configpb.MessageKind{
			"statements.StatementDue": configpb.MessageKind_MESSAGE_KIND_DEADLINE,
		},
	}.Build()

	return c
}

func identity(name string, key *uuidpb.UUID) *identitypb.Identity {
	return identitypb.Identity_builder{Name: name, Key: key}.Build()
}

func handler(
	name string,
	key *uuidpb.UUID,
	t configpb.HandlerType,
	messages map[string]*configpb.MessageUsage,
) *configpb.Handler {
	return configpb.Handler_builder{
		Identity: identity(name, key),
		Type:     t,
		Messages: messages,
	}.Build()
}

// minimizingHandler is a handler that asks the engine to minimize concurrency.
func minimizingHandler(name string, key *uuidpb.UUID, t configpb.HandlerType) *configpb.Handler {
	return configpb.Handler_builder{
		Identity:              identity(name, key),
		Type:                  t,
		ConcurrencyPreference: configpb.ConcurrencyPreference_CONCURRENCY_PREFERENCE_MINIMIZE,
	}.Build()
}

// run moves the cluster's numbers once for each measureInterval, until ctx ends.
func (c *cluster) run(ctx context.Context) {
	ticker := time.NewTicker(measureInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.advance()
		}
	}
}

// grow adds an amount that may be a fraction of one to a running total, which
// only counts whole numbers.
func (c *cluster) grow(name string, amount float64) uint64 {
	c.accumulated[name] += amount
	whole := math.Floor(c.accumulated[name])
	c.accumulated[name] -= whole
	c.totals[name] += uint64(whole)

	// Each node that is up counts a part of what happened, in proportion to the
	// workloads that it owns.
	if c.shares[name] == nil {
		c.shares[name] = make([]float64, nodeCount)
	}
	weights := c.weights()
	var all int
	for _, w := range weights {
		all += w
	}
	if all > 0 {
		for i, w := range weights {
			c.shares[name][i] += whole * float64(w) / float64(all)
		}
	}

	return uint64(whole)
}

// walk moves a number up or down by one or two now and then, within limits.
func (c *cluster) walk(n, low, high int) int {
	switch r := c.randomness.IntN(10); {
	case r < 3:
		n -= 1 + c.randomness.IntN(2)
	case r > 6:
		n += 1 + c.randomness.IntN(2)
	}
	return max(low, min(high, n))
}

// advance moves the cluster's numbers on by one measureInterval.
func (c *cluster) advance() {
	c.m.Lock()
	defer c.m.Unlock()

	c.ticks++
	t := float64(c.ticks)
	c.profile = profileAt(c.ticks)

	// The rate of events swells and falls away over a few minutes.
	events := math.Max(0, 5+3*math.Sin(t/25)+c.randomness.Float64()*2)
	recorded := c.grow("recorded.account", events)
	c.grow("stream.0", float64(recorded)*0.63)
	c.grow("stream.1", float64(recorded)*0.37)

	c.grow("commands.account", events)
	c.grow("handled.schedule", events*0.8)
	c.grow("handled.balances", events)
	c.grow("handled.reconciliation", events*0.5)

	delivered := c.grow("commands.mailer", 0.4+c.randomness.Float64())
	scheduled := c.grow("deadlines.schedule", 0.8+c.randomness.Float64()*0.6)
	canceled := c.grow("canceled.schedule", 0.2*c.randomness.Float64())
	c.grow("ended.schedule", 0.3*c.randomness.Float64())

	c.grow("removed.commands", float64(recorded+delivered))
	c.grow("removed.deadlines", float64(scheduled+canceled))

	c.state.commandsQueued = c.walk(c.state.commandsQueued, 0, 4)
	c.state.deadlinesQueued = c.walk(c.state.deadlinesQueued, 10, 30)
	c.state.eventsPending = c.walk(c.state.eventsPending, 0, 6)
	c.state.reconciling = c.walk(c.state.reconciling, 4, 14)

	// Commands for the mailer fail for twenty seconds in every forty, so that
	// failures begin and end often enough to watch. There are more of them as the
	// twenty seconds go on.
	c.state.failing = 0
	if at := c.ticks % 40; at >= 10 && at < 30 {
		c.state.failing = 1 + (at-10)/7
	}

	// Deadlines for the process fail for twenty seconds in every forty too, but
	// begin ten seconds after the mailer's commands do, so that the two overlap
	// for ten seconds of each forty, and are alone for ten seconds each.
	c.state.failingDeadlines = 0
	if at := c.ticks % 40; at >= 20 {
		c.state.failingDeadlines = 1 + (at-20)/7
	}
}

// supported is the metrics that each node reports, in the order of their
// indexes in the preamble of its call.
var supported = []struct {
	message proto.Message
	reach   metricsgrpc.Reach
}{
	{new(metricsgrpc.EventStreamLength), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.QueueCommandsPending), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.QueueDeadlinesPending), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.QueueCommandsFailing), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.QueueDeadlinesFailing), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.QueueCommandsRemoved), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.QueueDeadlinesRemoved), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.HandlerCommandsPending), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.HandlerDeadlinesPending), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.HandlerEventsPending), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.HandlerCommandsFailing), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.HandlerDeadlinesFailing), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.HandlerCommandsHandled), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.HandlerDeadlinesHandled), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.HandlerDeadlinesCanceled), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.HandlerEventsRecorded), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.HandlerEventsHandled), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.ProcessInstancesEnded), metricsgrpc.Reach_REACH_NODE},
	{new(metricsgrpc.AggregateInstanceEventStreamBindings), metricsgrpc.Reach_REACH_CLUSTER},
	{new(metricsgrpc.ProcessInstanceQueueBindings), metricsgrpc.Reach_REACH_CLUSTER},
}

// A profile is what the nodes support at a time, which is every metric but the
// ones that it leaves out. The cluster moves from one profile to the next, so
// that the user interface can be seen to respond as support begins and ends. A
// node that supports something different ends its call to the metrics API and
// makes it again.
var profiles = [][]proto.Message{
	// Everything.
	nil,

	// Only the rates of events and of removing messages, and no totals of them.
	{
		new(metricsgrpc.EventStreamLength),
		new(metricsgrpc.QueueCommandsPending),
		new(metricsgrpc.QueueDeadlinesPending),
	},

	// Only the totals, and none of the rates.
	{
		new(metricsgrpc.HandlerEventsRecorded),
		new(metricsgrpc.QueueCommandsRemoved),
		new(metricsgrpc.QueueDeadlinesRemoved),
	},

	// Nothing about instances, or about what each node handles.
	{
		new(metricsgrpc.AggregateInstanceEventStreamBindings),
		new(metricsgrpc.ProcessInstanceQueueBindings),
		new(metricsgrpc.HandlerCommandsHandled),
		new(metricsgrpc.HandlerEventsHandled),
	},
}

// The profile changes every profileInterval ticks, from the first change at
// profileStart.
const (
	profileStart    = 60
	profileInterval = 40
)

// profileAt returns the index of the profile that the nodes have after the given
// number of ticks.
func profileAt(ticks int) int {
	if ticks < profileStart {
		return 0
	}
	return ((ticks-profileStart)/profileInterval + 1) % len(profiles)
}

// supportedBy returns the metrics of [supported] that a profile doesn't leave
// out.
func supportedBy(profile int) []int {
	var out []int
loop:
	for i, m := range supported {
		for _, left := range profiles[profile] {
			if proto.MessageName(left) == proto.MessageName(m.message) {
				continue loop
			}
		}
		out = append(out, i)
	}
	return out
}

// indexOf returns the index of a metric in [supported].
func indexOf(m proto.Message) uint32 {
	name := proto.MessageName(m)
	for i, s := range supported {
		if proto.MessageName(s.message) == name {
			return uint32(i)
		}
	}
	panic("unsupported metric: " + string(name))
}

// reading is one sample that a node is ready to send.
type reading struct {
	metric  uint32
	subject string
	value   proto.Message
}

// readings returns what a node reports now.
func (c *cluster) readings(node int) []reading {
	c.m.Lock()
	defer c.m.Unlock()

	var out []reading
	add := func(m proto.Message, subject *uuidpb.UUID) {
		out = append(out, reading{indexOf(m), subject.AsString(), m})
	}
	part := func(name string) uint64 {
		if len(c.shares[name]) == 0 {
			return 0
		}
		return uint64(c.shares[name][node])
	}

	for i, id := range c.streams {
		add(metricsgrpc.EventStreamLength_builder{
			EventStreamId: id,
			Value:         c.totals[fmt.Sprintf("stream.%d", i)],
		}.Build(), id)
	}

	add(metricsgrpc.QueueCommandsPending_builder{QueueId: c.commandsQ, Value: uint64(max(c.state.commandsQueued, c.state.failing))}.Build(), c.commandsQ)
	add(metricsgrpc.QueueDeadlinesPending_builder{QueueId: c.deadlinesQ, Value: uint64(c.state.deadlinesQueued)}.Build(), c.deadlinesQ)
	add(metricsgrpc.QueueCommandsFailing_builder{QueueId: c.commandsQ, Value: uint64(c.state.failing)}.Build(), c.commandsQ)
	add(metricsgrpc.QueueDeadlinesFailing_builder{QueueId: c.deadlinesQ, Value: uint64(c.state.failingDeadlines)}.Build(), c.deadlinesQ)
	add(metricsgrpc.QueueCommandsRemoved_builder{QueueId: c.commandsQ, Value: part("removed.commands")}.Build(), c.commandsQ)
	add(metricsgrpc.QueueDeadlinesRemoved_builder{QueueId: c.deadlinesQ, Value: part("removed.deadlines")}.Build(), c.deadlinesQ)

	add(metricsgrpc.HandlerCommandsPending_builder{HandlerKey: c.account, Value: 0}.Build(), c.account)
	// A message that is failing is still waiting, so there are always at least as
	// many waiting as there are failing.
	add(metricsgrpc.HandlerCommandsPending_builder{HandlerKey: c.mailer, Value: uint64(max(c.state.commandsQueued, c.state.failing))}.Build(), c.mailer)
	add(metricsgrpc.HandlerCommandsFailing_builder{HandlerKey: c.mailer, Value: uint64(c.state.failing)}.Build(), c.mailer)
	add(metricsgrpc.HandlerDeadlinesPending_builder{HandlerKey: c.schedule, Value: uint64(c.state.deadlinesQueued)}.Build(), c.schedule)
	add(metricsgrpc.HandlerDeadlinesFailing_builder{HandlerKey: c.schedule, Value: uint64(c.state.failingDeadlines)}.Build(), c.schedule)
	add(metricsgrpc.HandlerEventsPending_builder{HandlerKey: c.schedule, Value: uint64(c.state.eventsPending)}.Build(), c.schedule)
	add(metricsgrpc.HandlerEventsPending_builder{HandlerKey: c.balances, Value: uint64(c.state.eventsPending / 2)}.Build(), c.balances)

	add(metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: c.account, Value: part("commands.account")}.Build(), c.account)
	add(metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: c.mailer, Value: part("commands.mailer")}.Build(), c.mailer)
	add(metricsgrpc.HandlerDeadlinesHandled_builder{HandlerKey: c.schedule, Value: part("deadlines.schedule")}.Build(), c.schedule)
	add(metricsgrpc.HandlerDeadlinesCanceled_builder{HandlerKey: c.schedule, Value: part("canceled.schedule")}.Build(), c.schedule)
	add(metricsgrpc.ProcessInstancesEnded_builder{HandlerKey: c.schedule, Value: part("ended.schedule")}.Build(), c.schedule)
	add(metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: c.account, Value: part("recorded.account")}.Build(), c.account)
	add(metricsgrpc.HandlerEventsHandled_builder{HandlerKey: c.schedule, Value: part("handled.schedule")}.Build(), c.schedule)
	add(metricsgrpc.HandlerEventsHandled_builder{HandlerKey: c.balances, Value: part("handled.balances")}.Build(), c.balances)
	add(metricsgrpc.HandlerEventsHandled_builder{HandlerKey: c.reconciliation, Value: part("handled.reconciliation")}.Build(), c.reconciliation)
	add(metricsgrpc.HandlerEventsPending_builder{HandlerKey: c.reconciliation, Value: uint64(c.state.eventsPending / 3)}.Build(), c.reconciliation)

	// The archive projection never has anything to do, so its chart is empty.
	add(metricsgrpc.HandlerEventsHandled_builder{HandlerKey: c.archive, Value: 0}.Build(), c.archive)
	add(metricsgrpc.HandlerEventsPending_builder{HandlerKey: c.archive, Value: 0}.Build(), c.archive)

	for i, instances := range []uint64{63, 37} {
		out = append(out, reading{
			indexOf(new(metricsgrpc.AggregateInstanceEventStreamBindings)),
			c.account.AsString() + c.streams[i].AsString(),
			metricsgrpc.AggregateInstanceEventStreamBindings_builder{
				HandlerKey: c.account, EventStreamId: c.streams[i], Value: instances,
			}.Build(),
		})
	}
	out = append(out, reading{
		indexOf(new(metricsgrpc.ProcessInstanceQueueBindings)),
		c.schedule.AsString() + c.deadlinesQ.AsString(),
		metricsgrpc.ProcessInstanceQueueBindings_builder{
			HandlerKey: c.schedule, QueueId: c.deadlinesQ, Value: uint64(c.state.deadlinesQueued),
		}.Build(),
	})

	// The reconciliation process schedules no deadlines, so its instances in
	// progress are bound to no queue.
	out = append(out, reading{
		indexOf(new(metricsgrpc.ProcessInstanceQueueBindings)),
		c.reconciliation.AsString(),
		metricsgrpc.ProcessInstanceQueueBindings_builder{
			HandlerKey: c.reconciliation, Value: uint64(c.state.reconciling),
		}.Build(),
	})

	return out
}

// weights returns how many workloads each node owns. c.m must be held.
func (c *cluster) weights() []int {
	var up []int
	for i, ok := range c.live {
		if ok {
			up = append(up, i)
		}
	}

	weights := make([]int, nodeCount)
	if len(up) == 0 {
		return weights
	}

	// The workloads are dealt out to the nodes that are up, in turn.
	for w := range c.workloadKeys {
		weights[up[w%len(up)]]++
	}

	return weights
}

// setLive records that a node has come up or gone down, which changes who owns
// each workload, and tells the nodes. A node that comes up counts from zero, as
// a node that starts again does.
func (c *cluster) setLive(node int, up bool) {
	c.m.Lock()
	defer c.m.Unlock()

	if up && !c.live[node] {
		for _, shares := range c.shares {
			shares[node] = 0
		}
	}

	c.live[node] = up
	close(c.changed)
	c.changed = make(chan struct{})
}

// membership returns the nodes that are up, the workloads that a node owns, and a
// channel that is closed when either changes.
func (c *cluster) membership(node int) ([]*uuidpb.UUID, []*enginegrpc.Workload, <-chan struct{}) {
	c.m.Lock()
	defer c.m.Unlock()

	var live []*uuidpb.UUID
	var up []int
	for i, ok := range c.live {
		if ok {
			live = append(live, c.nodes[i])
			up = append(up, i)
		}
	}

	var owned []*enginegrpc.Workload
	for w, key := range c.workloadKeys {
		if len(up) > 0 && up[w%len(up)] == node && c.live[node] {
			owned = append(owned, enginegrpc.Workload_builder{Key: key}.Build())
		}
	}

	return live, owned, c.changed
}

// runNode runs one node of the cluster. A node that is not steady goes down
// after a while, for a while, and then comes back, again and again.
func (c *cluster) runNode(ctx context.Context, o *observe.Observer, node int) error {
	if node < steadyNodes {
		return c.serveNode(ctx, o, node)
	}

	// Each node has a rhythm of its own, which is the same on each run.
	r := rand.New(rand.NewPCG(uint64(node), 7))
	seconds := func(from, spread int) time.Duration {
		return time.Duration(from+r.IntN(spread)) * time.Second
	}

	up := seconds(60, 40)

	for {
		upCtx, stop := context.WithTimeout(ctx, up)
		deadline, _ := upCtx.Deadline()
		err := c.serveNode(upCtx, o, node)
		stop()

		// A call that gRPC ends at the deadline can report it a moment before the
		// context does, which is the node going down as planned, and not a failure.
		if !time.Now().Before(deadline) {
			err = nil
		}

		c.setLive(node, false)

		if ctx.Err() != nil {
			return nil
		}
		if err != nil {
			return err
		}

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(seconds(20, 25)):
		}

		up = seconds(45, 45)
		c.setLive(node, true)
	}
}

// serveNode runs one node of the cluster, with its gRPC server in this process,
// and serves it to o until ctx ends.
func (c *cluster) serveNode(ctx context.Context, o *observe.Observer, node int) error {
	listener, dialer := observe.InProcess()

	server := grpc.NewServer()
	enginegrpc.RegisterEngineAPIServer(server, &engineServer{c: c, node: node})
	metricsgrpc.RegisterMetricsAPIServer(server, &metricsServer{c: c, node: node})

	go server.Serve(listener)
	defer server.Stop()

	clients, err := observe.NewClients(dialer)
	if err != nil {
		return err
	}
	defer clients.Close()

	err = o.Serve(ctx, clients)
	if ctx.Err() != nil {
		return nil
	}
	return err
}

type engineServer struct {
	enginegrpc.UnimplementedEngineAPIServer
	c    *cluster
	node int
}

func (s *engineServer) WatchEngine(
	_ *enginegrpc.WatchEngineRequest,
	stream grpc.ServerStreamingServer[enginegrpc.WatchEngineResponse],
) error {
	c := s.c

	err := stream.Send(enginegrpc.WatchEngineResponse_builder{
		Preamble: enginegrpc.WatchEngineResponse_Preamble_builder{
			NodeId:            c.nodes[s.node],
			ClusterId:         c.id,
			Application:       c.app,
			HeartbeatInterval: durationpb.New(heartbeatIntervals[s.node]),
			HeartbeatTimeout:  durationpb.New(heartbeatTimeout),
			Description:       "simulated node",
		}.Build(),
	}.Build())
	if err != nil {
		return err
	}

	// membership tells the page which nodes are up, and which workloads this
	// node owns, now and each time that they change.
	changed, err := s.sendMembership(stream)
	if err != nil {
		return err
	}

	// The nodes start their heartbeats at different moments, so that they are
	// out of step from the first.
	select {
	case <-stream.Context().Done():
		return stream.Context().Err()
	case <-time.After(heartbeatIntervals[s.node] * time.Duration(s.node) / nodeCount):
	}

	ticker := time.NewTicker(heartbeatIntervals[s.node])
	defer ticker.Stop()

	for {
		beat := enginegrpc.WatchEngineResponse_builder{
			Heartbeat: enginegrpc.WatchEngineResponse_Heartbeat_builder{
				SentAt: timestamppb.Now(),
			}.Build(),
		}.Build()
		if err := stream.Send(beat); err != nil {
			return err
		}

		for waiting := true; waiting; {
			select {
			case <-stream.Context().Done():
				return stream.Context().Err()
			case <-changed:
				if changed, err = s.sendMembership(stream); err != nil {
					return err
				}
			case <-ticker.C:
				waiting = false
			}
		}
	}
}

// sendMembership sends the nodes that are up and the workloads that the node
// owns, and returns a channel that is closed when either changes.
func (s *engineServer) sendMembership(
	stream grpc.ServerStreamingServer[enginegrpc.WatchEngineResponse],
) (<-chan struct{}, error) {
	live, owned, changed := s.c.membership(s.node)

	for _, b := range []enginegrpc.WatchEngineResponse_builder{
		{LiveNodes: enginegrpc.LiveNodes_builder{NodeIds: live}.Build()},
		{Workloads: enginegrpc.Workloads_builder{Workloads: owned}.Build()},
	} {
		if err := stream.Send(b.Build()); err != nil {
			return nil, err
		}
	}

	return changed, nil
}

type metricsServer struct {
	metricsgrpc.UnimplementedMetricsAPIServer
	c    *cluster
	node int
}

func (s *metricsServer) WatchMetrics(
	_ *metricsgrpc.WatchMetricsRequest,
	stream grpc.ServerStreamingServer[metricsgrpc.WatchMetricsResponse],
) error {
	c := s.c

	c.m.Lock()
	profile := c.profile
	c.m.Unlock()

	// The metrics that the node supports now, and the index of each in the list
	// that its preamble gives.
	var metrics []*metricsgrpc.SupportedMetric
	indexes := map[uint32]uint32{}
	for _, i := range supportedBy(profile) {
		m := supported[i]
		reach := m.reach
		indexes[uint32(i)] = uint32(len(metrics))
		metrics = append(metrics, metricsgrpc.SupportedMetric_builder{
			MessageName: string(proto.MessageName(m.message)),
			Reach:       &reach,
		}.Build())
	}

	err := stream.Send(metricsgrpc.WatchMetricsResponse_builder{
		Preamble: metricsgrpc.WatchMetricsResponse_Preamble_builder{
			NodeId:           c.nodes[s.node],
			ClusterId:        c.id,
			Application:      c.app,
			SupportedMetrics: metrics,
		}.Build(),
	}.Build())
	if err != nil {
		return err
	}

	// A node sends a sample only when the value changes.
	type series struct {
		metric  uint32
		subject string
	}
	sent := map[series][]byte{}

	ticker := time.NewTicker(measureInterval)
	defer ticker.Stop()

	for {
		revision := make([]byte, 8)
		binary.BigEndian.PutUint64(revision, uint64(time.Now().UnixNano()))

		// A node that supports something else now says so by making its call again.
		c.m.Lock()
		changed := c.profile != profile
		c.m.Unlock()
		if changed {
			return status.Error(codes.Unavailable, "the supported metrics changed")
		}

		for _, r := range c.readings(s.node) {
			index, ok := indexes[r.metric]
			if !ok {
				continue
			}

			value, err := proto.Marshal(r.value)
			if err != nil {
				return err
			}

			k := series{index, r.subject}
			if old, ok := sent[k]; ok && string(old) == string(value) {
				continue
			}
			sent[k] = value

			err = stream.Send(metricsgrpc.WatchMetricsResponse_builder{
				Sample: metricsgrpc.WatchMetricsResponse_Sample_builder{
					MetricIndex: index,
					Subject:     []byte(r.subject),
					Value:       value,
					Revision:    revision,
				}.Build(),
			}.Build())
			if err != nil {
				return err
			}
		}

		select {
		case <-stream.Context().Done():
			return stream.Context().Err()
		case <-ticker.C:
		}
	}
}
