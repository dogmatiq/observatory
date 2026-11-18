package observe_test

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"

	. "github.com/dogmatiq/observatory/internal/observe"
)

const (
	queuePending = "dogma.metrics.v1alpha1.QueueCommandsPending"
	queueDue     = "dogma.metrics.v1alpha1.QueueCommandsDue"
)

// supports returns a metric that a metrics preamble lists.
func supports(name string, reach metricsgrpc.Reach) *metricsgrpc.SupportedMetric {
	return metricsgrpc.SupportedMetric_builder{
		MessageName: name,
		Reach:       &reach,
	}.Build()
}

// pending is the value of a sample of the QueueCommandsPending metric.
func pending(queue *uuidpb.UUID, value uint64) proto.Message {
	return metricsgrpc.QueueCommandsPending_builder{
		QueueId: queue,
		Value:   value,
	}.Build()
}

// metricsNode is a node that has begun a call to the Observer's metrics API.
type metricsNode struct {
	ID      *uuidpb.UUID
	Engine  connection
	Metrics *metricsFeed
}

// startNode connects a node of the cluster, and begins its call to the metrics
// API with a preamble that lists the given metrics. The index of each metric in
// samples is its position in the list.
func startNode(
	t *testing.T,
	ctx context.Context,
	o *Observer,
	cluster *uuidpb.UUID,
	supported ...*metricsgrpc.SupportedMetric,
) *metricsNode {
	t.Helper()

	n := &metricsNode{ID: uuidpb.Generate()}
	n.Engine = connect(ctx, o)
	send(t, n.Engine, preamble(n.ID, cluster, 0, 0))

	n.Metrics = <-n.Engine.Calls
	n.sendPreamble(t, n.ID, cluster, supported...)

	return n
}

func (n *metricsNode) sendPreamble(
	t *testing.T,
	node, cluster *uuidpb.UUID,
	supported ...*metricsgrpc.SupportedMetric,
) {
	t.Helper()

	n.sendMetrics(t, metricsgrpc.WatchMetricsResponse_builder{
		Preamble: metricsgrpc.WatchMetricsResponse_Preamble_builder{
			NodeId:           node,
			ClusterId:        cluster,
			SupportedMetrics: supported,
		}.Build(),
	})
}

// sample sends a sample, and waits for the Observer to finish handling it.
func (n *metricsNode) sample(
	t *testing.T,
	metric uint32,
	subject string,
	revision byte,
	value proto.Message,
) {
	t.Helper()

	b, err := proto.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}

	n.sendRaw(t, metric, subject, revision, b)
}

func (n *metricsNode) sendRaw(
	t *testing.T,
	metric uint32,
	subject string,
	revision byte,
	value []byte,
) {
	t.Helper()

	n.sendMetrics(t, metricsgrpc.WatchMetricsResponse_builder{
		Sample: metricsgrpc.WatchMetricsResponse_Sample_builder{
			MetricIndex: metric,
			Subject:     []byte(subject),
			Value:       value,
			Revision:    []byte{revision},
		}.Build(),
	})
}

func (n *metricsNode) sendMetrics(t *testing.T, b metricsgrpc.WatchMetricsResponse_builder) {
	t.Helper()

	if err := n.Metrics.Send(b.Build()); err != nil {
		t.Fatal(err)
	}
	synctest.Wait()
}

// queues returns the value of each QueueCommandsPending sample of the node, by
// the ID of the queue.
func queues(t *testing.T, n Node) map[string]uint64 {
	t.Helper()

	got := map[string]uint64{}
	if n.Metrics == nil {
		return got
	}
	for _, s := range n.Metrics.Samples {
		if s.Metric == queuePending {
			m := s.Message.(*metricsgrpc.QueueCommandsPending)
			got[m.GetQueueId().AsString()] = m.GetValue()
		}
	}
	return got
}

// combined returns the value of each QueueCommandsPending cluster sample, by
// the ID of the queue.
func combined(t *testing.T, samples []ClusterSample) map[string]uint64 {
	t.Helper()

	got := map[string]uint64{}
	for _, r := range samples {
		if r.Metric == queuePending {
			m := r.Message.(*metricsgrpc.QueueCommandsPending)
			got[m.GetQueueId().AsString()] = m.GetValue()
		}
	}
	return got
}

func expectQueues(t *testing.T, got map[string]uint64, want map[*uuidpb.UUID]uint64) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("unexpected number of queues: got %d, want %d", len(got), len(want))
	}
	for id, v := range want {
		if got[id.AsString()] != v {
			t.Fatalf("unexpected value of queue %s: got %d, want %d", id, got[id.AsString()], v)
		}
	}
}

func TestMetrics(t *testing.T) {
	t.Run("func Serve()", func(t *testing.T) {
		t.Run("it records the latest sample of each series", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				a, b := uuidpb.Generate(), uuidpb.Generate()

				n := startNode(t, ctx, o, uuidpb.Generate(),
					supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
				)
				n.sample(t, 0, "a", 1, pending(a, 3))
				n.sample(t, 0, "b", 1, pending(b, 5))
				n.sample(t, 0, "a", 2, pending(a, 4))

				expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{a: 4, b: 5})

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it ignores a sample whose revision is less than the one that it has", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				a := uuidpb.Generate()

				n := startNode(t, ctx, o, uuidpb.Generate(),
					supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
				)
				n.sample(t, 0, "a", 2, pending(a, 4))
				n.sample(t, 0, "a", 1, pending(a, 3))

				expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{a: 4})

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it records the time that each sample arrived", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()

				n := startNode(t, ctx, o, uuidpb.Generate(),
					supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
				)
				time.Sleep(time.Minute)
				arrived := time.Now()
				n.sample(t, 0, "a", 1, pending(uuidpb.Generate(), 1))

				samples := only(t, o).Metrics.Samples
				if len(samples) != 1 {
					t.Fatalf("unexpected number of samples: got %d, want 1", len(samples))
				}
				if !samples[0].At.Equal(arrived) {
					t.Fatalf("unexpected time: got %s, want %s", samples[0].At, arrived)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it keeps the preamble of the call", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()

				n := startNode(t, ctx, o, uuidpb.Generate(),
					supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
					supports(queueDue, metricsgrpc.Reach_REACH_NODE),
				)

				m := only(t, o).Metrics
				if m == nil {
					t.Fatal("expected the node to have a call")
				}
				if got := len(m.Preamble.GetSupportedMetrics()); got != 2 {
					t.Fatalf("unexpected number of supported metrics: got %d, want 2", got)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it knows every metric that the spec defines", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()

				// Every message in the package is a metric, except the ones
				// that belong to the API itself.
				api := map[protoreflect.Name]bool{
					"WatchMetricsRequest":  true,
					"WatchMetricsResponse": true,
					"SupportedMetric":      true,
				}

				var supported []*metricsgrpc.SupportedMetric
				protoregistry.GlobalFiles.RangeFilesByPackage(
					new(metricsgrpc.QueueCommandsPending).ProtoReflect().Descriptor().ParentFile().Package(),
					func(f protoreflect.FileDescriptor) bool {
						for i := range f.Messages().Len() {
							m := f.Messages().Get(i)
							if !api[m.Name()] {
								supported = append(supported, supports(string(m.FullName()), metricsgrpc.Reach_REACH_CLUSTER))
							}
						}
						return true
					},
				)
				if len(supported) == 0 {
					t.Fatal("expected the spec to define metrics")
				}

				n := startNode(t, ctx, o, uuidpb.Generate(), supported...)
				for i := range supported {
					n.sendRaw(t, uint32(i), "x", 1, nil)
				}

				if got := len(only(t, o).Metrics.Samples); got != len(supported) {
					t.Fatalf("unexpected number of samples: got %d, want %d", got, len(supported))
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("it ignores samples of metrics that it doesn't know", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				a := uuidpb.Generate()

				n := startNode(t, ctx, o, uuidpb.Generate(),
					supports("example.CustomMetric", metricsgrpc.Reach_REACH_CLUSTER),
					supports("dogma.metrics.v1alpha1.WatchMetricsResponse", metricsgrpc.Reach_REACH_CLUSTER),
					supports(queueDue, metricsgrpc.Reach_REACH_UNSPECIFIED),
					supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
				)
				n.sendRaw(t, 0, "x", 1, []byte("anything"))
				n.sendRaw(t, 1, "x", 1, []byte("anything"))
				n.sample(t, 2, "x", 1, pending(a, 9))
				n.sample(t, 3, "a", 1, pending(a, 3))

				expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{a: 3})
				if got := len(only(t, o).Metrics.Samples); got != 1 {
					t.Fatalf("unexpected number of samples: got %d, want 1", got)
				}

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("when the call ends", func(t *testing.T) {
			t.Run("it discards the values, and records why", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					a := uuidpb.Generate()
					want := status.Error(codes.Unavailable, "no database")

					n := startNode(t, ctx, o, uuidpb.Generate(),
						supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
					)
					n.sample(t, 0, "a", 1, pending(a, 3))
					n.Metrics.End(want)
					synctest.Wait()

					node := only(t, o)
					if node.Metrics != nil {
						t.Fatal("expected the values of the ended call to be discarded")
					}
					if !errors.Is(node.MetricsErr, want) {
						t.Fatalf("unexpected error: got %v, want %v", node.MetricsErr, want)
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it calls again after a delay, and shows only what the new call sends", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a, b := uuidpb.Generate(), uuidpb.Generate()

					n := startNode(t, ctx, o, cluster,
						supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
					)
					n.sample(t, 0, "a", 1, pending(a, 3))
					first := only(t, o).Metrics.Call
					n.Metrics.End(status.Error(codes.Unavailable, "no database"))
					synctest.Wait()

					select {
					case <-n.Engine.Calls:
						t.Fatal("expected the Observer to wait before it calls again")
					default:
					}

					time.Sleep(10 * time.Second)

					n.Metrics = <-n.Engine.Calls
					n.sendPreamble(t, n.ID, cluster,
						supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
					)
					n.sample(t, 0, "b", 1, pending(b, 5))

					node := only(t, o)
					if node.MetricsErr != nil {
						t.Fatalf("unexpected error: %v", node.MetricsErr)
					}
					if node.Metrics.Call <= first {
						t.Fatalf("expected a later call: got %d, after %d", node.Metrics.Call, first)
					}
					expectQueues(t, queues(t, node), map[*uuidpb.UUID]uint64{b: 5})

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when the node doesn't report metrics", func(t *testing.T) {
			t.Run("it doesn't call again", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()

					c := connect(ctx, o)
					send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0, 0))

					m := <-c.Calls
					m.End(status.Error(codes.Unimplemented, "no metrics"))
					synctest.Wait()

					time.Sleep(time.Hour)

					select {
					case <-c.Calls:
						t.Fatal("expected no more calls")
					default:
					}

					got := only(t, o).MetricsErr
					if status.Code(got) != codes.Unimplemented {
						t.Fatalf("unexpected error: got %v, want UNIMPLEMENTED", got)
					}

					cancel()
					<-c.Done
				})
			})
		})

		t.Run("when the node breaks the protocol", func(t *testing.T) {
			for _, tc := range []struct {
				Name string
				Send func(t *testing.T, n *metricsNode, cluster *uuidpb.UUID)
			}{
				{
					"the preamble names a different node",
					func(t *testing.T, n *metricsNode, cluster *uuidpb.UUID) {
						n.sendPreamble(t, uuidpb.Generate(), cluster)
					},
				},
				{
					"the preamble names a different cluster",
					func(t *testing.T, n *metricsNode, cluster *uuidpb.UUID) {
						n.sendPreamble(t, n.ID, uuidpb.Generate())
					},
				},
				{
					"the first response isn't a preamble",
					func(t *testing.T, n *metricsNode, cluster *uuidpb.UUID) {
						n.sendRaw(t, 0, "a", 1, nil)
					},
				},
			} {
				t.Run(tc.Name, func(t *testing.T) {
					t.Run("it records an error, and shows no values", func(t *testing.T) {
						synctest.Test(t, func(t *testing.T) {
							ctx, cancel := context.WithCancel(t.Context())
							o := NewObserver()
							cluster := uuidpb.Generate()

							c := connect(ctx, o)
							id := uuidpb.Generate()
							send(t, c, preamble(id, cluster, 0, 0))

							n := &metricsNode{ID: id, Engine: c, Metrics: <-c.Calls}
							tc.Send(t, n, cluster)

							node := only(t, o)
							if node.MetricsErr == nil {
								t.Fatal("expected an error")
							}
							if node.Metrics != nil {
								t.Fatal("expected no values")
							}

							cancel()
							<-c.Done
						})
					})
				})
			}

			t.Run("it ends the call when a sample is malformed", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()

					n := startNode(t, ctx, o, uuidpb.Generate(),
						supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
					)
					n.sendRaw(t, 0, "a", 1, []byte{0xff, 0xff})

					node := only(t, o)
					if node.MetricsErr == nil || node.Metrics != nil {
						t.Fatalf("expected an error and no values: got %v, %v", node.MetricsErr, node.Metrics)
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it ends the call when a sample is of a metric that the preamble doesn't list", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()

					n := startNode(t, ctx, o, uuidpb.Generate(),
						supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
					)
					n.sample(t, 1, "a", 1, pending(uuidpb.Generate(), 1))

					if only(t, o).MetricsErr == nil {
						t.Fatal("expected an error")
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it ends the call when the node sends a second preamble", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()

					n := startNode(t, ctx, o, cluster)
					n.sendPreamble(t, n.ID, cluster)

					if only(t, o).MetricsErr == nil {
						t.Fatal("expected an error")
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when the same node connects again", func(t *testing.T) {
			t.Run("it ends the earlier connection's call before it returns, and discards its values", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a := uuidpb.Generate()

					first := startNode(t, ctx, o, cluster,
						supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER),
					)
					first.sample(t, 0, "a", 1, pending(a, 3))

					second := connect(ctx, o)
					send(t, second, preamble(first.ID, cluster, 0, 0))

					if err := <-first.Engine.Done; !errors.Is(err, ErrSuperseded) {
						t.Fatalf("unexpected error: got %v, want %v", err, ErrSuperseded)
					}
					if first.Metrics.Context().Err() == nil {
						t.Fatal("expected the earlier connection's call to have ended")
					}
					if m := only(t, o).Metrics; m != nil {
						t.Fatalf("unexpected values from the earlier connection: %v", m.Samples)
					}

					// The new connection makes its own call.
					<-second.Calls

					cancel()
					<-second.Done
				})
			})
		})
	})

	t.Run("func Combine()", func(t *testing.T) {
		t.Run("when the reach is the cluster", func(t *testing.T) {
			t.Run("it reads only the node whose call began first, until that call ends", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a, b := uuidpb.Generate(), uuidpb.Generate()
					reach := supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER)

					first := startNode(t, ctx, o, cluster, reach)
					second := startNode(t, ctx, o, cluster, reach)

					first.sample(t, 0, "a", 1, pending(a, 3))
					second.sample(t, 0, "a", 1, pending(a, 4))
					second.sample(t, 0, "b", 1, pending(b, 7))

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 3},
					)

					first.Metrics.End(status.Error(codes.Unavailable, "no database"))
					synctest.Wait()

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 4, b: 7},
					)

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})
		})

		t.Run("when the reach is the node", func(t *testing.T) {
			t.Run("it sums the values of each thing that the nodes measure", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a, b, c := uuidpb.Generate(), uuidpb.Generate(), uuidpb.Generate()
					reach := supports(queuePending, metricsgrpc.Reach_REACH_NODE)

					first := startNode(t, ctx, o, cluster, reach)
					second := startNode(t, ctx, o, cluster, reach)

					// The nodes choose their own subjects, which aren't
					// comparable between nodes.
					first.sample(t, 0, "x", 1, pending(a, 3))
					first.sample(t, 0, "y", 1, pending(b, 2))
					second.sample(t, 0, "p", 1, pending(a, 4))
					second.sample(t, 0, "q", 1, pending(c, 1))

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 7, b: 2, c: 1},
					)

					// The sums don't change what the nodes reported.
					expectQueues(t, queues(t, byID(t, o, first.ID)), map[*uuidpb.UUID]uint64{a: 3, b: 2})

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})

			t.Run("it leaves out a node that has no current call", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a := uuidpb.Generate()
					reach := supports(queuePending, metricsgrpc.Reach_REACH_NODE)

					first := startNode(t, ctx, o, cluster, reach)
					second := startNode(t, ctx, o, cluster, reach)
					first.sample(t, 0, "x", 1, pending(a, 3))
					second.sample(t, 0, "x", 1, pending(a, 4))

					second.Metrics.End(status.Error(codes.Unavailable, "no database"))
					synctest.Wait()

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 3},
					)

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})
		})

		t.Run("it leaves out a node that has stopped reporting", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				cluster := uuidpb.Generate()
				a := uuidpb.Generate()
				reach := supports(queuePending, metricsgrpc.Reach_REACH_NODE)

				first := startNode(t, ctx, o, cluster, reach)
				second := startNode(t, ctx, o, cluster, reach)
				first.sample(t, 0, "x", 1, pending(a, 3))
				second.sample(t, 0, "x", 1, pending(a, 4))

				send(t, second.Engine, heartbeat(10*time.Second))
				time.Sleep(11 * time.Second)

				expectQueues(t,
					combined(t, Combine(time.Now(), o.Nodes())),
					map[*uuidpb.UUID]uint64{a: 3},
				)

				cancel()
				<-first.Engine.Done
				<-second.Engine.Done
			})
		})

		t.Run("when the nodes disagree about a metric's reach", func(t *testing.T) {
			t.Run("it follows the node whose call began first", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a := uuidpb.Generate()

					first := startNode(t, ctx, o, cluster, supports(queuePending, metricsgrpc.Reach_REACH_NODE))
					second := startNode(t, ctx, o, cluster, supports(queuePending, metricsgrpc.Reach_REACH_CLUSTER))
					first.sample(t, 0, "x", 1, pending(a, 3))
					second.sample(t, 0, "x", 1, pending(a, 4))

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 3},
					)

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})
		})

		t.Run("it returns nothing when no node has a call", func(t *testing.T) {
			if got := Combine(time.Now(), NewObserver().Nodes()); len(got) != 0 {
				t.Fatalf("unexpected number of cluster samples: got %d, want 0", len(got))
			}
		})
	})
}
