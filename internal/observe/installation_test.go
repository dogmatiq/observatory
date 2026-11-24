package observe_test

import (
	"context"
	"slices"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/uuidpb"

	. "github.com/dogmatiq/observatory/internal/observe"
)

// idsOf returns the IDs of the clusters, in order.
func idsOf(clusters []ClusterSummary) []string {
	var ids []string
	for _, c := range clusters {
		ids = append(ids, c.ID)
	}
	return ids
}

// sorted returns the IDs of the clusters, as strings, sorted.
func sorted(clusters ...*uuidpb.UUID) []string {
	var ids []string
	for _, c := range clusters {
		ids = append(ids, c.AsString())
	}
	slices.Sort(ids)
	return ids
}

// stop ends the connection of a node, and waits for the Observer to finish
// serving it.
func stop(n *metricsNode) {
	n.Engine.Feed.End(nil)
	<-n.Engine.Done
}

func TestInstallations(t *testing.T) {
	t.Run("func ClustersOf()", func(t *testing.T) {
		t.Run("when one cluster runs the installation", func(t *testing.T) {
			t.Run("it gives that cluster, and none for another site", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					site, app := uuidpb.Generate(), uuidpb.Generate()
					cluster := uuidpb.Generate()

					n := startAppInSite(t, ctx, o, cluster, identity("eu-west", site), appOf("statements", app))

					got := o.ClustersOf(time.Now(), site.AsString(), app.AsString())
					if !slices.Equal(idsOf(got), sorted(cluster)) || !got[0].Reporting || got[0].Site.Name != "eu-west" {
						t.Fatalf("unexpected clusters: %+v", got)
					}
					if got := o.ClustersOf(time.Now(), uuidpb.Generate().AsString(), app.AsString()); len(got) != 0 {
						t.Fatalf("unexpected clusters at another site: %+v", got)
					}
					if got := o.ClustersOf(time.Now(), "", app.AsString()); len(got) != 0 {
						t.Fatalf("unexpected clusters with no site: %+v", got)
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when the application has no site", func(t *testing.T) {
			t.Run("it gives the cluster for no site", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					app := uuidpb.Generate()
					cluster := uuidpb.Generate()

					n := startApp(t, ctx, o, cluster, appOf("statements", app))

					got := o.ClustersOf(time.Now(), "", app.AsString())
					if !slices.Equal(idsOf(got), sorted(cluster)) || got[0].Site != nil {
						t.Fatalf("unexpected clusters: %+v", got)
					}

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when two clusters run the installation at once", func(t *testing.T) {
			t.Run("it gives both", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					site, app := uuidpb.Generate(), uuidpb.Generate()
					blue, green := uuidpb.Generate(), uuidpb.Generate()

					n1 := startAppInSite(t, ctx, o, blue, identity("eu-west", site), appOf("statements", app))
					n2 := startAppInSite(t, ctx, o, green, identity("eu-west", site), appOf("statements", app))

					got := o.ClustersOf(time.Now(), site.AsString(), app.AsString())
					if !slices.Equal(idsOf(got), sorted(blue, green)) {
						t.Fatalf("unexpected clusters: %+v", got)
					}

					cancel()
					<-n1.Engine.Done
					<-n2.Engine.Done
				})
			})
		})

		t.Run("when an engine that doesn't run as a cluster restarts with a new ID", func(t *testing.T) {
			// restarted runs an engine that doesn't run as a cluster, whose heartbeat
			// lasts a minute, stops it, and starts it again, which gives it a new ID.
			restarted := func(t *testing.T, test func(t *testing.T, o *Observer, site, app string, old, new *metricsNode)) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					site, app := uuidpb.Generate(), uuidpb.Generate()

					old := startAppInSite(t, ctx, o, nil, identity("eu-west", site), appOf("statements", app))
					send(t, old.Engine, heartbeat(time.Minute))
					stop(old)

					new := startAppInSite(t, ctx, o, nil, identity("eu-west", site), appOf("statements", app))
					send(t, new.Engine, heartbeat(time.Minute))

					test(t, o, site.AsString(), app.AsString(), old, new)

					cancel()
					<-new.Engine.Done
				})
			}

			t.Run("it gives the new run, while the old run's heartbeat has not expired", func(t *testing.T) {
				restarted(t, func(t *testing.T, o *Observer, site, app string, old, new *metricsNode) {
					if got := idsOf(o.ClustersOf(time.Now(), site, app)); !slices.Equal(got, sorted(new.ID)) {
						t.Fatalf("unexpected clusters: got %v, want %v", got, sorted(new.ID))
					}
				})
			})

			t.Run("it gives the new run once the old run's heartbeat has expired", func(t *testing.T) {
				restarted(t, func(t *testing.T, o *Observer, site, app string, old, new *metricsNode) {
					time.Sleep(2 * time.Minute)
					send(t, new.Engine, heartbeat(time.Minute))

					if got := idsOf(o.ClustersOf(time.Now(), site, app)); !slices.Equal(got, sorted(new.ID)) {
						t.Fatalf("unexpected clusters: got %v, want %v", got, sorted(new.ID))
					}
				})
			})

			t.Run("it leaves the old run out of the list of clusters", func(t *testing.T) {
				restarted(t, func(t *testing.T, o *Observer, site, app string, old, new *metricsNode) {
					if got := idsOf(o.Clusters(time.Now())); !slices.Equal(got, sorted(new.ID)) {
						t.Fatalf("unexpected clusters: got %v, want %v", got, sorted(new.ID))
					}
				})
			})

			t.Run("it gives both runs if the old one connects again", func(t *testing.T) {
				restarted(t, func(t *testing.T, o *Observer, site, app string, old, new *metricsNode) {
					b := preamble(old.ID, nil, 0)
					b.Preamble.SetSite(identity("eu-west", uuidpb.MustParse(site)))
					again := startEngine(t, t.Context(), o, b, appOf("statements", uuidpb.MustParse(app)))

					if got := idsOf(o.ClustersOf(time.Now(), site, app)); !slices.Equal(got, sorted(old.ID, new.ID)) {
						t.Fatalf("unexpected clusters: got %v, want %v", got, sorted(old.ID, new.ID))
					}

					stop(again)
				})
			})
		})

		t.Run("when two runs of an engine that doesn't run as a cluster are connected at once", func(t *testing.T) {
			t.Run("it gives both", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o := NewObserver()
					app := uuidpb.Generate()

					n1 := startApp(t, ctx, o, nil, appOf("statements", app))
					n2 := startApp(t, ctx, o, nil, appOf("statements", app))

					if got := idsOf(o.ClustersOf(time.Now(), "", app.AsString())); !slices.Equal(got, sorted(n1.ID, n2.ID)) {
						t.Fatalf("unexpected clusters: got %v, want %v", got, sorted(n1.ID, n2.ID))
					}

					cancel()
					<-n1.Engine.Done
					<-n2.Engine.Done
				})
			})
		})

		t.Run("when no cluster of the installation is reporting", func(t *testing.T) {
			t.Run("it gives the newest, as not reporting", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					o := NewObserver()
					app := uuidpb.Generate()

					older := startApp(t, t.Context(), o, nil, appOf("statements", app))
					stop(older)
					newer := startApp(t, t.Context(), o, nil, appOf("statements", app))
					stop(newer)

					got := o.ClustersOf(time.Now(), "", app.AsString())
					if !slices.Equal(idsOf(got), sorted(newer.ID)) || got[0].Reporting {
						t.Fatalf("unexpected clusters: %+v", got)
					}

					// Its nodes being forgotten changes nothing.
					time.Sleep(4 * 24 * time.Hour)
					o.ForgetIdle(time.Now())

					got = o.ClustersOf(time.Now(), "", app.AsString())
					if !slices.Equal(idsOf(got), sorted(newer.ID)) || got[0].Reporting {
						t.Fatalf("unexpected clusters: %+v", got)
					}
				})
			})
		})

		t.Run("when the Observer has never had a node of the installation", func(t *testing.T) {
			t.Run("it gives none", func(t *testing.T) {
				o := NewObserver()

				if got := o.ClustersOf(time.Now(), "", uuidpb.Generate().AsString()); len(got) != 0 {
					t.Fatalf("unexpected clusters: %+v", got)
				}
			})
		})
	})

	t.Run("func ForgetIdle()", func(t *testing.T) {
		t.Run("it forgets the record of an idle run that a newer run has replaced, and keeps the newest", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				o := NewObserver()
				app := uuidpb.Generate()

				older := startApp(t, t.Context(), o, nil, appOf("statements", app))
				stop(older)

				// The older run's nodes are forgotten before the newer run starts.
				time.Sleep(4 * 24 * time.Hour)
				o.ForgetIdle(time.Now())

				newer := startApp(t, t.Context(), o, nil, appOf("statements", app))
				stop(newer)

				o.ForgetIdle(time.Now())
				if _, ok := o.Record(older.ID.AsString()); ok {
					t.Fatal("expected no record of the run that was replaced")
				}
				if _, ok := o.Record(newer.ID.AsString()); !ok {
					t.Fatal("expected a record of the newest run")
				}

				time.Sleep(4 * 24 * time.Hour)
				o.ForgetIdle(time.Now())
				if _, ok := o.Record(newer.ID.AsString()); !ok {
					t.Fatal("expected a record of the newest run, after its nodes are forgotten")
				}
			})
		})
	})

	t.Run("func Installations()", func(t *testing.T) {
		t.Run("it gives each installation once, by the names of its newest cluster, sorted", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				o := NewObserver()
				statements, billing := uuidpb.Generate(), uuidpb.Generate()
				site := uuidpb.Generate()

				for _, n := range []*metricsNode{
					startAppInSite(t, t.Context(), o, nil, identity("eu-west", site), appOf("statements", statements)),
					startAppInSite(t, t.Context(), o, nil, identity("eu-west", site), appOf("statements v2", statements)),
					startApp(t, t.Context(), o, nil, appOf("statements", statements)),
					startAppInSite(t, t.Context(), o, uuidpb.Generate(), identity("eu-west", site), appOf("billing", billing)),
				} {
					stop(n)
				}

				want := []Installation{
					{Application: Application{Name: "billing", Key: billing.AsString()}, Site: &Site{Name: "eu-west", Key: site.AsString()}},
					{Application: Application{Name: "statements", Key: statements.AsString()}},
					{Application: Application{Name: "statements v2", Key: statements.AsString()}, Site: &Site{Name: "eu-west", Key: site.AsString()}},
				}
				got := o.Installations()
				if !slices.EqualFunc(got, want, func(a, b Installation) bool {
					return a.Application == b.Application && (a.Site == nil) == (b.Site == nil) && (a.Site == nil || *a.Site == *b.Site)
				}) {
					t.Fatalf("unexpected installations: got %+v, want %+v", got, want)
				}
			})
		})
	})
}
