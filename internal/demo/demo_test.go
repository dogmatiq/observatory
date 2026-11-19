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
				if err := Run(ctx, o, false); err != nil {
					t.Error(err)
				}
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
			if len(view.Overview.Handlers) != 6 {
				t.Fatalf("unexpected number of handlers: got %d, want 6", len(view.Overview.Handlers))
			}

			// One of the processes schedules no deadlines, and its instances are in
			// progress and bound to no queue.
			found := false
			for _, h := range view.Overview.Handlers {
				if h.Name != "reconciliation" {
					continue
				}
				found = true
				if h.Kind != "process" || h.Summary.SchedulesDeadlines || h.Summary.Unbound == 0 {
					t.Fatalf("unexpected process: %+v", h)
				}
			}
			if !found {
				t.Fatal("no reconciliation process")
			}
			if view.Overview.Events == nil || view.Overview.Events.Rate == nil || view.Overview.Events.Rate.PerSecond == nil {
				t.Fatalf("unexpected events: %+v", view.Overview.Events)
			}

			// Each node counts the messages that it removes, and the rates of all
			// seven add up, so each running total must only ever grow.
			if view.Overview.Queues == nil || view.Overview.Queues.Throughput == nil || view.Overview.Queues.Throughput.PerSecond == nil {
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
				if err := Run(ctx, o, false); err != nil {
					t.Error(err)
				}
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
					if view.Overview.Queues == nil || view.Overview.Queues.Throughput == nil || view.Overview.Queues.Throughput.PerSecond == nil {
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
				if err := Run(ctx, o, false); err != nil {
					t.Error(err)
				}
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
				if err := Run(ctx, o, false); err != nil {
					t.Error(err)
				}
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

	t.Run("it fails the mailer's commands and the process's deadlines, each in turn and for a while together", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := observe.NewObserver(), observe.NewRecorder()

			done := make(chan struct{})
			go func() {
				defer close(done)
				if err := Run(ctx, o, false); err != nil {
					t.Error(err)
				}
			}()

			var mailerOnly, processOnly, both, neither bool
			for range 200 {
				time.Sleep(time.Second)
				r.Record(time.Now(), o.Nodes())

				for _, c := range observe.Clusters(time.Now(), o.Nodes()) {
					view, _ := r.View(time.Now(), o.Nodes(), c.ID)

					var mailer, process uint64
					for _, h := range view.Overview.Handlers {
						switch h.Name {
						case "mailer":
							mailer = h.Summary.Failing
						case "statement-schedule":
							process = h.Summary.Failing
							if h.Summary.QueuedMessages != nil && *h.Summary.QueuedMessages < process {
								t.Fatalf("%d deadlines are pending, and %d are failing", *h.Summary.QueuedMessages, process)
							}
						}
					}

					switch {
					case mailer > 0 && process > 0:
						both = true
					case mailer > 0:
						mailerOnly = true
					case process > 0:
						processOnly = true
					default:
						neither = true
					}
				}
			}

			if !mailerOnly || !processOnly || !both || !neither {
				t.Fatalf("mailer only: %t, process only: %t, both: %t, neither: %t", mailerOnly, processOnly, both, neither)
			}

			cancel()
			<-done
		})
	})

	t.Run("it changes what the nodes support, so that parts of the page begin and end", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := observe.NewObserver(), observe.NewRecorder()

			done := make(chan struct{})
			go func() {
				defer close(done)
				if err := Run(ctx, o, false); err != nil {
					t.Error(err)
				}
			}()

			seen := map[string]bool{}
			for range 300 {
				time.Sleep(time.Second)
				r.Record(time.Now(), o.Nodes())

				for _, c := range observe.Clusters(time.Now(), o.Nodes()) {
					view, _ := r.View(time.Now(), o.Nodes(), c.ID)
					e, q := view.Overview.Events, view.Overview.Queues
					if e == nil || q == nil {
						continue
					}

					bindings := false
					for _, h := range view.Overview.Handlers {
						if h.Name == "account" && h.Summary.Bindings != nil {
							bindings = true
						}
					}

					switch {
					case e.Rate != nil && e.Streams != nil && q.Queues != nil && q.Throughput != nil && bindings:
						seen["everything"] = true
					case e.Rate != nil && e.Streams == nil && q.Queues == nil && q.Throughput != nil:
						seen["rates only"] = true
					// The nodes that report only the totals report no removals, so the
					// throughput is the messages that handlers handle, if they report that.
					case e.Rate == nil && e.Streams != nil && q.Queues != nil && q.Counted != "removed":
						seen["totals only"] = true
					case e.Streams != nil && !bindings:
						seen["no instances"] = true
					}
				}
			}

			for _, want := range []string{"everything", "rates only", "totals only", "no instances"} {
				if !seen[want] {
					t.Fatalf("never saw the nodes support: %s", want)
				}
			}

			cancel()
			<-done
		})
	})
}

func TestRunCombinations(t *testing.T) {
	t.Run("it connects a cluster for each combination of what the tiles are made from, which shows what that gives", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			o, r := observe.NewObserver(), observe.NewRecorder()

			done := make(chan struct{})
			go func() {
				defer close(done)
				if err := Run(ctx, o, true); err != nil {
					t.Error(err)
				}
			}()

			for range 12 {
				time.Sleep(time.Second)
				r.Record(time.Now(), o.Nodes())
			}

			// What each cluster reports is in its name, which is how this finds what
			// it should show.
			queues := map[string]string{
				"Queues: nothing":                                              "no tile",
				"Queues: sizes":                                                "none",
				"Queues: removals":                                             "removed",
				"Queues: sizes, removals":                                      "removed",
				"Queues: commands handled":                                     "commands handled",
				"Queues: deadlines handled":                                    "deadlines handled",
				"Queues: sizes, commands handled":                              "commands handled",
				"Queues: removals, commands handled":                           "removed",
				"Queues: commands handled, deadlines handled":                  "handled",
				"Queues: sizes, commands handled, deadlines handled":           "handled",
				"Queues: removals, commands handled, deadlines handled":        "handled",
				"Queues: removals, deadlines handled":                          "removed",
				"Queues: sizes, removals, deadlines handled":                   "removed",
				"Queues: sizes, deadlines handled":                             "deadlines handled",
				"Queues: sizes, removals, commands handled":                    "removed",
				"Queues: sizes, removals, commands handled, deadlines handled": "handled",
			}

			// The events tile is its rate, and the lengths of the streams.
			events := map[string]string{
				"Events: nothing":       "no tile",
				"Events: rate":          "rate",
				"Events: streams":       "streams",
				"Events: rate, streams": "rate and streams",
			}

			clusters := observe.Clusters(time.Now(), o.Nodes())
			if len(clusters) != 1+len(queues)+len(events) {
				t.Fatalf("unexpected number of clusters: got %d, want %d", len(clusters), 1+len(queues)+len(events))
			}

			for _, c := range clusters {
				view, _ := r.View(time.Now(), o.Nodes(), c.ID)

				if expected, ok := queues[c.Application.Name]; ok {
					delete(queues, c.Application.Name)

					q := view.Overview.Queues
					got := "no tile"
					switch {
					case q == nil:
					case q.Throughput == nil:
						got = "none"
					default:
						got = q.Counted
					}
					if got != expected {
						t.Errorf("%s: got %q, want %q", c.Application.Name, got, expected)
					}
				}

				if expected, ok := events[c.Application.Name]; ok {
					delete(events, c.Application.Name)

					e := view.Overview.Events
					got := "no tile"
					switch {
					case e == nil:
					case e.Rate != nil && e.Streams != nil:
						got = "rate and streams"
					case e.Rate != nil:
						got = "rate"
					case e.Streams != nil:
						got = "streams"
					}
					if got != expected {
						t.Errorf("%s: got %q, want %q", c.Application.Name, got, expected)
					}
				}
			}
			if len(queues)+len(events) != 0 {
				t.Fatalf("clusters are missing: %v, %v", queues, events)
			}

			cancel()
			<-done
		})
	})
}
