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

			pendingMetric := supports(name(new(metricsgrpc.QueueCommandsPending)), metricsgrpc.Reach_REACH_NODE)
			recordedMetric := supports(name(new(metricsgrpc.HandlerEventsRecorded)), metricsgrpc.Reach_REACH_NODE)

			newer := startApp(t, ctx, o, c, app, pendingMetric, recordedMetric)
			older := startApp(t, ctx, o, c, app, pendingMetric)

			q := uuidpb.Generate()
			newer.sample(t, 0, "q", 1, pending(q, 3))
			older.sample(t, 0, "q", 1, pending(q, 4))
			newer.sample(t, 1, "h", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h, Value: 100}.Build())
			r.Record(time.Now(), o.Nodes())

			time.Sleep(10 * time.Second)
			newer.sample(t, 1, "h", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h, Value: 160}.Build())
			r.Record(time.Now(), o.Nodes())

			test(o, r, c)
		})
	}

	t.Run("it is the share of the nodes that support each metric whose reach is the node that only some of them support", func(t *testing.T) {
		partway(t, func(o *Observer, _ *Recorder, _ *uuidpb.UUID) {
			got := Coverage(time.Now(), o.Nodes())
			if len(got) != 1 || got[name(new(metricsgrpc.HandlerEventsRecorded))] != 0.5 {
				t.Fatalf("unexpected coverage: %v", got)
			}
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
