package observe_test

import (
	"context"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"

	. "github.com/dogmatiq/observatory/internal/observe"
)

func TestCoverage(t *testing.T) {
	// partway starts two nodes of one cluster, which both report the number of
	// commands in queues, and only one of which reports the events that handlers
	// record, as if a deploy were partway through, and gives the test the view of
	// the cluster.
	partway := func(t *testing.T, test func(o *Observer, r *Recorder, c *uuidpb.UUID)) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := NewObserver(), NewRecorder()
			c := uuidpb.Generate()
			app := appOf("statements", uuidpb.Generate())
			h := uuidpb.Generate()

			dueMetric := name(new(metricsgrpc.QueueCommandsDue))
			recordedMetric := name(new(metricsgrpc.HandlerEventsRecorded))

			newer := startApp(t, ctx, o, c, app, dueMetric, recordedMetric)
			older := startApp(t, ctx, o, c, app, dueMetric)

			q := uuidpb.Generate()
			newer.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsDue_builder{QueueId: q, CurrentCount: 3}.Build())
			older.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsDue_builder{QueueId: q, CurrentCount: 4}.Build())
			newer.sample(t, 1, "h", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h, CumulativeCount: 100}.Build())
			r.Record(time.Now(), o.Nodes())

			time.Sleep(10 * time.Second)
			newer.sample(t, 1, "h", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h, CumulativeCount: 160}.Build())
			r.Record(time.Now(), o.Nodes())

			test(o, r, c)
		})
	}

	t.Run("it leaves out a metric that a call to WatchClusterMetrics reports", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			c := uuidpb.Generate()
			app := appOf("statements", uuidpb.Generate())

			newer := startApp(t, ctx, o, c, app, queuePending)
			older := startApp(t, ctx, o, c, app)
			newer.startClusterCall(t, queuePending)

			if got := Coverage(time.Now(), o.Nodes()); len(got) != 0 {
				t.Fatalf("unexpected coverage: %v", got)
			}

			cancel()
			<-newer.Engine.Done
			<-older.Engine.Done
		})
	})

	t.Run("it is the share of the nodes that support each metric that is combined from the nodes' own calls, and that only some of them support", func(t *testing.T) {
		partway(t, func(o *Observer, _ *Recorder, _ *uuidpb.UUID) {
			got := Coverage(time.Now(), o.Nodes())
			if len(got) != 1 || got[name(new(metricsgrpc.HandlerEventsRecorded))] != 0.5 {
				t.Fatalf("unexpected coverage: %v", got)
			}
		})
	})

	t.Run("it counts a member of the cluster that isn't reporting as a node that doesn't list any metric", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			c := uuidpb.Generate()
			app := appOf("statements", uuidpb.Generate())

			a := startApp(t, ctx, o, c, app, queuePending)
			b := startApp(t, ctx, o, c, app, queuePending)
			silent := uuidpb.Generate()
			send(t, a.Engine, liveNodes(a.ID, b.ID, silent))
			send(t, b.Engine, liveNodes(a.ID, b.ID, silent))

			got := Coverage(time.Now(), o.Nodes())
			if len(got) != 1 || got[queuePending] != 2.0/3 {
				t.Fatalf("unexpected coverage: %v", got)
			}

			cancel()
			<-a.Engine.Done
			<-b.Engine.Done
		})
	})

	t.Run("it doesn't count a node that has left the cluster's sets of live nodes", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o := NewObserver()
			c := uuidpb.Generate()
			app := appOf("statements", uuidpb.Generate())

			a := startApp(t, ctx, o, c, app, queuePending)
			b := startApp(t, ctx, o, c, app, queuePending)
			send(t, a.Engine, liveNodes(a.ID))
			send(t, b.Engine, liveNodes(a.ID, b.ID))

			b.Engine.Feed.End(nil)
			<-b.Engine.Done
			synctest.Wait()

			if got := Coverage(time.Now(), o.Nodes()); len(got) != 0 {
				t.Fatalf("unexpected coverage: %v", got)
			}

			cancel()
			<-a.Engine.Done
		})
	})

	t.Run("it gives the tiles and cards that are made from those metrics their coverage, and keeps the sums of the nodes that support them", func(t *testing.T) {
		partway(t, func(o *Observer, r *Recorder, c *uuidpb.UUID) {
			v := viewOf(t, r, o, c).Overview

			if v.Events == nil || v.Events.Coverage == nil || *v.Events.Coverage != 0.5 {
				t.Fatalf("expected an events tile with half coverage: %+v", v.Events)
			}
			if v.Events.Rate == nil || v.Events.Rate.PerSecond == nil {
				t.Fatalf("expected the rate of the node that supports it: %+v", v.Events.Rate)
			}
			if v.Queues == nil || v.Queues.Coverage != nil {
				t.Fatalf("expected a queues tile with whole coverage: %+v", v.Queues)
			}
			for _, card := range v.Handlers {
				if card.Coverage == nil || *card.Coverage != 0.5 {
					t.Fatalf("expected a card with half coverage: %+v", card)
				}
			}
		})
	})
}
