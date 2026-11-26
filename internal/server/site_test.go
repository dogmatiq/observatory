package server_test

import (
	"context"
	"encoding/json"
	"maps"
	"net/http"
	"slices"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/configpb"
	"github.com/dogmatiq/protobuf/identitypb"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"

	"github.com/dogmatiq/observatory/internal/observe"
	. "github.com/dogmatiq/observatory/internal/server"
)

func TestServerSites(t *testing.T) {
	const nilUUID = "00000000-0000-0000-0000-000000000000"

	// sited is what the Observatory knows in these tests: the statements
	// application at the eu-west site, run by a cluster of two nodes, at the
	// us-east site, and at no site, and the billing application at the eu-west
	// site, run by a cluster of one node. Each node supports the number of
	// commands in queues that are ready.
	type sited struct {
		EuWest, Statements, Billing *uuidpb.UUID
		Statements1, Statements2    *node
		Billing1, UsEast, Unsited   *node
	}

	// withSites gives the test an Observatory that knows what [sited] says.
	withSites := func(t *testing.T, test func(t *testing.T, o *observe.Observer, r *observe.Recorder, s sited)) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			app := func(name string, key *uuidpb.UUID) *configpb.Application {
				return configpb.Application_builder{
					Identity: identitypb.Identity_builder{Name: name, Key: key}.Build(),
				}.Build()
			}
			site := func(name string, key *uuidpb.UUID) *identitypb.Identity {
				return identitypb.Identity_builder{Name: name, Key: key}.Build()
			}
			due := new(metricsgrpc.QueueCommandsDue)

			o, r := observe.NewObserver(), observe.NewRecorder()
			s := sited{
				EuWest:     uuidpb.Generate(),
				Statements: uuidpb.Generate(),
				Billing:    uuidpb.Generate(),
			}
			euWest := site("eu-west", s.EuWest)
			statements := app("statements", s.Statements)
			cluster := uuidpb.Generate()

			s.Statements1 = connectNodeAt(t, ctx, o, cluster, uuidpb.Generate(), euWest, statements, due)
			s.Statements2 = connectNodeAt(t, ctx, o, cluster, uuidpb.Generate(), euWest, statements, due)
			s.Billing1 = connectNodeAt(t, ctx, o, uuidpb.Generate(), uuidpb.Generate(), euWest, app("billing", s.Billing), due)
			s.UsEast = connectNodeAt(t, ctx, o, uuidpb.Generate(), uuidpb.Generate(), site("us-east", uuidpb.Generate()), statements, due)
			s.Unsited = connectNode(t, ctx, o, uuidpb.Generate(), uuidpb.Generate(), statements, due)

			test(t, o, r, s)
		})
	}

	// ready sends a sample of the number of commands in a queue that are ready.
	ready := func(t *testing.T, n *node, revision byte, count uint64) {
		t.Helper()
		n.sample(t, 0, "q", revision, metricsgrpc.QueueCommandsDue_builder{
			QueueId:      uuidpb.MustParse("5a8e1b0e-3f0c-4d9a-9a4b-6f1e2d3c4b5a"),
			CurrentCount: count,
		}.Build())
	}

	// siteView gets the site view of the site with the given key.
	siteView := func(t *testing.T, h http.Handler, key string) observe.SiteView {
		t.Helper()

		w := get(h, "/-/api/sites/"+key)
		if w.Code != http.StatusOK {
			t.Fatalf("got status %d, want %d", w.Code, http.StatusOK)
		}

		var view observe.SiteView
		if err := json.NewDecoder(w.Body).Decode(&view); err != nil {
			t.Fatal(err)
		}
		return view
	}

	// applications returns the name of each application of the view, and how
	// many nodes it has.
	applications := func(view observe.SiteView) map[string]int {
		out := map[string]int{}
		for _, a := range view.Applications {
			out[a.Application.Name] = len(a.Members)
		}
		return out
	}

	t.Run("GET /-/api/sites/{key}", func(t *testing.T) {
		t.Run("it gives the view of the applications at the site", func(t *testing.T) {
			withSites(t, func(t *testing.T, o *observe.Observer, r *observe.Recorder, s sited) {
				ready(t, s.Statements1, 1, 2)
				ready(t, s.Billing1, 1, 5)

				view := siteView(t, New(o, r), s.EuWest.AsString())

				if view.Site == nil || view.Site.Name != "eu-west" {
					t.Fatalf("got site %+v, want eu-west", view.Site)
				}
				if got, want := applications(view), map[string]int{"billing": 1, "statements": 2}; !maps.Equal(got, want) {
					t.Fatalf("got applications %v, want %v", got, want)
				}
				if view.Queues == nil || view.Queues.Messages != 7 {
					t.Fatalf("got queues %+v, want 7 messages", view.Queues)
				}
			})
		})

		t.Run("it gives the applications at no site for the nil UUID", func(t *testing.T) {
			withSites(t, func(t *testing.T, o *observe.Observer, r *observe.Recorder, _ sited) {
				view := siteView(t, New(o, r), nilUUID)

				if view.Site != nil {
					t.Fatalf("got site %+v, want none", view.Site)
				}
				if got, want := applications(view), map[string]int{"statements": 1}; !maps.Equal(got, want) {
					t.Fatalf("got applications %v, want %v", got, want)
				}
			})
		})

		t.Run("it fails with the status 404 for a site that it doesn't know", func(t *testing.T) {
			withSites(t, func(t *testing.T, o *observe.Observer, r *observe.Recorder, _ sited) {
				if w := get(New(o, r), "/-/api/sites/"+uuidpb.Generate().AsString()); w.Code != http.StatusNotFound {
					t.Fatalf("got status %d, want %d", w.Code, http.StatusNotFound)
				}
			})
		})
	})

	t.Run("GET /-/api/sites/{key}/watch", func(t *testing.T) {
		// watch starts the stream of the site, and gives the test its events.
		watch := func(t *testing.T, o *observe.Observer, r *observe.Recorder, key string, test func(w *watchRequest)) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			w := startStream(ctx, New(o, r), "/-/api/sites/"+key+"/watch")
			synctest.Wait()

			test(w)

			w.Cancel()
			<-w.Done
		}

		t.Run("it is the whole document, then the heartbeats, then synced", func(t *testing.T) {
			withSites(t, func(t *testing.T, o *observe.Observer, r *observe.Recorder, s sited) {
				ready(t, s.Statements1, 1, 2)
				s.Statements1.heartbeat(t)

				watch(t, o, r, s.EuWest.AsString(), func(w *watchRequest) {
					events := w.events(t)
					if got, want := names(events), []string{"changed", "heartbeat", "synced"}; !slices.Equal(got, want) {
						t.Fatalf("got events %v, want %v", got, want)
					}

					doc := events[0].Data
					if got := at(t, doc, "site", "name"); got != "eu-west" {
						t.Fatalf("got site %v, want eu-west", got)
					}
					if got := at(t, doc, "applications", s.Statements.AsString(), "name"); got != "statements" {
						t.Fatalf("got application %v, want statements", got)
					}
					if got := len(at(t, doc, "applications", s.Statements.AsString(), "nodes").(map[string]any)); got != 2 {
						t.Fatalf("got %d nodes, want 2", got)
					}
					if got := at(t, doc, "queues", "messages"); got != 2.0 {
						t.Fatalf("got %v messages, want 2", got)
					}
					if got := events[1].Data["node"]; got != s.Statements1.ID.AsString() {
						t.Fatalf("got a heartbeat of %v, want %v", got, s.Statements1.ID.AsString())
					}
				})
			})
		})

		t.Run("it sends the heartbeats of the nodes at the site, and no others", func(t *testing.T) {
			withSites(t, func(t *testing.T, o *observe.Observer, r *observe.Recorder, s sited) {
				watch(t, o, r, s.EuWest.AsString(), func(w *watchRequest) {
					s.UsEast.heartbeat(t)
					s.Billing1.heartbeat(t)
					s.Unsited.heartbeat(t)

					beats := named(since(w.events(t), "synced"), "heartbeat")
					if len(beats) != 1 || beats[0].Data["node"] != s.Billing1.ID.AsString() {
						t.Fatalf("got heartbeats %v, want one of %v", beats, s.Billing1.ID.AsString())
					}
				})
			})
		})

		t.Run("it sends what changes, as a merge patch", func(t *testing.T) {
			withSites(t, func(t *testing.T, o *observe.Observer, r *observe.Recorder, s sited) {
				ready(t, s.Billing1, 1, 1)

				watch(t, o, r, s.EuWest.AsString(), func(w *watchRequest) {
					ready(t, s.Billing1, 2, 4)
					time.Sleep(time.Second)
					synctest.Wait()

					patches := named(since(w.events(t), "synced"), "changed")
					if len(patches) != 1 {
						t.Fatalf("got patches %v, want one", patches)
					}
					p := patches[0].Data
					if got := at(t, p, "applications", s.Billing.AsString(), "queues", "messages"); got != 4.0 {
						t.Fatalf("got %v messages of billing, want 4", got)
					}
					if got := at(t, p, "queues", "messages"); got != 4.0 {
						t.Fatalf("got %v messages at the site, want 4", got)
					}
					if _, ok := p["site"]; ok {
						t.Fatalf("got the site in a patch %v, want it left out", p)
					}
				})
			})
		})

		t.Run("it fails with the status 404 for a site that it doesn't know", func(t *testing.T) {
			withSites(t, func(t *testing.T, o *observe.Observer, r *observe.Recorder, _ sited) {
				w := get(New(o, r), "/-/api/sites/"+uuidpb.Generate().AsString()+"/watch")
				if w.Code != http.StatusNotFound {
					t.Fatalf("got status %d, want %d", w.Code, http.StatusNotFound)
				}
			})
		})
	})
}
