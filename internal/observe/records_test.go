package observe_test

import (
	"context"
	"reflect"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"

	. "github.com/dogmatiq/observatory/internal/observe"
)

func TestRecords(t *testing.T) {
	// connected connects a node of a cluster at a site, and ends its connection.
	connected := func(t *testing.T, o *Observer, cluster *uuidpb.UUID) {
		t.Helper()

		n := startAppInSite(t, t.Context(), o, cluster, identity("eu-west", uuidpb.Generate()), appOf("statements", uuidpb.Generate()))
		n.Engine.Feed.End(nil)
		<-n.Engine.Done
	}

	t.Run("it remembers the application and site of a cluster that it has had a node of", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			o := NewObserver()
			cluster := uuidpb.Generate()

			if _, ok := o.Record(cluster.AsString()); ok {
				t.Fatal("expected no record of a cluster that never connected")
			}

			connected(t, o, cluster)

			rec, ok := o.Record(cluster.AsString())
			if !ok || rec.Application.Name != "statements" || rec.Site != "eu-west" || !rec.Clustered {
				t.Fatalf("unexpected record: %+v", rec)
			}
		})
	})

	t.Run("it remembers an engine that doesn't run as a cluster by its own ID", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			o := NewObserver()

			n := startApp(t, t.Context(), o, nil, appOf("statements", uuidpb.Generate()))
			n.Engine.Feed.End(nil)
			<-n.Engine.Done

			rec, ok := o.Record(n.ID.AsString())
			if !ok || rec.Application.Name != "statements" || rec.Clustered {
				t.Fatalf("unexpected record: %+v", rec)
			}
		})
	})

	t.Run("it keeps the record after forgetting the nodes of an idle cluster, which then lists as not reporting", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			o := NewObserver()
			cluster := uuidpb.Generate()
			connected(t, o, cluster)

			time.Sleep(4 * 24 * time.Hour)
			o.ForgetIdle(time.Now())

			if got := len(o.Nodes()); got != 0 {
				t.Fatalf("unexpected number of nodes: got %d, want 0", got)
			}

			rec, ok := o.Record(cluster.AsString())
			if !ok || rec.Application.Name != "statements" {
				t.Fatalf("unexpected record: %+v", rec)
			}

			list := o.Clusters(time.Now())
			if len(list) != 1 || list[0].ID != cluster.AsString() || list[0].Reporting || list[0].Site != "eu-west" || list[0].Application.Name != "statements" {
				t.Fatalf("unexpected clusters: %+v", list)
			}
		})
	})

	t.Run("it lists a cluster that has a node reporting as reporting, with the clusters that it only remembers after it", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx := t.Context()
			o := NewObserver()
			down, up := uuidpb.Generate(), uuidpb.Generate()

			connected(t, o, down)
			time.Sleep(4 * 24 * time.Hour)
			o.ForgetIdle(time.Now())

			n := startApp(t, ctx, o, up, appOf("billing", uuidpb.Generate()))

			reporting := map[string]bool{}
			for _, c := range o.Clusters(time.Now()) {
				reporting[c.ID] = c.Reporting
			}
			if len(reporting) != 2 || reporting[down.AsString()] || !reporting[up.AsString()] {
				t.Fatalf("unexpected clusters: %v", reporting)
			}

			n.Engine.Feed.End(nil)
			<-n.Engine.Done
		})
	})

	t.Run("it forgets the record when the cluster is removed", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			o := NewObserver()
			cluster := uuidpb.Generate()
			connected(t, o, cluster)

			o.Forget(cluster)

			if _, ok := o.Record(cluster.AsString()); ok {
				t.Fatal("expected no record after the cluster was removed")
			}
			if got := len(o.Clusters(time.Now())); got != 0 {
				t.Fatalf("unexpected number of clusters: got %d, want 0", got)
			}
		})
	})

	t.Run("the view of a down cluster has its application and site, and no live node", func(t *testing.T) {
		view := DownView(ClusterRecord{
			ID:          "c",
			Clustered:   true,
			Application: Application{Name: "statements", Key: "k"},
			Site:        "eu-west",
		})

		if view.Application.Name != "statements" || view.Site != "eu-west" {
			t.Fatalf("unexpected view: %+v", view)
		}
		if view.Overview.Cluster.Nodes == nil || len(view.Overview.Cluster.Nodes) != 0 || view.Overview.Handlers == nil || len(view.Overview.Handlers) != 0 {
			t.Fatalf("expected empty, non-nil nodes and handlers: %+v", view.Overview)
		}
		if !view.Down {
			t.Fatal("expected a view that says the cluster is down")
		}
		if view.Overview.Events != nil || view.Overview.Queues != nil || view.Overview.Engine != nil {
			t.Fatalf("expected no tiles but the cluster's: %+v", view.Overview)
		}
	})

	t.Run("the view of a down engine that doesn't run as a cluster has an engine tile with no engine", func(t *testing.T) {
		view := DownView(ClusterRecord{
			ID:          "e",
			Application: Application{Name: "statements", Key: "k"},
		})

		if !view.Down || view.Overview.Cluster != nil {
			t.Fatalf("unexpected view: %+v", view)
		}
		if view.Overview.Engine == nil || view.Overview.Engine.Node != nil {
			t.Fatalf("expected an engine tile with no engine: %+v", view.Overview.Engine)
		}
	})
}

func TestDown(t *testing.T) {
	t.Run("a cluster whose nodes have stopped reporting, and that the Observer still has nodes of, keeps what it showed, as down, with no rate and no live node", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := NewObserver(), NewRecorder()
			c := uuidpb.Generate()
			stream := uuidpb.Generate()

			n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
				name(new(metricsgrpc.EventStreamLength)),
				name(new(metricsgrpc.HandlerEventsRecorded)),
			)
			h := uuidpb.Generate()
			n.sample(t, 0, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: stream, Watermark: 50}.Build())
			n.sample(t, 1, "h", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h, CumulativeCount: 100}.Build())
			r.Record(time.Now(), o.Nodes())

			time.Sleep(10 * time.Second)
			n.sample(t, 1, "h", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: h, CumulativeCount: 160}.Build())
			r.Record(time.Now(), o.Nodes())

			live := viewOf(t, r, o, c)
			if live.Down || live.Overview.Events == nil || live.Overview.Events.Rate.PerSecond == nil {
				t.Fatalf("expected a live view with a rate: %+v", live.Overview.Events)
			}

			// The node ends its connection, so that nothing is reporting.
			n.Engine.Feed.End(nil)
			<-n.Engine.Done
			time.Sleep(time.Second)
			r.Record(time.Now(), o.Nodes())

			v := viewOf(t, r, o, c)
			if !v.Down {
				t.Fatal("expected a down view")
			}
			if v.Application.Name != "statements" {
				t.Fatalf("unexpected application: %+v", v.Application)
			}
			if v.Overview.Events == nil || len(v.Overview.Events.Streams) != 1 || v.Overview.Events.Streams[0].Size != 50 {
				t.Fatalf("expected the streams that it showed: %+v", v.Overview.Events)
			}
			if v.Overview.Events.Rate == nil || v.Overview.Events.Rate.PerSecond != nil {
				t.Fatalf("expected a rate that is unknown: %+v", v.Overview.Events.Rate)
			}
			if v.Overview.Cluster.Nodes == nil || len(v.Overview.Cluster.Nodes) != 0 {
				t.Fatalf("expected no live node: %+v", v.Overview.Cluster)
			}

			// Its charts stand still, however long it has been down, as they were when a
			// node last reported.
			if v.Overview.Events.History == nil {
				t.Fatal("expected a chart of the events")
			}
			time.Sleep(10 * time.Minute)
			if after := viewOf(t, r, o, c).Overview.Events.History; !reflect.DeepEqual(v.Overview.Events.History, after) {
				t.Fatalf("expected a chart that has not moved: got %+v, want %+v", after, v.Overview.Events.History)
			}

			// Another node reporting makes the cluster live again.
			n2 := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()),
				name(new(metricsgrpc.EventStreamLength)),
			)
			n2.sample(t, 0, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: stream, Watermark: 51}.Build())
			if v := viewOf(t, r, o, c); v.Down {
				t.Fatal("expected a view that is not down")
			}

			cancel()
			<-n2.Engine.Done
		})
	})

	t.Run("a cluster that never had a node reporting is not down", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := NewObserver(), NewRecorder()
			c := uuidpb.Generate()
			n := startApp(t, ctx, o, c, appOf("statements", uuidpb.Generate()))
			n.Engine.Feed.End(nil)
			<-n.Engine.Done
			r.Record(time.Now(), o.Nodes())

			if viewOf(t, r, o, c).Down {
				t.Fatal("expected a view that is not down")
			}
		})
	})
}
