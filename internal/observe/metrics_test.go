package observe_test

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/configpb"
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
	streamLength = "dogma.metrics.v1alpha1.EventStreamLength"
	handlerLag   = "dogma.metrics.v1alpha1.HandlerEventStreamLag"
)

// pending is the value of a sample of the QueueCommandsPending metric.
func pending(queue *uuidpb.UUID, value uint64) proto.Message {
	return metricsgrpc.QueueCommandsPending_builder{
		QueueId:      queue,
		CurrentCount: value,
	}.Build()
}

// metricsNode is a node that has begun a call to the Observer's
// WatchNodeMetrics.
type metricsNode struct {
	ID      *uuidpb.UUID
	Cluster *uuidpb.UUID
	App     *configpb.Application
	Engine  connection
	Metrics *metricsFeed
}

// startNode connects a node of the cluster, or an engine that doesn't run as a
// cluster if cluster is nil, and begins its call to WatchNodeMetrics with a
// preamble that lists the given metrics. The index of each metric in samples is
// its position in the list.
func startNode(
	t *testing.T,
	ctx context.Context,
	o *Observer,
	cluster *uuidpb.UUID,
	supported ...string,
) *metricsNode {
	t.Helper()

	n := &metricsNode{ID: uuidpb.Generate(), Cluster: cluster}
	n.Engine = connect(ctx, o)
	send(t, n.Engine, preamble(n.ID, cluster, 0))

	n.Metrics = <-n.Engine.Calls
	n.sendPreamble(t, n.ID, cluster, supported...)

	return n
}

// startClusterCall waits for the Observer to call the node's
// WatchClusterMetrics, and begins the call with a preamble that lists the given
// metrics.
func (n *metricsNode) startClusterCall(t *testing.T, supported ...string) *metricsFeed {
	t.Helper()

	f := <-n.Engine.ClusterCalls
	sendMetrics(t, f, metricsgrpc.WatchMetricsResponse_builder{
		Preamble: metricsgrpc.WatchMetricsResponse_Preamble_builder{
			Id:               n.ID,
			ClusterId:        n.Cluster,
			Application:      n.App,
			SupportedMetrics: supported,
		}.Build(),
	})
	return f
}

// sendPreamble sends the preamble of the node's call to WatchNodeMetrics, which
// names the given node and cluster, and the node's application, and lists the
// given metrics.
func (n *metricsNode) sendPreamble(
	t *testing.T,
	node, cluster *uuidpb.UUID,
	supported ...string,
) {
	t.Helper()

	sendMetrics(t, n.Metrics, metricsgrpc.WatchMetricsResponse_builder{
		Preamble: metricsgrpc.WatchMetricsResponse_Preamble_builder{
			Id:               node,
			ClusterId:        cluster,
			Application:      n.App,
			SupportedMetrics: supported,
		}.Build(),
	})
}

// sample sends a sample on the node's call to WatchNodeMetrics, and waits for
// the Observer to finish handling it.
func (n *metricsNode) sample(
	t *testing.T,
	metric uint32,
	subject string,
	revision byte,
	value proto.Message,
) {
	t.Helper()
	sendSample(t, n.Metrics, metric, subject, revision, value)
}

func (n *metricsNode) sendRaw(
	t *testing.T,
	metric uint32,
	subject string,
	revision byte,
	value []byte,
) {
	t.Helper()
	sendRawSample(t, n.Metrics, metric, subject, revision, value)
}

// tombstone sends a Tombstone on the node's call to WatchNodeMetrics, and waits
// for the Observer to finish handling it.
func (n *metricsNode) tombstone(t *testing.T, metric uint32, subject string, revision byte) {
	t.Helper()

	sendMetrics(t, n.Metrics, metricsgrpc.WatchMetricsResponse_builder{
		Tombstone: metricsgrpc.WatchMetricsResponse_Tombstone_builder{
			MetricIndex: metric,
			Subject:     []byte(subject),
			Revision:    []byte{revision},
		}.Build(),
	})
}

// sendSample sends a sample on a call to the metrics API, and waits for the
// Observer to finish handling it.
func sendSample(
	t *testing.T,
	f *metricsFeed,
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

	sendRawSample(t, f, metric, subject, revision, b)
}

func sendRawSample(
	t *testing.T,
	f *metricsFeed,
	metric uint32,
	subject string,
	revision byte,
	value []byte,
) {
	t.Helper()

	sendMetrics(t, f, metricsgrpc.WatchMetricsResponse_builder{
		Sample: metricsgrpc.WatchMetricsResponse_Sample_builder{
			MetricIndex: metric,
			Subject:     []byte(subject),
			Value:       value,
			Revision:    []byte{revision},
		}.Build(),
	})
}

func sendMetrics(t *testing.T, f *metricsFeed, b metricsgrpc.WatchMetricsResponse_builder) {
	t.Helper()

	if err := f.Send(b.Build()); err != nil {
		t.Fatal(err)
	}
	synctest.Wait()
}

// expectNoCall fails the test if the Observer has begun a call that is waiting
// in calls.
func expectNoCall(t *testing.T, calls <-chan *metricsFeed) {
	t.Helper()

	synctest.Wait()
	select {
	case <-calls:
		t.Fatal("unexpected call")
	default:
	}
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
			got[m.GetQueueId().AsString()] = m.GetCurrentCount()
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
			got[m.GetQueueId().AsString()] = m.GetCurrentCount()
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
					queuePending,
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
					queuePending,
				)
				n.sample(t, 0, "a", 2, pending(a, 4))
				n.sample(t, 0, "a", 1, pending(a, 3))

				expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{a: 4})

				cancel()
				<-n.Engine.Done
			})
		})

		t.Run("when the node sends a Tombstone", func(t *testing.T) {
			t.Run("it discards the sample of the series", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					a, b := uuidpb.Generate(), uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queuePending)
					n.sample(t, 0, "a", 1, pending(a, 3))
					n.sample(t, 0, "b", 1, pending(b, 5))
					n.tombstone(t, 0, "a", 2)

					expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{b: 5})

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it keeps a sample whose revision is greater", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queuePending)
					n.sample(t, 0, "a", 2, pending(a, 3))
					n.tombstone(t, 0, "a", 1)

					expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{a: 3})

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it ignores a later sample whose revision is less, and records one whose revision is greater", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queuePending)
					n.sample(t, 0, "a", 1, pending(a, 3))
					n.tombstone(t, 0, "a", 3)
					n.sample(t, 0, "a", 2, pending(a, 4))

					expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{})

					n.sample(t, 0, "a", 4, pending(a, 5))

					expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{a: 5})

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it ends the call when the Tombstone is of a metric that the preamble doesn't list", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()

					n := startNode(t, ctx, o, uuidpb.Generate(), queuePending)
					n.tombstone(t, 1, "a", 1)

					if only(t, o).MetricsErr == nil {
						t.Fatal("expected an error")
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when the engine runs as a cluster", func(t *testing.T) {
			t.Run("it calls WatchClusterMetrics on one node of the cluster, and records what it reports", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a := uuidpb.Generate()

					first := startNode(t, ctx, o, cluster)
					second := startNode(t, ctx, o, cluster)

					call := first.startClusterCall(t, queuePending)
					sendSample(t, call, 0, "a", 1, pending(a, 3))
					expectNoCall(t, second.Engine.ClusterCalls)

					m := byID(t, o, first.ID).ClusterMetrics
					if m == nil || len(m.Samples) != 1 {
						t.Fatalf("unexpected cluster metrics: %+v", m)
					}
					if m := byID(t, o, second.ID).ClusterMetrics; m != nil {
						t.Fatalf("unexpected cluster metrics of the other node: %+v", m)
					}

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})

			t.Run("when the call ends", func(t *testing.T) {
				t.Run("it calls another node of the cluster at once, and the node whose call ended once that call ends too", func(t *testing.T) {
					synctest.Test(t, func(t *testing.T) {
						ctx, cancel := context.WithCancel(t.Context())
						o := NewObserver()
						cluster := uuidpb.Generate()
						want := status.Error(codes.Unavailable, "no database")

						first := startNode(t, ctx, o, cluster)
						second := startNode(t, ctx, o, cluster)

						call := first.startClusterCall(t, queuePending)
						call.End(want)
						synctest.Wait()

						if err := byID(t, o, first.ID).ClusterMetricsErr; !errors.Is(err, want) {
							t.Fatalf("unexpected error: got %v, want %v", err, want)
						}

						call = second.startClusterCall(t, queuePending)

						// The node whose call ended waits, and then finds the cluster read
						// through the other node.
						time.Sleep(time.Minute)
						expectNoCall(t, first.Engine.ClusterCalls)

						call.End(want)
						first.startClusterCall(t, queuePending)

						cancel()
						<-first.Engine.Done
						<-second.Engine.Done
					})
				})

				t.Run("it calls another node of the cluster when the node's connection ends", func(t *testing.T) {
					synctest.Test(t, func(t *testing.T) {
						ctx, cancel := context.WithCancel(t.Context())
						o := NewObserver()
						cluster := uuidpb.Generate()

						first := startNode(t, ctx, o, cluster)
						second := startNode(t, ctx, o, cluster)
						first.startClusterCall(t, queuePending)

						first.Engine.Feed.End(nil)
						<-first.Engine.Done

						second.startClusterCall(t, queuePending)

						cancel()
						<-second.Engine.Done
					})
				})
			})

			t.Run("when the node fails the call with UNIMPLEMENTED", func(t *testing.T) {
				t.Run("it doesn't call that node again", func(t *testing.T) {
					synctest.Test(t, func(t *testing.T) {
						ctx, cancel := context.WithCancel(t.Context())
						o := NewObserver()

						n := startNode(t, ctx, o, uuidpb.Generate())
						call := <-n.Engine.ClusterCalls
						call.End(status.Error(codes.Unimplemented, "no cluster metrics"))
						synctest.Wait()

						time.Sleep(time.Hour)
						expectNoCall(t, n.Engine.ClusterCalls)

						cancel()
						<-n.Engine.Done
					})
				})
			})
		})

		t.Run("when the engine doesn't run as a cluster", func(t *testing.T) {
			t.Run("it calls only WatchNodeMetrics", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, nil, queuePending)
					n.sample(t, 0, "a", 1, pending(a, 3))

					expectQueues(t, queues(t, only(t, o)), map[*uuidpb.UUID]uint64{a: 3})
					expectNoCall(t, n.Engine.ClusterCalls)

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("it records the time that each sample arrived", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()

				n := startNode(t, ctx, o, uuidpb.Generate(),
					queuePending,
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
					queuePending,
					queueDue,
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
					"WatchNodeMetricsRequest":    true,
					"WatchClusterMetricsRequest": true,
					"WatchMetricsResponse":       true,
				}

				var supported []string
				protoregistry.GlobalFiles.RangeFilesByPackage(
					new(metricsgrpc.QueueCommandsPending).ProtoReflect().Descriptor().ParentFile().Package(),
					func(f protoreflect.FileDescriptor) bool {
						for i := range f.Messages().Len() {
							m := f.Messages().Get(i)
							if !api[m.Name()] {
								supported = append(supported, string(m.FullName()))
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
					"example.CustomMetric",
					"dogma.metrics.v1alpha1.WatchMetricsResponse",
					queuePending,
				)
				n.sendRaw(t, 0, "x", 1, []byte("anything"))
				n.sendRaw(t, 1, "x", 1, []byte("anything"))
				n.tombstone(t, 0, "x", 2)
				n.sample(t, 2, "a", 1, pending(a, 3))

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
						queuePending,
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
						queuePending,
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
						queuePending,
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
					send(t, c, preamble(uuidpb.Generate(), uuidpb.Generate(), 0))

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
					"the preamble names no cluster",
					func(t *testing.T, n *metricsNode, cluster *uuidpb.UUID) {
						n.sendPreamble(t, n.ID, nil)
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
							send(t, c, preamble(id, cluster, 0))

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
						queuePending,
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
						queuePending,
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
						queuePending,
					)
					first.sample(t, 0, "a", 1, pending(a, 3))

					second := connect(ctx, o)
					send(t, second, preamble(first.ID, cluster, 0))

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
		t.Run("when a node's call to WatchClusterMetrics reports the metric", func(t *testing.T) {
			t.Run("it reads that call alone, and the nodes' own calls once it ends", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a, b := uuidpb.Generate(), uuidpb.Generate()

					first := startNode(t, ctx, o, cluster, queuePending)
					second := startNode(t, ctx, o, cluster, queuePending)

					call := first.startClusterCall(t, queuePending)
					sendSample(t, call, 0, "a", 1, pending(a, 10))
					first.sample(t, 0, "a", 1, pending(a, 3))
					second.sample(t, 0, "a", 1, pending(a, 4))
					second.sample(t, 0, "b", 1, pending(b, 7))

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 10},
					)

					call.End(status.Error(codes.Unavailable, "no database"))
					synctest.Wait()

					// Until another node's call reports the metric, the nodes' own
					// counts are added up.
					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 7, b: 7},
					)

					call = second.startClusterCall(t, queuePending)
					sendSample(t, call, 0, "a", 1, pending(a, 11))

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 11},
					)

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})
		})

		t.Run("when the metric is a count", func(t *testing.T) {
			t.Run("it sums the values of each thing that the nodes measure", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a, b, c := uuidpb.Generate(), uuidpb.Generate(), uuidpb.Generate()

					first := startNode(t, ctx, o, cluster, queuePending)
					second := startNode(t, ctx, o, cluster, queuePending)

					// Nodes of one cluster give the same subject to the same queue.
					first.sample(t, 0, "x", 1, pending(a, 3))
					first.sample(t, 0, "y", 1, pending(b, 2))
					second.sample(t, 0, "x", 1, pending(a, 4))
					second.sample(t, 0, "z", 1, pending(c, 1))

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

			t.Run("it adds only the samples that have the same subject", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a := uuidpb.Generate()

					first := startNode(t, ctx, o, cluster, queuePending)
					second := startNode(t, ctx, o, cluster, queuePending)

					// The messages are equal, but the subjects are not, and the
					// subject is what says that two samples are of one thing.
					first.sample(t, 0, "x", 1, pending(a, 3))
					second.sample(t, 0, "y", 1, pending(a, 4))

					if got := len(Combine(time.Now(), o.Nodes())); got != 2 {
						t.Fatalf("unexpected number of cluster samples: got %d, want 2", got)
					}

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})

			t.Run("it adds nothing for a node that has sent a Tombstone for the subject", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					a := uuidpb.Generate()

					first := startNode(t, ctx, o, cluster, queuePending)
					second := startNode(t, ctx, o, cluster, queuePending)

					// The queue's work moves from the second node to the first.
					first.sample(t, 0, "x", 1, pending(a, 3))
					second.sample(t, 0, "x", 1, pending(a, 4))
					second.tombstone(t, 0, "x", 2)

					expectQueues(t,
						combined(t, Combine(time.Now(), o.Nodes())),
						map[*uuidpb.UUID]uint64{a: 3},
					)

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

					first := startNode(t, ctx, o, cluster, queuePending)
					second := startNode(t, ctx, o, cluster, queuePending)
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

		t.Run("when the metric is the length of an event stream", func(t *testing.T) {
			t.Run("it takes the greatest that any node reports", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					cluster := uuidpb.Generate()
					stream := uuidpb.Generate()

					first := startNode(t, ctx, o, cluster, streamLength)
					second := startNode(t, ctx, o, cluster, streamLength)
					first.sample(t, 0, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: stream, Watermark: 9}.Build())
					second.sample(t, 0, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: stream, Watermark: 5}.Build())

					samples := Combine(time.Now(), o.Nodes())
					if len(samples) != 1 {
						t.Fatalf("unexpected number of cluster samples: got %d, want 1", len(samples))
					}
					if got := samples[0].Message.(*metricsgrpc.EventStreamLength).GetWatermark(); got != 9 {
						t.Fatalf("unexpected length: got %d, want 9", got)
					}

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})
		})

		t.Run("when the spec gives no rule for combining the metric", func(t *testing.T) {
			lag := func(value uint64) proto.Message {
				return metricsgrpc.HandlerEventStreamLag_builder{
					HandlerKey:    uuidpb.Generate(),
					EventStreamId: uuidpb.Generate(),
					Gauge:         value,
				}.Build()
			}

			t.Run("it leaves out the nodes' own samples of it, when the engine runs as a cluster", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()

					n := startNode(t, ctx, o, uuidpb.Generate(), handlerLag)
					n.sample(t, 0, "h", 1, lag(3))

					if got := len(Combine(time.Now(), o.Nodes())); got != 0 {
						t.Fatalf("unexpected number of cluster samples: got %d, want 0", got)
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it reads the samples of an engine that doesn't run as a cluster", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()

					n := startNode(t, ctx, o, nil, handlerLag)
					n.sample(t, 0, "h", 1, lag(3))

					samples := Combine(time.Now(), o.Nodes())
					if len(samples) != 1 {
						t.Fatalf("unexpected number of cluster samples: got %d, want 1", len(samples))
					}
					if got := samples[0].Message.(*metricsgrpc.HandlerEventStreamLag).GetGauge(); got != 3 {
						t.Fatalf("unexpected lag: got %d, want 3", got)
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("it leaves out a node that has stopped reporting", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				cluster := uuidpb.Generate()
				a := uuidpb.Generate()

				first := startNode(t, ctx, o, cluster, queuePending)
				second := startNode(t, ctx, o, cluster, queuePending)
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

		t.Run("it returns nothing when no node has a call", func(t *testing.T) {
			if got := Combine(time.Now(), NewObserver().Nodes()); len(got) != 0 {
				t.Fatalf("unexpected number of cluster samples: got %d, want 0", len(got))
			}
		})
	})
}

func TestSupported(t *testing.T) {
	t.Run("it lists the metrics of the nodes that are reporting and have a call, and no others", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			stopped, stop := context.WithCancel(t.Context())
			o := NewObserver()
			c := uuidpb.Generate()

			a := startNode(t, ctx, o, c, queuePending)
			b := startNode(t, stopped, o, c, queueDue)

			got := Supported(time.Now(), o.Nodes())
			if len(got) != 2 || !got[queuePending] || !got[queueDue] {
				t.Fatalf("unexpected metrics: %v", got)
			}

			stop()
			<-b.Engine.Done

			got = Supported(time.Now(), o.Nodes())
			if len(got) != 1 || !got[queuePending] {
				t.Fatalf("unexpected metrics: %v", got)
			}

			cancel()
			<-a.Engine.Done
		})
	})

	t.Run("it lists a metric that has no rule for combining only if the engine doesn't run as a cluster, or a call to WatchClusterMetrics reports it", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()

			engine := startNode(t, ctx, o, nil, handlerLag)
			if got := Supported(time.Now(), o.Nodes()); !got[handlerLag] {
				t.Fatalf("unexpected metrics of an engine that doesn't run as a cluster: %v", got)
			}

			n := startNode(t, ctx, o, uuidpb.Generate(), handlerLag)
			if got := Supported(time.Now(), []Node{byID(t, o, n.ID)}); got[handlerLag] {
				t.Fatalf("unexpected metrics of a cluster: %v", got)
			}

			n.startClusterCall(t, handlerLag)
			if got := Supported(time.Now(), []Node{byID(t, o, n.ID)}); !got[handlerLag] {
				t.Fatalf("unexpected metrics of a cluster: %v", got)
			}

			cancel()
			<-engine.Engine.Done
			<-n.Engine.Done
		})
	})
}
