package observe_test

import (
	"context"
	"math"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"

	. "github.com/dogmatiq/observatory/internal/observe"
)

const queueRemoved = "dogma.metrics.v1alpha1.QueueCommandsRemoved"

// removed is the value of a sample of the QueueCommandsRemoved metric, which is
// a cumulative count.
func removed(queue *uuidpb.UUID, value uint64) proto.Message {
	return metricsgrpc.QueueCommandsRemoved_builder{
		QueueId:         queue,
		CumulativeCount: value,
	}.Build()
}

// rateOf returns the rate of the QueueCommandsRemoved cluster sample of the
// queue, which is nil if the sample has none.
func rateOf(t testing.TB, o *Observer, queue *uuidpb.UUID) *float64 {
	t.Helper()

	var got []*float64
	for _, s := range Combine(time.Now(), o.Nodes()) {
		if s.Metric != queueRemoved {
			continue
		}
		m := s.Message.(*metricsgrpc.QueueCommandsRemoved)
		if m.GetQueueId().AsString() == queue.AsString() {
			got = append(got, s.PerSecond)
		}
	}
	if len(got) != 1 {
		t.Fatalf("unexpected number of samples of the queue: got %d, want 1", len(got))
	}
	return got[0]
}

func expectRate(t testing.TB, got *float64, want float64) {
	t.Helper()

	if got == nil {
		t.Fatalf("unexpected rate: got none, want %g", want)
	}
	if math.Abs(*got-want) > 1e-9 {
		t.Fatalf("unexpected rate: got %g, want %g", *got, want)
	}
}

func expectNoRate(t testing.TB, got *float64) {
	t.Helper()

	if got != nil {
		t.Fatalf("unexpected rate: got %g, want none", *got)
	}
}

func TestRates(t *testing.T) {
	t.Run("it averages the growth of a cumulative count over the time that it has been observed", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			q := uuidpb.Generate()

			n := startNode(t, ctx, o, uuidpb.Generate(), queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 10))
			time.Sleep(10 * time.Second)
			n.sample(t, 0, "q", 2, removed(q, 40))

			expectRate(t, rateOf(t, o, q), 3)

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("it gives no rate until the total has been observed for five seconds", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			q := uuidpb.Generate()

			n := startNode(t, ctx, o, uuidpb.Generate(), queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 10))

			time.Sleep(4 * time.Second)
			expectNoRate(t, rateOf(t, o, q))

			time.Sleep(time.Second)
			expectRate(t, rateOf(t, o, q), 0)

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("it counts a total as unchanged until the next sample, and falls to zero when it stops growing", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			q := uuidpb.Generate()

			n := startNode(t, ctx, o, uuidpb.Generate(), queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 10))
			time.Sleep(10 * time.Second)
			n.sample(t, 0, "q", 2, removed(q, 100))

			time.Sleep(30 * time.Second) // 40 seconds since the first value
			expectRate(t, rateOf(t, o, q), 90.0/40)

			time.Sleep(40 * time.Second) // 80 seconds since the first value
			expectRate(t, rateOf(t, o, q), 0)

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("it averages over the last minute only", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			q := uuidpb.Generate()

			n := startNode(t, ctx, o, uuidpb.Generate(), queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 10))
			time.Sleep(50 * time.Second)
			n.sample(t, 0, "q", 2, removed(q, 100))

			// The window began 10 seconds after the first value, when the total
			// was still 10.
			time.Sleep(20 * time.Second)
			expectRate(t, rateOf(t, o, q), 90.0/60)

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("it measures the growth since the start of the window, however long ago the previous sample was", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			q := uuidpb.Generate()

			n := startNode(t, ctx, o, uuidpb.Generate(), queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 10))
			time.Sleep(2 * time.Minute)
			n.sample(t, 0, "q", 2, removed(q, 100))

			time.Sleep(10 * time.Second)
			expectRate(t, rateOf(t, o, q), 90.0/60)

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("it starts again when the node starts counting again from zero", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			q := uuidpb.Generate()

			n := startNode(t, ctx, o, uuidpb.Generate(), queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 1000))
			time.Sleep(10 * time.Second)
			n.sample(t, 0, "q", 2, removed(q, 5))

			expectNoRate(t, rateOf(t, o, q))

			time.Sleep(10 * time.Second)
			n.sample(t, 0, "q", 3, removed(q, 25))

			expectRate(t, rateOf(t, o, q), 2)

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("it never makes a rate from the values of different calls", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			q := uuidpb.Generate()

			n := startNode(t, ctx, o, uuidpb.Generate(), queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 10))
			time.Sleep(10 * time.Second)
			expectRate(t, rateOf(t, o, q), 0)

			n.Metrics.End(status.Error(codes.Unavailable, "no database"))
			synctest.Wait()
			time.Sleep(5 * time.Second)

			n.Metrics = <-n.Engine.Calls
			n.sendPreamble(t, n.ID, n.Cluster, queueRemoved)
			n.sample(t, 0, "q", 1, removed(q, 5000))

			expectNoRate(t, rateOf(t, o, q))

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("it gives no rate for a metric that isn't a cumulative count", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()

			n := startNode(t, ctx, o, uuidpb.Generate(), queuePending)
			n.sample(t, 0, "q", 1, pending(uuidpb.Generate(), 10))
			time.Sleep(time.Minute)

			samples := Combine(time.Now(), o.Nodes())
			if len(samples) != 1 {
				t.Fatalf("unexpected number of cluster samples: got %d, want 1", len(samples))
			}
			expectNoRate(t, samples[0].PerSecond)

			cancel()
			<-n.Engine.Done
		})
	})

	t.Run("when several nodes report the count", func(t *testing.T) {
		t.Run("it adds the rates of the nodes", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				cluster := uuidpb.Generate()
				q := uuidpb.Generate()

				first := startNode(t, ctx, o, cluster, queueRemoved)
				second := startNode(t, ctx, o, cluster, queueRemoved)

				first.sample(t, 0, "x", 1, removed(q, 0))
				second.sample(t, 0, "x", 1, removed(q, 100))
				time.Sleep(10 * time.Second)
				first.sample(t, 0, "x", 2, removed(q, 20))
				second.sample(t, 0, "x", 2, removed(q, 130))

				expectRate(t, rateOf(t, o, q), 5)

				cancel()
				<-first.Engine.Done
				<-second.Engine.Done
			})
		})

		t.Run("it gives no rate while any node's total is too new", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				cluster := uuidpb.Generate()
				q := uuidpb.Generate()

				first := startNode(t, ctx, o, cluster, queueRemoved)
				second := startNode(t, ctx, o, cluster, queueRemoved)

				first.sample(t, 0, "x", 1, removed(q, 0))
				time.Sleep(10 * time.Second)
				second.sample(t, 0, "x", 1, removed(q, 100))

				expectNoRate(t, rateOf(t, o, q))

				time.Sleep(5 * time.Second)
				expectRate(t, rateOf(t, o, q), 0)

				cancel()
				<-first.Engine.Done
				<-second.Engine.Done
			})
		})
	})

	t.Run("when a call to WatchClusterMetrics reports the count", func(t *testing.T) {
		t.Run("it takes the rate of that call", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				o := NewObserver()
				cluster := uuidpb.Generate()
				q := uuidpb.Generate()

				first := startNode(t, ctx, o, cluster, queueRemoved)
				second := startNode(t, ctx, o, cluster, queueRemoved)
				call := first.startClusterCall(t, queueRemoved)

				sendSample(t, call, 0, "x", 1, removed(q, 0))
				second.sample(t, 0, "x", 1, removed(q, 500))
				time.Sleep(10 * time.Second)
				sendSample(t, call, 0, "x", 2, removed(q, 20))
				second.sample(t, 0, "x", 2, removed(q, 900))

				expectRate(t, rateOf(t, o, q), 2)

				cancel()
				<-first.Engine.Done
				<-second.Engine.Done
			})
		})
	})
}
