package observe_test

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	. "github.com/dogmatiq/observatory/internal/observe"
	"github.com/dogmatiq/observatory/internal/observe/stubs"
)

type (
	feed        = stubs.Feed[enginegrpc.WatchEngineResponse]
	metricsFeed = stubs.Feed[metricsgrpc.WatchMetricsResponse]
)

// connection is a call to [Observer.Serve], the feed of the engine API call
// that it makes, and the feed of each call that it makes to the metrics API.
type connection struct {
	Feed  *feed
	Done  <-chan error
	Calls <-chan *metricsFeed
}

// connect starts serving a node whose engine API call is fed by the returned
// connection, and returns once the call has been made.
//
// The Observer calls the node's metrics API after the engine API's preamble
// has arrived. Each call is available from the connection's Calls.
func connect(ctx context.Context, o *Observer) connection {
	feeds := make(chan *feed, 1)
	calls := make(chan *metricsFeed, 16)

	clients := &Clients{
		Engine: &enginegrpc.EngineAPIClientStub{
			WatchEngineFunc: func(
				ctx context.Context,
				_ *enginegrpc.WatchEngineRequest,
				_ ...grpc.CallOption,
			) (enginegrpc.EngineAPI_WatchEngineClient, error) {
				f := stubs.NewFeed[enginegrpc.WatchEngineResponse](ctx)
				feeds <- f
				return f, nil
			},
		},
		Metrics: &metricsgrpc.MetricsAPIClientStub{
			WatchMetricsFunc: func(
				ctx context.Context,
				_ *metricsgrpc.WatchMetricsRequest,
				_ ...grpc.CallOption,
			) (metricsgrpc.MetricsAPI_WatchMetricsClient, error) {
				f := stubs.NewFeed[metricsgrpc.WatchMetricsResponse](ctx)
				calls <- f
				return f, nil
			},
		},
	}

	done := make(chan error, 1)
	go func() { done <- o.Serve(ctx, clients) }()

	return connection{<-feeds, done, calls}
}

// send feeds a response to the connection, and waits for the Observer to
// finish handling it.
func send(t *testing.T, c connection, b enginegrpc.WatchEngineResponse_builder) {
	t.Helper()

	if err := c.Feed.Send(b.Build()); err != nil {
		t.Fatal(err)
	}
	synctest.Wait()
}

func preamble(node, cluster *uuidpb.UUID, interval, timeout time.Duration) enginegrpc.WatchEngineResponse_builder {
	b := enginegrpc.WatchEngineResponse_Preamble_builder{
		NodeId:    node,
		ClusterId: cluster,
	}
	if interval > 0 {
		b.HeartbeatInterval = durationpb.New(interval)
	}
	if timeout > 0 {
		b.HeartbeatTimeout = durationpb.New(timeout)
	}
	return enginegrpc.WatchEngineResponse_builder{Preamble: b.Build()}
}

func heartbeat(expiresAfter time.Duration) enginegrpc.WatchEngineResponse_builder {
	b := enginegrpc.WatchEngineResponse_Heartbeat_builder{
		SentAt: timestamppb.Now(),
	}
	if expiresAfter > 0 {
		b.ExpiresAfter = durationpb.New(expiresAfter)
	}
	return enginegrpc.WatchEngineResponse_builder{Heartbeat: b.Build()}
}

// only returns the one node that o knows, or fails the test.
func only(t *testing.T, o *Observer) Node {
	t.Helper()

	nodes := o.Nodes()
	if len(nodes) != 1 {
		t.Fatalf("unexpected number of nodes: got %d, want 1", len(nodes))
	}
	return nodes[0]
}

// byID returns the node that has the given ID, or fails the test.
func byID(t *testing.T, o *Observer, id *uuidpb.UUID) Node {
	t.Helper()

	for _, n := range o.Nodes() {
		if n.Preamble.GetNodeId().Equal(id) {
			return n
		}
	}

	t.Fatalf("unknown node: %s", id)
	return Node{}
}

func TestObserver(t *testing.T) {
	t.Run("func Nodes()", func(t *testing.T) {
		t.Run("it returns no nodes before any node has connected", func(t *testing.T) {
			if got := NewObserver().Nodes(); len(got) != 0 {
				t.Fatalf("unexpected number of nodes: got %d, want 0", len(got))
			}
		})
	})

	t.Run("func Serve()", func(t *testing.T) {
		t.Run("it records the preamble of the node", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				nodeID, clusterID := uuidpb.Generate(), uuidpb.Generate()

				c := connect(ctx, o)
				send(t, c, preamble(nodeID, clusterID, 0, 0))

				n := only(t, o)
				if !n.Preamble.GetNodeId().Equal(nodeID) {
					t.Fatalf("unexpected node ID: got %s, want %s", n.Preamble.GetNodeId(), nodeID)
				}
				if !n.Connected {
					t.Fatal("expected the node to be connected")
				}

				cancel()
				<-c.Done
			})
		})

		t.Run("it replaces the live nodes and the workloads each time the node sends them", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				nodeID := uuidpb.Generate()

				c := connect(ctx, o)
				send(t, c, preamble(nodeID, uuidpb.Generate(), 0, 0))

				other := uuidpb.Generate()
				send(t, c, enginegrpc.WatchEngineResponse_builder{
					LiveNodes: enginegrpc.LiveNodes_builder{
						NodeIds: []*uuidpb.UUID{nodeID, other},
					}.Build(),
				})
				send(t, c, enginegrpc.WatchEngineResponse_builder{
					LiveNodes: enginegrpc.LiveNodes_builder{
						NodeIds: []*uuidpb.UUID{nodeID},
					}.Build(),
				})
				send(t, c, enginegrpc.WatchEngineResponse_builder{
					Workloads: enginegrpc.Workloads_builder{
						Workloads: []*enginegrpc.Workload{
							enginegrpc.Workload_builder{Key: uuidpb.Generate()}.Build(),
						},
					}.Build(),
				})

				n := only(t, o)
				if got := len(n.LiveNodes.GetNodeIds()); got != 1 {
					t.Fatalf("unexpected number of live nodes: got %d, want 1", got)
				}
				if got := len(n.Workloads.GetWorkloads()); got != 1 {
					t.Fatalf("unexpected number of workloads: got %d, want 1", got)
				}

				cancel()
				<-c.Done
			})
		})

		t.Run("it remembers when each heartbeat arrived in the last ten minutes", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()

				c := connect(ctx, o)
				send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))

				first := time.Now()
				send(t, c, heartbeat(time.Second))
				time.Sleep(time.Minute)
				second := time.Now()
				send(t, c, heartbeat(time.Second))

				got := only(t, o).Heartbeats
				if len(got) != 2 || !got[0].Equal(first) || !got[1].Equal(second) {
					t.Fatalf("unexpected heartbeats: %v", got)
				}

				time.Sleep(11 * time.Minute)
				third := time.Now()
				send(t, c, heartbeat(time.Second))

				got = only(t, o).Heartbeats
				if len(got) != 1 || !got[0].Equal(third) {
					t.Fatalf("unexpected heartbeats: %v", got)
				}

				cancel()
				<-c.Done
			})
		})

		t.Run("it keeps the heartbeats of the node's earlier connection", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				nodeID, clusterID := uuidpb.Generate(), uuidpb.Generate()

				first := connect(ctx, o)
				send(t, first, preamble(nodeID, clusterID, 0, 0))
				send(t, first, heartbeat(time.Second))

				second := connect(ctx, o)
				send(t, second, preamble(nodeID, clusterID, 0, 0))
				<-first.Done

				if got := len(only(t, o).Heartbeats); got != 1 {
					t.Fatalf("unexpected number of heartbeats: got %d, want 1", got)
				}

				cancel()
				<-second.Done
			})
		})

		t.Run("when the node ends the call with an OK status", func(t *testing.T) {
			t.Run("it returns nil and marks the node as not connected", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					o := NewObserver()

					c := connect(t.Context(), o)
					send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))
					c.Feed.End(nil)

					if err := <-c.Done; err != nil {
						t.Fatal(err)
					}
					if only(t, o).Connected {
						t.Fatal("expected the node not to be connected")
					}
				})
			})
		})

		t.Run("when the node ends the call with an error", func(t *testing.T) {
			t.Run("it returns that error", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					want := errors.New("the node is going away")
					o := NewObserver()

					c := connect(t.Context(), o)
					send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))
					c.Feed.End(want)

					if got := <-c.Done; got != want {
						t.Fatalf("unexpected error: got %v, want %v", got, want)
					}
				})
			})
		})

		t.Run("when the first response isn't a preamble", func(t *testing.T) {
			t.Run("it returns an error", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					o := NewObserver()

					c := connect(t.Context(), o)
					send(t, c, heartbeat(0))

					if err := <-c.Done; err == nil {
						t.Fatal("expected an error")
					}
					if got := len(o.Nodes()); got != 0 {
						t.Fatalf("unexpected number of nodes: got %d, want 0", got)
					}
				})
			})
		})

		t.Run("when the node sends a second preamble", func(t *testing.T) {
			t.Run("it returns an error", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					o := NewObserver()
					nodeID, clusterID := uuidpb.Generate(), uuidpb.Generate()

					c := connect(t.Context(), o)
					send(t, c, preamble(nodeID, clusterID, 0, 0))
					send(t, c, preamble(nodeID, clusterID, 0, 0))

					if err := <-c.Done; err == nil {
						t.Fatal("expected an error")
					}
				})
			})
		})

		t.Run("when the same node connects again", func(t *testing.T) {
			t.Run("it ends the earlier connection and uses the new one", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					nodeID, clusterID := uuidpb.Generate(), uuidpb.Generate()

					first := connect(ctx, o)
					send(t, first, preamble(nodeID, clusterID, 0, 0))

					second := connect(ctx, o)
					send(t, second, preamble(nodeID, clusterID, 0, 0))

					if err := <-first.Done; !errors.Is(err, ErrSuperseded) {
						t.Fatalf("unexpected error: got %v, want %v", err, ErrSuperseded)
					}

					// The earlier connection ending mustn't disturb the node.
					if !only(t, o).Connected {
						t.Fatal("expected the node to be connected through its new connection")
					}

					cancel()
					<-second.Done
				})
			})
		})
	})

	t.Run("func ForgetIdle()", func(t *testing.T) {
		t.Run("it forgets a cluster whose nodes have not reported for three days", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				o := NewObserver()

				c := connect(t.Context(), o)
				send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))
				c.Feed.End(nil)
				<-c.Done

				if !only(t, o).DisconnectedAt.Equal(time.Now()) {
					t.Fatalf("unexpected time of disconnection: %s", only(t, o).DisconnectedAt)
				}

				time.Sleep(3*24*time.Hour - time.Second)
				o.ForgetIdle(time.Now())
				only(t, o)

				time.Sleep(time.Second)
				o.ForgetIdle(time.Now())
				if got := len(o.Nodes()); got != 0 {
					t.Fatalf("unexpected number of nodes: got %d, want 0", got)
				}
			})
		})

		t.Run("it counts the time from when the last heartbeat expired", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				o := NewObserver()

				c := connect(t.Context(), o)
				send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))
				send(t, c, heartbeat(time.Hour))
				c.Feed.End(nil)
				<-c.Done

				time.Sleep(time.Hour + 3*24*time.Hour - time.Second)
				o.ForgetIdle(time.Now())
				only(t, o)

				time.Sleep(time.Second)
				o.ForgetIdle(time.Now())
				if got := len(o.Nodes()); got != 0 {
					t.Fatalf("unexpected number of nodes: got %d, want 0", got)
				}
			})
		})

		t.Run("it keeps a cluster while any of its nodes is reporting", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				cluster := uuidpb.Generate()

				gone := connect(ctx, o)
				send(t, gone, preamble(uuidpb.Generate(), cluster, 0, 0))
				gone.Feed.End(nil)
				<-gone.Done

				staying := connect(ctx, o)
				send(t, staying, preamble(uuidpb.Generate(), cluster, 0, 0))

				time.Sleep(4 * 24 * time.Hour)
				o.ForgetIdle(time.Now())

				if got := len(o.Nodes()); got != 2 {
					t.Fatalf("unexpected number of nodes: got %d, want 2", got)
				}

				cancel()
				<-staying.Done
			})
		})

		t.Run("it ends the connection of a node whose heartbeat expired", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				o := NewObserver()

				c := connect(t.Context(), o)
				send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))
				send(t, c, heartbeat(time.Second))

				time.Sleep(3*24*time.Hour + time.Second)
				o.ForgetIdle(time.Now())

				if err := <-c.Done; !errors.Is(err, ErrForgotten) {
					t.Fatalf("unexpected error: got %v, want %v", err, ErrForgotten)
				}
				if got := len(o.Nodes()); got != 0 {
					t.Fatalf("unexpected number of nodes: got %d, want 0", got)
				}
			})
		})
	})

	t.Run("func Forget()", func(t *testing.T) {
		t.Run("it forgets the cluster, and ends its connections", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				o := NewObserver()
				cluster := uuidpb.Generate()

				gone := connect(t.Context(), o)
				send(t, gone, preamble(uuidpb.Generate(), cluster, 0, 0))
				connected := connect(t.Context(), o)
				send(t, connected, preamble(uuidpb.Generate(), cluster, 0, 0))
				other := connect(t.Context(), o)
				send(t, other, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))

				o.Forget(cluster)

				for _, c := range []connection{gone, connected} {
					if err := <-c.Done; !errors.Is(err, ErrForgotten) {
						t.Fatalf("unexpected error: got %v, want %v", err, ErrForgotten)
					}
				}
				if got := len(o.Nodes()); got != 1 {
					t.Fatalf("unexpected number of nodes: got %d, want 1", got)
				}

				other.Feed.End(nil)
				<-other.Done
			})
		})

		t.Run("it knows a node that connects again as new", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				node, cluster := uuidpb.Generate(), uuidpb.Generate()

				first := connect(ctx, o)
				send(t, first, preamble(node, cluster, 0, 0))
				send(t, first, heartbeat(time.Hour))
				o.Forget(cluster)
				<-first.Done

				second := connect(ctx, o)
				send(t, second, preamble(node, cluster, 0, 0))

				n := only(t, o)
				if !n.Connected || n.Heartbeat != nil || len(n.Heartbeats) != 0 {
					t.Fatalf("expected a node without history: %+v", n)
				}

				cancel()
				<-second.Done
			})
		})
	})

	t.Run("func Node.Reporting()", func(t *testing.T) {
		t.Run("when the node sends no heartbeats", func(t *testing.T) {
			t.Run("it reports only while its connection is open", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					o := NewObserver()

					c := connect(t.Context(), o)
					send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))

					if !only(t, o).Reporting(time.Now()) {
						t.Fatal("expected the node to be reporting while connected")
					}

					c.Feed.End(nil)
					<-c.Done

					if only(t, o).Reporting(time.Now()) {
						t.Fatal("expected the node not to be reporting once disconnected")
					}
				})
			})
		})

		t.Run("when a heartbeat says when it expires", func(t *testing.T) {
			t.Run("it reports until that time, even if the connection ends", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					o := NewObserver()

					c := connect(t.Context(), o)
					send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 5*time.Second, 0))
					send(t, c, heartbeat(10*time.Second))
					c.Feed.End(nil)
					<-c.Done

					time.Sleep(9 * time.Second)
					if !only(t, o).Reporting(time.Now()) {
						t.Fatal("expected the node to be reporting before the heartbeat expires")
					}

					time.Sleep(2 * time.Second)
					if only(t, o).Reporting(time.Now()) {
						t.Fatal("expected the node not to be reporting after the heartbeat expires")
					}
				})
			})

			t.Run("it measures the length of an expiry time by the node's own clock", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					o := NewObserver()

					// The node's clock is far from ours. Only the 10 seconds
					// between its two times matter.
					sentAt := time.Now().Add(-24 * time.Hour)

					c := connect(t.Context(), o)
					send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 5*time.Second, 0))
					send(t, c, enginegrpc.WatchEngineResponse_builder{
						Heartbeat: enginegrpc.WatchEngineResponse_Heartbeat_builder{
							SentAt:    timestamppb.New(sentAt),
							ExpiresAt: timestamppb.New(sentAt.Add(10 * time.Second)),
						}.Build(),
					})

					time.Sleep(9 * time.Second)
					if !only(t, o).Reporting(time.Now()) {
						t.Fatal("expected the node to be reporting before the heartbeat expires")
					}

					time.Sleep(2 * time.Second)
					if only(t, o).Reporting(time.Now()) {
						t.Fatal("expected the node not to be reporting after the heartbeat expires")
					}

					c.Feed.End(nil)
					<-c.Done
				})
			})
		})

		t.Run("when a heartbeat doesn't say when it expires", func(t *testing.T) {
			t.Run("it uses the shortest timeout of the nodes in its cluster", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					clusterID := uuidpb.Generate()

					aID := uuidpb.Generate()
					a := connect(ctx, o)
					send(t, a, preamble(aID, clusterID, 5*time.Second, 8*time.Second))

					b := connect(ctx, o)
					send(t, b, preamble(uuidpb.Generate(), clusterID, 5*time.Second, 3*time.Second))

					// A node of another cluster mustn't affect these.
					other := connect(ctx, o)
					send(t, other, preamble(uuidpb.Generate(), uuidpb.Generate(), 5*time.Second, time.Second))

					send(t, a, heartbeat(0))

					time.Sleep(2 * time.Second)
					if !byID(t, o, aID).Reporting(time.Now()) {
						t.Fatal("expected the node to be reporting before the shortest timeout")
					}

					time.Sleep(2 * time.Second)
					if byID(t, o, aID).Reporting(time.Now()) {
						t.Fatal("expected the node not to be reporting after the shortest timeout")
					}

					cancel()
					<-a.Done
					<-b.Done
					<-other.Done
				})
			})
		})
	})
}

func TestWatchHeartbeats(t *testing.T) {
	t.Run("it tells a watcher the cluster and the node of each heartbeat", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			watch := o.WatchHeartbeats(ctx)

			a, b := uuidpb.Generate(), uuidpb.Generate()
			na, nb := uuidpb.Generate(), uuidpb.Generate()
			ca, cb := connect(ctx, o), connect(ctx, o)
			send(t, ca, preamble(na, a, 0, 0))
			send(t, cb, preamble(nb, b, 0, 0))

			if len(watch) != 0 {
				t.Fatal("unexpected notification before any heartbeat")
			}

			send(t, ca, heartbeat(0))
			send(t, cb, heartbeat(0))
			send(t, cb, heartbeat(0))

			var got []Heartbeat
			for range 3 {
				got = append(got, <-watch)
			}
			want := []Heartbeat{
				{a.AsString(), na.AsString()},
				{b.AsString(), nb.AsString()},
				{b.AsString(), nb.AsString()},
			}
			for i := range want {
				if got[i] != want[i] {
					t.Fatalf("unexpected clusters: got %v, want %v", got, want)
				}
			}

			cancel()
			<-ca.Done
			<-cb.Done
		})
	})

	t.Run("it closes the channel when ctx ends, and sends nothing more", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()

			watchCtx, stop := context.WithCancel(ctx)
			watch := o.WatchHeartbeats(watchCtx)

			c := connect(ctx, o)
			send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))

			stop()
			synctest.Wait()

			if _, ok := <-watch; ok {
				t.Fatal("unexpected notification after ctx ended")
			}

			// A heartbeat after the watcher has gone must not panic.
			send(t, c, heartbeat(0))

			cancel()
			<-c.Done
		})
	})

	t.Run("it doesn't hold up the Observer when the watcher doesn't receive", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			o.WatchHeartbeats(ctx)

			c := connect(ctx, o)
			send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))

			for range 100 {
				send(t, c, heartbeat(0))
			}

			cancel()
			<-c.Done
		})
	})
}
