package demo_test

import (
	"context"
	"testing"
	"testing/synctest"
	"time"

	. "github.com/dogmatiq/observatory/internal/demo"
	"github.com/dogmatiq/observatory/internal/observe"
)

func TestRun(t *testing.T) {
	t.Run("it connects seven nodes of one cluster, which report the numbers of the example application", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := observe.NewObserver(), observe.NewRecorder()

			done := make(chan struct{})
			go func() {
				defer close(done)
				Run(ctx, o)
			}()

			for range 12 {
				time.Sleep(time.Second)
				r.Record(time.Now(), o.Nodes())
			}

			clusters := observe.Clusters(time.Now(), o.Nodes())
			if len(clusters) != 1 || clusters[0].Application.Name != "statements" {
				t.Fatalf("unexpected clusters: %+v", clusters)
			}

			view, _ := r.View(time.Now(), o.Nodes(), clusters[0].ID)
			if len(view.Overview.Cluster.Nodes) != 7 {
				t.Fatalf("unexpected number of nodes: got %d, want 7", len(view.Overview.Cluster.Nodes))
			}
			if len(view.Overview.Handlers) != 5 {
				t.Fatalf("unexpected number of handlers: got %d, want 5", len(view.Overview.Handlers))
			}
			if view.Overview.Events == nil || view.Overview.Events.Rate == nil {
				t.Fatalf("unexpected events: %+v", view.Overview.Events)
			}

			// Each node counts the messages that it removes, and the rates of all
			// seven add up, so each running total must only ever grow.
			if view.Overview.Queues == nil || view.Overview.Queues.RemovedRate == nil {
				t.Fatalf("unexpected queues: %+v", view.Overview.Queues)
			}

			cancel()
			<-done
		})
	})

	t.Run("it gives a rate of removing messages once the nodes have been counting for a while", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := observe.NewObserver(), observe.NewRecorder()

			done := make(chan struct{})
			go func() {
				defer close(done)
				Run(ctx, o)
			}()

			// Each node counts a part of the messages that are removed, and a node
			// that counts less than before has started again, which leaves the rate
			// unknown for a while. So each node's count must only grow.
			for i := range 55 {
				time.Sleep(time.Second)
				if i < 20 {
					continue
				}

				for _, c := range observe.Clusters(time.Now(), o.Nodes()) {
					view, _ := r.View(time.Now(), o.Nodes(), c.ID)
					if view.Overview.Queues == nil || view.Overview.Queues.RemovedRate == nil {
						t.Fatalf("unknown rate of removal after %d seconds", i)
					}
				}
			}

			cancel()
			<-done
		})
	})

	t.Run("it takes nodes down and brings them back, so that the number of nodes changes", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := observe.NewObserver(), observe.NewRecorder()

			done := make(chan struct{})
			go func() {
				defer close(done)
				Run(ctx, o)
			}()

			fewest, most := 100, 0
			for range 400 {
				time.Sleep(time.Second)
				r.Record(time.Now(), o.Nodes())

				for _, c := range observe.Clusters(time.Now(), o.Nodes()) {
					view, _ := r.View(time.Now(), o.Nodes(), c.ID)
					nodes := view.Overview.Cluster.Nodes

					fewest, most = min(fewest, len(nodes)), max(most, len(nodes))
				}
			}

			if most != 7 || fewest >= 7 {
				t.Fatalf("unexpected numbers of nodes: from %d to %d, want from fewer than 7 to 7", fewest, most)
			}

			cancel()
			<-done
		})
	})

	t.Run("it never reports a number of messages or events that is out of range", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := observe.NewObserver(), observe.NewRecorder()

			done := make(chan struct{})
			go func() {
				defer close(done)
				Run(ctx, o)
			}()

			for range 600 {
				time.Sleep(time.Second)
				r.Record(time.Now(), o.Nodes())

				for _, c := range observe.Clusters(time.Now(), o.Nodes()) {
					view, _ := r.View(time.Now(), o.Nodes(), c.ID)

					for _, h := range view.Overview.Handlers {
						for _, n := range []*uint64{h.Summary.QueuedMessages, h.Summary.UnhandledEvents} {
							// The simulated numbers are a few dozen at most.
							if n != nil && *n > 1000 {
								t.Fatalf("unexpected number for %s: %d", h.Name, *n)
							}
						}
					}
				}
			}

			cancel()
			<-done
		})
	})
}
