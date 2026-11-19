package observe_test

import (
	"context"
	"math"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/configpb"
	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/identitypb"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/protobuf/proto"

	. "github.com/dogmatiq/observatory/internal/observe"
)

func name(m proto.Message) string {
	return string(proto.MessageName(m))
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

// appOf is an application with the given handlers, which has one deadline
// message type.
func appOf(name string, key *uuidpb.UUID, handlers ...*configpb.Handler) *configpb.Application {
	return configpb.Application_builder{
		Identity: identity(name, key),
		Handlers: handlers,
		Messages: map[string]configpb.MessageKind{
			"example.Deadline": configpb.MessageKind_MESSAGE_KIND_DEADLINE,
			"example.Command":  configpb.MessageKind_MESSAGE_KIND_COMMAND,
			"example.Event":    configpb.MessageKind_MESSAGE_KIND_EVENT,
		},
	}.Build()
}

// startApp connects a node of the cluster that runs the application, and begins
// its call to the metrics API.
func startApp(
	t *testing.T,
	ctx context.Context,
	o *Observer,
	cluster *uuidpb.UUID,
	app *configpb.Application,
	supported ...*metricsgrpc.SupportedMetric,
) *metricsNode {
	t.Helper()
	return startAppInSite(t, ctx, o, cluster, nil, app, supported...)
}

// startAppInSite is like startApp, for a node that names a site, if site isn't
// nil.
func startAppInSite(
	t *testing.T,
	ctx context.Context,
	o *Observer,
	cluster *uuidpb.UUID,
	site *identitypb.Identity,
	app *configpb.Application,
	supported ...*metricsgrpc.SupportedMetric,
) *metricsNode {
	t.Helper()

	n := &metricsNode{ID: uuidpb.Generate()}
	n.Engine = connect(ctx, o)

	b := preamble(n.ID, cluster, 0, 0)
	b.Preamble.SetApplication(app)
	if site != nil {
		b.Preamble.SetSite(site)
	}
	send(t, n.Engine, b)

	n.Metrics = <-n.Engine.Calls
	n.sendMetrics(t, metricsgrpc.WatchMetricsResponse_builder{
		Preamble: metricsgrpc.WatchMetricsResponse_Preamble_builder{
			NodeId:           n.ID,
			ClusterId:        cluster,
			Application:      app,
			SupportedMetrics: supported,
		}.Build(),
	})

	return n
}

func viewOf(t testing.TB, r *Recorder, o *Observer, cluster *uuidpb.UUID) ClusterView {
	t.Helper()

	v, ok := r.View(time.Now(), o.Nodes(), cluster.AsString())
	if !ok {
		t.Fatalf("unknown cluster: %s", cluster)
	}
	return v
}

func expectFloat(t testing.TB, got *float64, want float64) {
	t.Helper()

	if got == nil {
		t.Fatalf("unexpected value: got none, want %g", want)
	}
	if math.Abs(*got-want) > 1e-9 {
		t.Fatalf("unexpected value: got %g, want %g", *got, want)
	}
}

func TestOverview(t *testing.T) {
	const reach = metricsgrpc.Reach_REACH_CLUSTER

	t.Run("func Clusters()", func(t *testing.T) {
		t.Run("it lists each cluster once, with the name of its application", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				a, b := uuidpb.Generate(), uuidpb.Generate()
				appKey := uuidpb.Generate()

				n1 := startApp(t, ctx, o, a, appOf("statements", appKey))
				n2 := startApp(t, ctx, o, a, appOf("statements", appKey))
				n3 := startApp(t, ctx, o, b, appOf("billing", uuidpb.Generate()))

				got := Clusters(time.Now(), o.Nodes())
				if len(got) != 2 {
					t.Fatalf("unexpected number of clusters: got %d, want 2", len(got))
				}

				names := map[string]string{}
				for _, c := range got {
					names[c.ID] = c.Application.Name
				}
				if names[a.AsString()] != "statements" || names[b.AsString()] != "billing" {
					t.Fatalf("unexpected clusters: %v", names)
				}

				if got[0].ID > got[1].ID {
					t.Fatalf("clusters are not sorted by ID: %v", got)
				}

				cancel()
				<-n1.Engine.Done
				<-n2.Engine.Done
				<-n3.Engine.Done
			})
		})
		t.Run("when nodes name a site", func(t *testing.T) {
			t.Run("it gives the name of the site that the cluster's nodes name, and none otherwise", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					a, b := uuidpb.Generate(), uuidpb.Generate()

					n1 := startAppInSite(t, ctx, o, a, identity("eu-west", uuidpb.Generate()), appOf("statements", uuidpb.Generate()))
					n2 := startApp(t, ctx, o, b, appOf("billing", uuidpb.Generate()))

					sites := map[string]string{}
					for _, c := range Clusters(time.Now(), o.Nodes()) {
						sites[c.ID] = c.Site
					}
					if sites[a.AsString()] != "eu-west" || sites[b.AsString()] != "" {
						t.Fatalf("unexpected sites: %v", sites)
					}

					cancel()
					<-n1.Engine.Done
					<-n2.Engine.Done
				})
			})
		})
	})

	t.Run("func View()", func(t *testing.T) {
		t.Run("it reports that a cluster is unknown", func(t *testing.T) {
			if _, ok := NewRecorder().View(time.Now(), nil, uuidpb.Generate().AsString()); ok {
				t.Fatal("unexpected view of an unknown cluster")
			}
		})

		t.Run("it gives the application's name and key", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c, key := uuidpb.Generate(), uuidpb.Generate()

				n := startApp(t, ctx, o, c, appOf("statements", key))

				v := viewOf(t, r, o, c)
				if v.Application.Name != "statements" || v.Application.Key != key.AsString() {
					t.Fatalf("unexpected application: %+v", v.Application)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("when a node supports no metrics", func(t *testing.T) {
			t.Run("it has no tiles that need them, and a card with no numbers for each handler", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate(),
						handler("account", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil),
					))

					v := viewOf(t, r, o, c)
					if v.Overview.Events != nil || v.Overview.Queues != nil {
						t.Fatal("unexpected tiles")
					}
					if len(v.Overview.Handlers) != 1 {
						t.Fatalf("unexpected number of handlers: got %d, want 1", len(v.Overview.Handlers))
					}

					s := v.Overview.Handlers[0].Summary
					if s.QueuedMessages != nil || s.Instances != nil {
						t.Fatalf("unexpected numbers: %+v", s)
					}
					if v.Overview.Handlers[0].History != nil {
						t.Fatal("unexpected chart")
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when a part of a tile has no metric that a node supports", func(t *testing.T) {
			t.Run("it leaves the part out, and keeps the tile for the parts that remain", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					// Only the length of event streams, and only the removal of messages.
					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.EventStreamLength)), reach),
						supports(name(new(metricsgrpc.QueueCommandsRemoved)), metricsgrpc.Reach_REACH_NODE),
					)

					v := viewOf(t, r, o, c)
					if e := v.Overview.Events; e == nil || e.Streams == nil || e.Rate != nil || e.History != nil {
						t.Fatalf("unexpected events tile: %+v", e)
					}
					if q := v.Overview.Queues; q == nil || q.Queues != nil || q.Throughput == nil || q.History == nil {
						t.Fatalf("unexpected queues tile: %+v", q)
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it shows a tile for a rate on its own, with a chart and no streams", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.HandlerEventsRecorded)), metricsgrpc.Reach_REACH_NODE),
					)

					e := viewOf(t, r, o, c).Overview.Events
					if e == nil || e.Streams != nil || e.Rate == nil || e.Rate.PerSecond != nil || e.History == nil {
						t.Fatalf("unexpected events tile: %+v", e)
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it gives a handler no bindings where no node supports them, and an empty list where one does", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate(),
						handler("account", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil),
						handler("schedule", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_PROCESS, nil),
					),
						supports(name(new(metricsgrpc.AggregateInstanceEventStreamBindings)), reach),
					)

					for _, h := range viewOf(t, r, o, c).Overview.Handlers {
						if got, want := h.Summary.Bindings != nil, h.Name == "account"; got != want {
							t.Fatalf("unexpected bindings of %s: %v", h.Name, h.Summary.Bindings)
						}
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when the nodes support event streams", func(t *testing.T) {
			t.Run("it shows the length of each stream and the events recorded per second", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					s1, s2 := uuidpb.Generate(), uuidpb.Generate()
					h1, h2 := uuidpb.Generate(), uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.EventStreamLength)), reach),
						supports(name(new(metricsgrpc.HandlerEventsRecorded)), metricsgrpc.Reach_REACH_NODE),
					)
					n.sample(t, 0, "s1", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: s1, Value: 50}.Build())
					n.sample(t, 0, "s2", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: s2, Value: 20}.Build())
					n.sample(t, 1, "h1", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h1, Value: 100}.Build())
					n.sample(t, 1, "h2", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h2, Value: 0}.Build())

					if v := viewOf(t, r, o, c); v.Overview.Events.Rate == nil || v.Overview.Events.Rate.PerSecond != nil {
						t.Fatalf("unexpected rate before five seconds: %+v", v.Overview.Events.Rate)
					}

					time.Sleep(10 * time.Second)
					n.sample(t, 1, "h1", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h1, Value: 160}.Build())
					n.sample(t, 1, "h2", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h2, Value: 20}.Build())

					e := viewOf(t, r, o, c).Overview.Events
					// h1 grew by 60 and h2 by 20 over 10 seconds.
					expectFloat(t, e.Rate.PerSecond, 80.0/10)

					sizes := map[string]uint64{}
					for _, s := range e.Streams {
						sizes[s.ID] = s.Size
					}
					if len(sizes) != 2 || sizes[s1.AsString()] != 50 || sizes[s2.AsString()] != 20 {
						t.Fatalf("unexpected streams: %v", e.Streams)
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when the nodes support queues", func(t *testing.T) {
			t.Run("it counts the commands and the deadlines of each queue together", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					q1, q2 := uuidpb.Generate(), uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.QueueCommandsPending)), reach),
						supports(name(new(metricsgrpc.QueueDeadlinesPending)), reach),
						supports(name(new(metricsgrpc.QueueCommandsFailing)), reach),
						supports(name(new(metricsgrpc.QueueDeadlinesFailing)), reach),
					)
					n.sample(t, 0, "q1", 1, metricsgrpc.QueueCommandsPending_builder{QueueId: q1, Value: 3}.Build())
					n.sample(t, 1, "q1", 1, metricsgrpc.QueueDeadlinesPending_builder{QueueId: q1, Value: 4}.Build())
					n.sample(t, 1, "q2", 1, metricsgrpc.QueueDeadlinesPending_builder{QueueId: q2, Value: 5}.Build())
					n.sample(t, 2, "q1", 1, metricsgrpc.QueueCommandsFailing_builder{QueueId: q1, Value: 1}.Build())
					n.sample(t, 3, "q2", 1, metricsgrpc.QueueDeadlinesFailing_builder{QueueId: q2, Value: 2}.Build())

					q := viewOf(t, r, o, c).Overview.Queues
					sizes := map[string]uint64{}
					for _, s := range q.Queues {
						sizes[s.ID] = s.Size
					}
					if len(sizes) != 2 || sizes[q1.AsString()] != 7 || sizes[q2.AsString()] != 5 {
						t.Fatalf("unexpected queues: %v", q.Queues)
					}
					if q.Failing != 3 {
						t.Fatalf("unexpected number of failing messages: got %d, want 3", q.Failing)
					}
					if q.Throughput != nil {
						t.Fatal("unexpected rate of removal, which the nodes don't support")
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it adds the rates at which commands and deadlines are removed", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					q := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.QueueCommandsPending)), reach),
						supports(name(new(metricsgrpc.QueueCommandsRemoved)), reach),
						supports(name(new(metricsgrpc.QueueDeadlinesRemoved)), reach),
					)
					n.sample(t, 1, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 0}.Build())
					n.sample(t, 2, "q", 1, metricsgrpc.QueueDeadlinesRemoved_builder{QueueId: q, Value: 0}.Build())
					time.Sleep(10 * time.Second)
					n.sample(t, 1, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 30}.Build())
					n.sample(t, 2, "q", 2, metricsgrpc.QueueDeadlinesRemoved_builder{QueueId: q, Value: 10}.Build())

					expectFloat(t, viewOf(t, r, o, c).Overview.Queues.Throughput.PerSecond, 40.0/10)

					cancel()
					<-n.Engine.Done
				})
			})
			t.Run("it counts the commands and deadlines that handlers handle, if no node supports their removal", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					handler := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.HandlerCommandsHandled)), reach),
						supports(name(new(metricsgrpc.HandlerDeadlinesHandled)), reach),
					)
					n.sample(t, 0, "c", 1, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: handler, Value: 0}.Build())
					n.sample(t, 1, "d", 1, metricsgrpc.HandlerDeadlinesHandled_builder{HandlerKey: handler, Value: 0}.Build())
					time.Sleep(10 * time.Second)
					n.sample(t, 0, "c", 2, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: handler, Value: 30}.Build())
					n.sample(t, 1, "d", 2, metricsgrpc.HandlerDeadlinesHandled_builder{HandlerKey: handler, Value: 10}.Build())

					q := viewOf(t, r, o, c).Overview.Queues
					if q == nil || q.Queues != nil || q.Counted != "handled" || q.History == nil {
						t.Fatalf("unexpected queues tile: %+v", q)
					}
					expectFloat(t, q.Throughput.PerSecond, 40.0/10)

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it prefers the handling of commands and deadlines to the removal of messages", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					q := uuidpb.Generate()
					handler := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.QueueCommandsRemoved)), reach),
						supports(name(new(metricsgrpc.HandlerCommandsHandled)), reach),
						supports(name(new(metricsgrpc.HandlerDeadlinesHandled)), reach),
					)
					n.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 0}.Build())
					n.sample(t, 1, "c", 1, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: handler, Value: 0}.Build())
					n.sample(t, 2, "d", 1, metricsgrpc.HandlerDeadlinesHandled_builder{HandlerKey: handler, Value: 0}.Build())
					time.Sleep(10 * time.Second)
					n.sample(t, 0, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 50}.Build())
					n.sample(t, 1, "c", 2, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: handler, Value: 20}.Build())
					n.sample(t, 2, "d", 2, metricsgrpc.HandlerDeadlinesHandled_builder{HandlerKey: handler, Value: 10}.Build())

					tile := viewOf(t, r, o, c).Overview.Queues
					if tile == nil || tile.Counted != "handled" {
						t.Fatalf("unexpected queues tile: %+v", tile)
					}
					expectFloat(t, tile.Throughput.PerSecond, 30.0/10)

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it uses the removal of messages if only one kind of message that handlers handle is reported", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					q := uuidpb.Generate()
					handler := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.QueueCommandsRemoved)), reach),
						supports(name(new(metricsgrpc.HandlerCommandsHandled)), reach),
					)
					n.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 0}.Build())
					n.sample(t, 1, "c", 1, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: handler, Value: 0}.Build())
					time.Sleep(10 * time.Second)
					n.sample(t, 0, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 50}.Build())
					n.sample(t, 1, "c", 2, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: handler, Value: 30}.Build())

					tile := viewOf(t, r, o, c).Overview.Queues
					if tile == nil || tile.Counted != "removed" {
						t.Fatalf("unexpected queues tile: %+v", tile)
					}
					expectFloat(t, tile.Throughput.PerSecond, 50.0/10)

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it counts the one kind of message that handlers handle, and says which, if nothing else is reported", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					handler := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
						supports(name(new(metricsgrpc.HandlerDeadlinesHandled)), reach),
					)
					n.sample(t, 0, "d", 1, metricsgrpc.HandlerDeadlinesHandled_builder{HandlerKey: handler, Value: 0}.Build())
					time.Sleep(10 * time.Second)
					n.sample(t, 0, "d", 2, metricsgrpc.HandlerDeadlinesHandled_builder{HandlerKey: handler, Value: 20}.Build())

					tile := viewOf(t, r, o, c).Overview.Queues
					if tile == nil || tile.Counted != "deadlines handled" {
						t.Fatalf("unexpected queues tile: %+v", tile)
					}
					expectFloat(t, tile.Throughput.PerSecond, 20.0/10)

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when the nodes heartbeat", func(t *testing.T) {
			t.Run("it lists the members with the workloads and the heartbeats of those that are connected", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()))
					gone := uuidpb.Generate()

					send(t, n.Engine, liveNodes(n.ID, gone))
					send(t, n.Engine, enginegrpc.WatchEngineResponse_builder{
						Workloads: enginegrpc.Workloads_builder{
							Workloads: []*enginegrpc.Workload{
								enginegrpc.Workload_builder{Key: uuidpb.Generate()}.Build(),
								enginegrpc.Workload_builder{Key: uuidpb.Generate()}.Build(),
							},
						}.Build(),
					})

					send(t, n.Engine, heartbeat(0))
					time.Sleep(3 * time.Second)
					send(t, n.Engine, heartbeat(0))
					time.Sleep(time.Second)

					nodes := viewOf(t, r, o, c).Overview.Cluster.Nodes
					if len(nodes) != 2 {
						t.Fatalf("unexpected number of nodes: got %d, want 2", len(nodes))
					}

					byID := map[string]Member{}
					for _, live := range nodes {
						byID[live.ID] = live
					}

					seen := byID[n.ID.AsString()]
					if seen.Workloads != 2 {
						t.Fatalf("unexpected workloads: got %d, want 2", seen.Workloads)
					}
					if len(seen.Heartbeats) != 2 || seen.Heartbeats[0] != 4000 || seen.Heartbeats[1] != 1000 {
						t.Fatalf("unexpected heartbeats: %v", seen.Heartbeats)
					}

					absent := byID[gone.AsString()]
					if absent.Workloads != 0 || len(absent.Heartbeats) != 0 {
						t.Fatalf("unexpected facts about a node that hasn't connected: %+v", absent)
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when a node's connection has ended", func(t *testing.T) {
			t.Run("it keeps the node as a member, and shows no heartbeats for it", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()))
					send(t, n.Engine, heartbeat(0))

					cancel()
					<-n.Engine.Done

					nodes := viewOf(t, r, o, c).Overview.Cluster.Nodes
					if len(nodes) != 1 || nodes[0].ID != n.ID.AsString() {
						t.Fatalf("unexpected nodes: %+v", nodes)
					}
					if len(nodes[0].Heartbeats) != 0 {
						t.Fatalf("unexpected heartbeats: %v", nodes[0].Heartbeats)
					}
				})
			})
		})

		t.Run("when the application has handlers", func(t *testing.T) {
			t.Run("it lists aggregates first, then processes, integrations and projections, each by name", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate(),
						handler("balances", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_PROJECTION, nil),
						handler("mailer", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_INTEGRATION, nil),
						handler("schedule", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_PROCESS, nil),
						handler("transfer", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil),
						handler("account", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil),
					))

					var got []string
					for _, h := range viewOf(t, r, o, c).Overview.Handlers {
						got = append(got, h.Kind+" "+h.Name)
					}
					want := []string{
						"aggregate account",
						"aggregate transfer",
						"process schedule",
						"integration mailer",
						"projection balances",
					}
					if len(got) != len(want) {
						t.Fatalf("unexpected handlers: got %v, want %v", got, want)
					}
					for i := range want {
						if got[i] != want[i] {
							t.Fatalf("unexpected handlers: got %v, want %v", got, want)
						}
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it shows an aggregate's instances, bindings and backlog, and a chart of the events that it records", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					key, s1, s2, s3 := uuidpb.Generate(), uuidpb.Generate(), uuidpb.Generate(), uuidpb.Generate()

					n := startApp(t, ctx, o, c,
						appOf("statements", uuidpb.Generate(),
							handler("account", key, configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil)),
						supports(name(new(metricsgrpc.AggregateInstanceEventStreamBindings)), reach),
						supports(name(new(metricsgrpc.HandlerCommandsPending)), reach),
						supports(name(new(metricsgrpc.HandlerCommandsFailing)), reach),
						supports(name(new(metricsgrpc.HandlerEventsRecorded)), metricsgrpc.Reach_REACH_NODE),
					)
					bind := func(i byte, stream *uuidpb.UUID, instances uint64) {
						n.sample(t, 0, stream.AsString(), i,
							metricsgrpc.AggregateInstanceEventStreamBindings_builder{
								HandlerKey: key, EventStreamId: stream, Value: instances,
							}.Build())
					}
					bind(1, s1, 60)
					bind(1, s2, 40)
					bind(1, s3, 0)
					n.sample(t, 1, "account", 1, metricsgrpc.HandlerCommandsPending_builder{HandlerKey: key, Value: 6}.Build())
					n.sample(t, 2, "account", 1, metricsgrpc.HandlerCommandsFailing_builder{HandlerKey: key, Value: 2}.Build())
					n.sample(t, 3, "account", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: key, Value: 0}.Build())
					time.Sleep(10 * time.Second)
					n.sample(t, 3, "account", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: key, Value: 20}.Build())

					card := viewOf(t, r, o, c).Overview.Handlers[0]
					s := card.Summary
					if s.Instances == nil || *s.Instances != 100 {
						t.Fatalf("unexpected instances: %v", s.Instances)
					}
					if s.QueuedMessages == nil || *s.QueuedMessages != 6 || s.Failing != 2 {
						t.Fatalf("unexpected backlog: %+v", s)
					}
					if len(s.Bindings) != 2 {
						t.Fatalf("unexpected bindings: %v", s.Bindings)
					}
					if s.UnhandledEvents != nil || s.SchedulesDeadlines {
						t.Fatalf("unexpected facts of a process: %+v", s)
					}
					if card.History == nil {
						t.Fatal("expected a chart")
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it shows a process's deadlines, in-progress instances and backlog of events", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					key, q := uuidpb.Generate(), uuidpb.Generate()

					n := startApp(t, ctx, o, c,
						appOf("statements", uuidpb.Generate(),
							handler("schedule", key, configpb.HandlerType_HANDLER_TYPE_PROCESS, map[string]*configpb.MessageUsage{
								"example.Deadline": configpb.MessageUsage_builder{IsProduced: true, IsConsumed: true}.Build(),
							}),
							handler("other", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_PROCESS, map[string]*configpb.MessageUsage{
								"example.Command": configpb.MessageUsage_builder{IsProduced: true}.Build(),
							})),
						supports(name(new(metricsgrpc.ProcessInstanceQueueBindings)), reach),
						supports(name(new(metricsgrpc.HandlerDeadlinesPending)), reach),
						supports(name(new(metricsgrpc.HandlerEventsPending)), reach),
					)
					n.sample(t, 0, "q", 1, metricsgrpc.ProcessInstanceQueueBindings_builder{HandlerKey: key, QueueId: q, Value: 20}.Build())
					// Instances that are in progress and bound to no queue have no queue ID.
					n.sample(t, 0, "none", 1, metricsgrpc.ProcessInstanceQueueBindings_builder{HandlerKey: key, Value: 3}.Build())
					n.sample(t, 1, "schedule", 1, metricsgrpc.HandlerDeadlinesPending_builder{HandlerKey: key, Value: 20}.Build())
					n.sample(t, 2, "schedule", 1, metricsgrpc.HandlerEventsPending_builder{HandlerKey: key, Value: 4}.Build())

					cards := viewOf(t, r, o, c).Overview.Handlers
					var schedule, other HandlerCard
					for _, c := range cards {
						if c.Name == "schedule" {
							schedule = c
						} else {
							other = c
						}
					}

					s := schedule.Summary
					if !s.SchedulesDeadlines || other.Summary.SchedulesDeadlines {
						t.Fatal("unexpected handlers that schedule deadlines")
					}
					if s.QueuedMessages == nil || *s.QueuedMessages != 20 ||
						s.UnhandledEvents == nil || *s.UnhandledEvents != 4 {
						t.Fatalf("unexpected backlog: %+v", s)
					}
					if len(s.Bindings) != 1 || s.Bindings[0].Instances != 20 || s.Bindings[0].ID != q.AsString() {
						t.Fatalf("unexpected bindings: %v", s.Bindings)
					}
					if s.Unbound != 3 {
						t.Fatalf("unexpected number of instances bound to no queue: got %d, want 3", s.Unbound)
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it marks the handlers that minimize concurrency", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()

					minimizes := handler("minimizes", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_INTEGRATION, nil)
					minimizes.SetConcurrencyPreference(configpb.ConcurrencyPreference_CONCURRENCY_PREFERENCE_MINIMIZE)
					maximizes := handler("maximizes", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_INTEGRATION, nil)
					maximizes.SetConcurrencyPreference(configpb.ConcurrencyPreference_CONCURRENCY_PREFERENCE_MAXIMIZE)
					none := handler("none", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil)

					n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate(), minimizes, maximizes, none))

					for _, h := range viewOf(t, r, o, c).Overview.Handlers {
						if h.MinimizesConcurrency != (h.Name == "minimizes") {
							t.Fatalf("unexpected mark on %s: %t", h.Name, h.MinimizesConcurrency)
						}
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it charts the events that an integration records if its routes produce an event, and else the commands that it handles", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, r := NewObserver(), NewRecorder()
					c := uuidpb.Generate()
					records, handles, silent := uuidpb.Generate(), uuidpb.Generate(), uuidpb.Generate()

					n := startApp(t, ctx, o, c,
						appOf("statements", uuidpb.Generate(),
							handler("records", records, configpb.HandlerType_HANDLER_TYPE_INTEGRATION,
								map[string]*configpb.MessageUsage{
									"example.Command": configpb.MessageUsage_builder{IsConsumed: true}.Build(),
									"example.Event":   configpb.MessageUsage_builder{IsProduced: true}.Build(),
								}),
							handler("handles", handles, configpb.HandlerType_HANDLER_TYPE_INTEGRATION,
								map[string]*configpb.MessageUsage{
									"example.Command": configpb.MessageUsage_builder{IsConsumed: true}.Build(),
								}),
							handler("silent", silent, configpb.HandlerType_HANDLER_TYPE_INTEGRATION, nil)),
						supports(name(new(metricsgrpc.HandlerEventsRecorded)), metricsgrpc.Reach_REACH_NODE),
						supports(name(new(metricsgrpc.HandlerCommandsHandled)), metricsgrpc.Reach_REACH_NODE),
					)

					n.sample(t, 0, "records", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: records, Value: 1}.Build())
					n.sample(t, 1, "handles", 1, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: handles, Value: 1}.Build())

					for _, h := range viewOf(t, r, o, c).Overview.Handlers {
						if (h.Name != "silent") != (h.History != nil) {
							t.Fatalf("unexpected chart of %s: %v", h.Name, h.History)
						}

						want := map[string]string{"records": "events", "handles": "commands"}[h.Name]
						if h.Charted != want {
							t.Fatalf("unexpected kind of message charted for %s: got %q, want %q", h.Name, h.Charted, want)
						}
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})
	})

	t.Run("the nodes that handle the messages of a handler", func(t *testing.T) {
		nodeRates := func(card HandlerCard) map[string]float64 {
			got := map[string]float64{}
			for _, n := range card.Nodes {
				got[n.Node] = n.Rate
			}
			return got
		}

		t.Run("it gives each node's rate of handling an integration's commands", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c, key := uuidpb.Generate(), uuidpb.Generate()
				app := appOf("statements", uuidpb.Generate(),
					handler("mailer", key, configpb.HandlerType_HANDLER_TYPE_INTEGRATION, nil),
					handler("balances", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_PROJECTION, nil),
					handler("account", uuidpb.Generate(), configpb.HandlerType_HANDLER_TYPE_AGGREGATE, nil))
				handled := supports(name(new(metricsgrpc.HandlerCommandsHandled)), metricsgrpc.Reach_REACH_NODE)

				a := startApp(t, ctx, o, c, app, handled)
				b := startApp(t, ctx, o, c, app, handled)
				total := func(v uint64) proto.Message {
					return metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: key, Value: v}.Build()
				}
				a.sample(t, 0, "m", 1, total(0))
				b.sample(t, 0, "m", 1, total(0))
				time.Sleep(10 * time.Second)
				a.sample(t, 0, "m", 2, total(100))
				b.sample(t, 0, "m", 2, total(50))

				r.Record(time.Now(), o.Nodes())

				cards := map[string]HandlerCard{}
				for _, card := range viewOf(t, r, o, c).Overview.Handlers {
					cards[card.Name] = card
				}

				got := nodeRates(cards["mailer"])
				if len(got) != 2 {
					t.Fatalf("unexpected nodes: %v", got)
				}
				if v := got[a.ID.AsString()]; math.Abs(v-10) > 1e-9 {
					t.Fatalf("unexpected rate of the first node: got %g, want 10", v)
				}
				if v := got[b.ID.AsString()]; math.Abs(v-5) > 1e-9 {
					t.Fatalf("unexpected rate of the second node: got %g, want 5", v)
				}

				// A projection handles events, and the nodes don't report those. An
				// aggregate has no such bar at all.
				if cards["balances"].Nodes != nil || cards["account"].Nodes != nil {
					t.Fatalf("unexpected nodes: %+v %+v", cards["balances"].Nodes, cards["account"].Nodes)
				}

				cancel()
				<-a.Engine.Done
				<-b.Engine.Done
			})
		})

		t.Run("it uses the events that a projection has handled", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c, key := uuidpb.Generate(), uuidpb.Generate()
				app := appOf("statements", uuidpb.Generate(),
					handler("balances", key, configpb.HandlerType_HANDLER_TYPE_PROJECTION, nil))

				n := startApp(t, ctx, o, c, app, supports(name(new(metricsgrpc.HandlerEventsHandled)), metricsgrpc.Reach_REACH_NODE))
				total := func(v uint64) proto.Message {
					return metricsgrpc.HandlerEventsHandled_builder{HandlerKey: key, Value: v}.Build()
				}
				n.sample(t, 0, "b", 1, total(0))
				time.Sleep(10 * time.Second)
				n.sample(t, 0, "b", 2, total(20))

				r.Record(time.Now(), o.Nodes())

				got := nodeRates(viewOf(t, r, o, c).Overview.Handlers[0])
				if v := got[n.ID.AsString()]; len(got) != 1 || math.Abs(v-2) > 1e-9 {
					t.Fatalf("unexpected nodes: %v", got)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it leaves out a node whose rate isn't known yet, and it is empty when no node has one", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c, key := uuidpb.Generate(), uuidpb.Generate()
				app := appOf("statements", uuidpb.Generate(),
					handler("mailer", key, configpb.HandlerType_HANDLER_TYPE_INTEGRATION, nil))

				n := startApp(t, ctx, o, c, app, supports(name(new(metricsgrpc.HandlerCommandsHandled)), metricsgrpc.Reach_REACH_NODE))
				n.sample(t, 0, "m", 1, metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: key, Value: 1}.Build())
				r.Record(time.Now(), o.Nodes())

				card := viewOf(t, r, o, c).Overview.Handlers[0]
				if card.Nodes == nil || len(card.Nodes) != 0 {
					t.Fatalf("unexpected nodes: %#v", card.Nodes)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it smooths a rate, so that the rate of a node that has gone halves in half a minute", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				gone, goneStop := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c, key := uuidpb.Generate(), uuidpb.Generate()
				app := appOf("statements", uuidpb.Generate(),
					handler("mailer", key, configpb.HandlerType_HANDLER_TYPE_INTEGRATION, nil))
				handled := supports(name(new(metricsgrpc.HandlerCommandsHandled)), metricsgrpc.Reach_REACH_NODE)

				stays := startApp(t, ctx, o, c, app, handled)
				leaves := startApp(t, gone, o, c, app, handled)
				total := func(v uint64) proto.Message {
					return metricsgrpc.HandlerCommandsHandled_builder{HandlerKey: key, Value: v}.Build()
				}
				stays.sample(t, 0, "m", 1, total(0))
				leaves.sample(t, 0, "m", 1, total(0))
				time.Sleep(10 * time.Second)
				stays.sample(t, 0, "m", 2, total(100))
				leaves.sample(t, 0, "m", 2, total(100))
				r.Record(time.Now(), o.Nodes())

				before := nodeRates(viewOf(t, r, o, c).Overview.Handlers[0])[leaves.ID.AsString()]
				if before == 0 {
					t.Fatal("expected a rate before the node goes")
				}

				goneStop()
				<-leaves.Engine.Done

				for range 30 {
					time.Sleep(time.Second)
					r.Record(time.Now(), o.Nodes())
				}

				after := nodeRates(viewOf(t, r, o, c).Overview.Handlers[0])[leaves.ID.AsString()]
				if math.Abs(after/before-0.5) > 0.02 {
					t.Fatalf("unexpected ratio after half a minute: got %g, want 0.5", after/before)
				}

				cancel()
				<-stays.Engine.Done
			})
		})
	})

	t.Run("func Record()", func(t *testing.T) {
		t.Run("it gives each chart the history of its number, placed by how long before the view it was recorded", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c := uuidpb.Generate()
				q := uuidpb.Generate()

				n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
					supports(name(new(metricsgrpc.QueueCommandsRemoved)), reach),
				)

				// The rate is known once the totals have been seen for long enough.
				n.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 0}.Build())
				time.Sleep(10 * time.Second)
				n.sample(t, 0, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 30}.Build())
				r.Record(time.Now(), o.Nodes())

				time.Sleep(2 * time.Second)
				n.sample(t, 0, "q", 3, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 60}.Build())
				r.Record(time.Now(), o.Nodes())

				time.Sleep(time.Second)

				chart := viewOf(t, r, o, c).Overview.Queues.History
				if chart.End != 0 {
					t.Fatalf("unexpected end: got %g, want 0", chart.End)
				}
				if len(chart.Points) != 2 {
					t.Fatalf("unexpected points: %v", chart.Points)
				}
				if p := chart.Points[0]; p.At != -3000 || p.Value != 3 {
					t.Fatalf("unexpected first point: %+v", p)
				}
				if p := chart.Points[1]; p.At != -1000 || p.Value != 5 {
					t.Fatalf("unexpected second point: %+v", p)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("func Series() gives the points that each chart has recorded, oldest first", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c := uuidpb.Generate()
				q := uuidpb.Generate()

				n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
					supports(name(new(metricsgrpc.QueueCommandsRemoved)), reach),
				)
				n.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 0}.Build())
				time.Sleep(10 * time.Second)
				n.sample(t, 0, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 30}.Build())

				start := time.Now()
				r.Record(start, o.Nodes())
				time.Sleep(2 * time.Second)
				n.sample(t, 0, "q", 3, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 60}.Build())
				r.Record(time.Now(), o.Nodes())

				series := r.Series(c.AsString())
				if len(series.Throughput) != 2 {
					t.Fatalf("unexpected points: %v", series.Throughput)
				}
				if p := series.Throughput[0]; !p.At.Equal(start) || p.Value != 3 {
					t.Fatalf("unexpected first point: %+v", p)
				}
				if p := series.Throughput[1]; !p.At.Equal(start.Add(2*time.Second)) || p.Value != 5 {
					t.Fatalf("unexpected second point: %+v", p)
				}
				if len(series.Events) != 0 || len(series.Handlers) != 0 {
					t.Fatalf("unexpected points of other charts: %+v", series)
				}

				if got := r.Series(uuidpb.Generate().AsString()); len(got.Throughput) != 0 {
					t.Fatalf("unexpected points of an unknown cluster: %+v", got)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it forgets the history of the points that are older than a minute", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c := uuidpb.Generate()
				q := uuidpb.Generate()

				n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
					supports(name(new(metricsgrpc.QueueCommandsRemoved)), reach),
				)
				n.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 0}.Build())

				// A total that keeps rising has a rate that keeps being known.
				for i := range 200 {
					time.Sleep(time.Second)
					n.sample(t, 0, "q", byte(i+2), metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: uint64(3 * (i + 1))}.Build())
					r.Record(time.Now(), o.Nodes())
				}

				chart := viewOf(t, r, o, c).Overview.Queues.History
				if len(chart.Points) >= 100 {
					t.Fatalf("unexpected number of points: got %d", len(chart.Points))
				}
				if first := chart.Points[0].At; first < -75_000 {
					t.Fatalf("unexpected first point: %g ms before the chart's end", first)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it forgets a cluster that none of the nodes belong to", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o, r := NewObserver(), NewRecorder()
				c := uuidpb.Generate()
				q := uuidpb.Generate()

				n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
					supports(name(new(metricsgrpc.QueueCommandsRemoved)), reach),
				)
				n.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 0}.Build())
				time.Sleep(10 * time.Second)
				n.sample(t, 0, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q, Value: 30}.Build())
				r.Record(time.Now(), o.Nodes())

				// The Recorder keeps no history for the cluster once the nodes are
				// gone, so a node that connects again has a chart that starts afresh.
				r.Record(time.Now(), nil)
				time.Sleep(time.Second)

				if got := len(viewOf(t, r, o, c).Overview.Queues.History.Points); got != 0 {
					t.Fatalf("unexpected number of points: got %d, want 0", got)
				}

				cancel()
				<-n.Engine.Done
			})
		})
	})
}
