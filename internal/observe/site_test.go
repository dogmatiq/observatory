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

func TestSiteViewOf(t *testing.T) {
	statements := Application{Name: "statements", Key: "6f3c3a4e-6a43-4b41-9a5d-0c8f0f7f7c01"}
	billing := Application{Name: "billing", Key: "1d0f7a52-4c55-4b5e-8f0e-55d8e1b4a702"}

	// cluster returns the view of a cluster of the application whose nodes have
	// the given IDs, and whose overview has the given tiles.
	cluster := func(app Application, nodes []string, e *EventsTile, q *QueuesTile) ClusterView {
		members := []Member{}
		for _, id := range nodes {
			members = append(members, Member{ID: id, Reporting: true})
		}
		return ClusterView{
			Application: app,
			Overview: Overview{
				Events:  e,
				Queues:  q,
				Cluster: &ClusterTile{Nodes: members},
			},
		}
	}

	// down returns the view of a cluster that is down, as [DownView] gives it.
	down := func(view ClusterView) ClusterView {
		view.Down = true
		view.Overview.Cluster.Nodes = []Member{}
		return view
	}

	rate := func(v float64) *Rate { return &Rate{PerSecond: &v} }

	t.Run("it adds up the figures of the applications", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"},
				&EventsTile{Rate: rate(2), Streams: []Spread{{"s1", 10}, {"s2", 5}}},
				&QueuesTile{Queues: []Spread{{"q1", 3}}, Failing: 1, Throughput: rate(4)},
			)},
			{cluster(billing, []string{"b"},
				&EventsTile{Rate: rate(1.5), Streams: []Spread{{"s3", 7}}},
				&QueuesTile{Queues: []Spread{{"q2", 2}, {"q3", 6}}, Failing: 2, Throughput: rate(1)},
			)},
		})

		want := SiteView{
			Events: &SiteEvents{Rate: rate(3.5), Streams: &StreamCount{Count: 3, Events: 22}},
			Queues: &SiteQueues{Messages: 11, Queues: new(3), Failing: 3, Throughput: rate(5)},
		}
		if !reflect.DeepEqual(view.Events, want.Events) {
			t.Fatalf("got events %+v, want %+v", view.Events, want.Events)
		}
		if !reflect.DeepEqual(view.Queues, want.Queues) {
			t.Fatalf("got queues %+v, want %+v", view.Queues, want.Queues)
		}
	})

	t.Run("it gives each application its own figures, by name", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"},
				&EventsTile{Rate: rate(2), Streams: []Spread{{"s1", 10}}},
				nil,
			)},
			{cluster(billing, []string{"b"},
				nil,
				&QueuesTile{Queues: []Spread{{"q1", 3}}, Failing: 1},
			)},
		})

		want := []SiteApplication{
			{
				Application: billing,
				Members:     []Member{{ID: "b", Reporting: true}},
				Queues:      &ApplicationQueues{Messages: 3, Failing: 1, Queues: new(1)},
			},
			{
				Application: statements,
				Members:     []Member{{ID: "a", Reporting: true}},
				Events:      &ApplicationEvents{Rate: rate(2), Streams: &StreamCount{Count: 1, Events: 10}},
			},
		}
		if !reflect.DeepEqual(view.Applications, want) {
			t.Fatalf("got applications %+v, want %+v", view.Applications, want)
		}
	})

	t.Run("it sorts applications with the same name by key", func(t *testing.T) {
		other := Application{Name: "statements", Key: "00000000-0000-4000-8000-000000000001"}
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"}, nil, nil)},
			{cluster(other, []string{"b"}, nil, nil)},
		})

		if got := view.Applications[0].Application; got != other {
			t.Fatalf("got %v first, want %v", got, other)
		}
	})

	t.Run("it leaves out a tile that no application's engine supports", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"}, nil, &QueuesTile{})},
		})

		if view.Events != nil {
			t.Fatalf("got events %+v, want none", view.Events)
		}
		if view.Queues == nil {
			t.Fatal("got no queues, want them")
		}
	})

	t.Run("it gives a tile's coverage as the share of the site's nodes that report it", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			// Three nodes, of which two thirds report the events.
			{cluster(statements, []string{"a", "b", "c"}, &EventsTile{Coverage: new(2.0 / 3)}, nil)},
			// One node, which doesn't report the events at all.
			{cluster(billing, []string{"d"}, nil, nil)},
		})

		if got, want := view.Events.Coverage, 0.5; got == nil || *got != want {
			t.Fatalf("got coverage %v, want %v", got, want)
		}
	})

	t.Run("it doesn't give a coverage when all nodes at the site report the tile", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"}, &EventsTile{}, nil)},
			{cluster(billing, []string{"b", "c"}, &EventsTile{}, nil)},
		})

		if view.Events.Coverage != nil {
			t.Fatalf("got coverage %v, want none", *view.Events.Coverage)
		}
	})

	t.Run("it gives an application the coverage of its least covered figures", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a", "b", "c", "d"},
				&EventsTile{Coverage: new(0.75)},
				&QueuesTile{Coverage: new(0.5)},
			)},
		})

		if got, want := view.Applications[0].Coverage, 0.5; got == nil || *got != want {
			t.Fatalf("got coverage %v, want %v", got, want)
		}
	})

	t.Run("it treats an application that runs as several clusters as one", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{
				cluster(statements, []string{"c", "a"},
					&EventsTile{Rate: rate(2), Streams: []Spread{{"s1", 10}}},
					&QueuesTile{Queues: []Spread{{"q1", 3}}, Failing: 1},
				),
				cluster(statements, []string{"b"},
					&EventsTile{Rate: rate(1), Streams: []Spread{{"s2", 4}}},
					&QueuesTile{Queues: []Spread{{"q2", 5}}},
				),
			},
		})

		want := []SiteApplication{{
			Application: statements,
			Members: []Member{
				{ID: "a", Reporting: true},
				{ID: "b", Reporting: true},
				{ID: "c", Reporting: true},
			},
			Events: &ApplicationEvents{Rate: rate(3), Streams: &StreamCount{Count: 2, Events: 14}},
			Queues: &ApplicationQueues{Messages: 8, Failing: 1, Queues: new(2)},
		}}
		if !reflect.DeepEqual(view.Applications, want) {
			t.Fatalf("got applications %+v, want %+v", view.Applications, want)
		}
	})

	t.Run("it leaves the figures of a cluster that is down out of the sums", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{
				cluster(statements, []string{"a"},
					&EventsTile{Rate: rate(2), Streams: []Spread{{"s1", 10}}},
					&QueuesTile{Queues: []Spread{{"q1", 3}}, Failing: 1},
				),
				down(cluster(statements, []string{"b"},
					&EventsTile{Rate: rate(1), Streams: []Spread{{"s2", 4}}},
					&QueuesTile{Queues: []Spread{{"q2", 5}}, Failing: 7},
				)),
			},
		})

		app := view.Applications[0]
		if got, want := app.Events, (&ApplicationEvents{Rate: rate(2), Streams: &StreamCount{Count: 1, Events: 10}}); !reflect.DeepEqual(got, want) {
			t.Fatalf("got events %+v, want %+v", got, want)
		}
		if got, want := app.Queues, (&ApplicationQueues{Messages: 3, Failing: 1, Queues: new(1)}); !reflect.DeepEqual(got, want) {
			t.Fatalf("got queues %+v, want %+v", got, want)
		}
	})

	t.Run("it counts a cluster that is down as one node that doesn't report", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"}, &EventsTile{}, nil)},
			{down(cluster(billing, []string{"b", "c"}, &EventsTile{}, nil))},
		})

		if got, want := view.Events.Coverage, 0.5; got == nil || *got != want {
			t.Fatalf("got coverage %v, want %v", got, want)
		}
		if got, want := view.Applications[0].Coverage, 0.0; got == nil || *got != want {
			t.Fatalf("got the coverage of %s %v, want %v", view.Applications[0].Application.Name, got, want)
		}
	})

	t.Run("it gives an unknown rate for an application whose only cluster with the rate is down", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{down(cluster(statements, []string{"a"}, &EventsTile{Rate: rate(2)}, nil))},
		})

		if got, want := view.Applications[0].Events.Rate, (&Rate{}); !reflect.DeepEqual(got, want) {
			t.Fatalf("got rate %+v, want %+v", got, want)
		}
		if got, want := view.Events.Rate, (&Rate{}); !reflect.DeepEqual(got, want) {
			t.Fatalf("got the site's rate %+v, want %+v", got, want)
		}
	})

	t.Run("it gives a sum of rates that is measuring while any of them is", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"}, &EventsTile{Rate: rate(2)}, nil)},
			{cluster(billing, []string{"b"}, &EventsTile{Rate: &Rate{Measuring: true}}, nil)},
		})

		if got, want := view.Events.Rate, (&Rate{Measuring: true}); !reflect.DeepEqual(got, want) {
			t.Fatalf("got rate %+v, want %+v", got, want)
		}
	})

	t.Run("it gives an unknown sum of rates while any of them isn't known for another reason", func(t *testing.T) {
		view := SiteViewOf(nil, [][]ClusterView{
			{cluster(statements, []string{"a"}, &EventsTile{Rate: &Rate{}}, nil)},
			{cluster(billing, []string{"b"}, &EventsTile{Rate: &Rate{Measuring: true}}, nil)},
		})

		if got, want := view.Events.Rate, (&Rate{}); !reflect.DeepEqual(got, want) {
			t.Fatalf("got rate %+v, want %+v", got, want)
		}
	})
}

func TestRecorderSiteSeries(t *testing.T) {
	t.Run("it adds up the points that the clusters recorded at each moment", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := NewObserver(), NewRecorder()
			c1, c2 := uuidpb.Generate(), uuidpb.Generate()
			q1, q2 := uuidpb.Generate(), uuidpb.Generate()
			removed := name(new(metricsgrpc.QueueCommandsRemoved))

			n1 := startApp(t, ctx, o, c1, appOf("statements", uuidpb.Generate()), removed)
			n2 := startApp(t, ctx, o, c2, appOf("billing", uuidpb.Generate()), removed)
			n1.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q1, CumulativeCount: 0}.Build())
			n2.sample(t, 0, "q", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q2, CumulativeCount: 0}.Build())
			time.Sleep(10 * time.Second)
			n1.sample(t, 0, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q1, CumulativeCount: 30}.Build())
			n2.sample(t, 0, "q", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q2, CumulativeCount: 10}.Build())

			start := time.Now()
			r.Record(start, o.Nodes())
			time.Sleep(2 * time.Second)
			n1.sample(t, 0, "q", 3, metricsgrpc.QueueCommandsRemoved_builder{QueueId: q1, CumulativeCount: 60}.Build())
			r.Record(time.Now(), o.Nodes())

			// Each cluster's own series has a point at each moment.
			s1, s2 := r.Series(c1.AsString()).Throughput, r.Series(c2.AsString()).Throughput
			if len(s1) != 2 || len(s2) != 2 {
				t.Fatalf("got points %+v and %+v, want two of each", s1, s2)
			}

			series := r.SiteSeries([]string{c1.AsString(), c2.AsString()})
			want := []TrailPoint{
				{At: start, Value: s1[0].Value + s2[0].Value},
				{At: start.Add(2 * time.Second), Value: s1[1].Value + s2[1].Value},
			}
			if !reflect.DeepEqual(series.Throughput, want) {
				t.Fatalf("got points %+v, want %+v", series.Throughput, want)
			}
			if len(series.Events) != 0 {
				t.Fatalf("got points of the events %+v, want none", series.Events)
			}

			cancel()
			<-n1.Engine.Done
			<-n2.Engine.Done
		})
	})
}
