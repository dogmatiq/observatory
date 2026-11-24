package server_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/configpb"
	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/identitypb"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"

	"github.com/dogmatiq/observatory/internal/observe"
	"github.com/dogmatiq/observatory/internal/observe/stubs"
	. "github.com/dogmatiq/observatory/internal/server"
)

type (
	engineFeed  = stubs.Feed[enginegrpc.WatchEngineResponse]
	metricsFeed = stubs.Feed[metricsgrpc.WatchMetricsResponse]
)

// get makes a request of the handler.
func get(h http.Handler, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

// node is a node that the Observer serves, which a test drives.
type node struct {
	ID      *uuidpb.UUID
	Engine  *engineFeed
	Metrics *metricsFeed
}

// connectNode makes the Observer serve a node of the cluster that runs the
// application, and sends the preambles of its engine API and of its call to
// WatchNodeMetrics, which lists the given metrics.
func connectNode(
	t *testing.T,
	ctx context.Context,
	o *observe.Observer,
	cluster, id *uuidpb.UUID,
	app *configpb.Application,
	supported ...proto.Message,
) *node {
	t.Helper()

	return connectNodeAt(t, ctx, o, cluster, id, nil, app, supported...)
}

// connectNodeAt is like connectNode, for a node that names a site, if site isn't
// nil.
func connectNodeAt(
	t *testing.T,
	ctx context.Context,
	o *observe.Observer,
	cluster, id *uuidpb.UUID,
	site *identitypb.Identity,
	app *configpb.Application,
	supported ...proto.Message,
) *node {
	t.Helper()

	return connectEngine(t, ctx, o, enginegrpc.WatchEngineResponse_Preamble_builder{
		Id: id,
		Cluster: enginegrpc.WatchEngineResponse_Preamble_Cluster_builder{
			Id: cluster,
		}.Build(),
		Application: app,
		Site:        site,
	}.Build(), supported...)
}

// connectEngine is like connectNode, for a node that sends the given preamble
// on its engine API.
func connectEngine(
	t *testing.T,
	ctx context.Context,
	o *observe.Observer,
	p *enginegrpc.WatchEngineResponse_Preamble,
	supported ...proto.Message,
) *node {
	t.Helper()

	engines := make(chan *engineFeed, 1)
	metrics := make(chan *metricsFeed, 1)

	// The Observer calls WatchClusterMetrics on one node of a cluster, and these
	// tests leave that call without a preamble, so that only the nodes' own
	// metrics are read.
	clusterMetrics := make(chan *metricsFeed, 16)

	clients := &observe.Clients{
		Engine: &enginegrpc.EngineAPIClientStub{
			WatchEngineFunc: func(
				ctx context.Context,
				_ *enginegrpc.WatchEngineRequest,
				_ ...grpc.CallOption,
			) (enginegrpc.EngineAPI_WatchEngineClient, error) {
				f := stubs.NewFeed[enginegrpc.WatchEngineResponse](ctx)
				engines <- f
				return f, nil
			},
		},
		Metrics: &metricsgrpc.MetricsAPIClientStub{
			WatchNodeMetricsFunc: func(
				ctx context.Context,
				_ *metricsgrpc.WatchNodeMetricsRequest,
				_ ...grpc.CallOption,
			) (metricsgrpc.MetricsAPI_WatchNodeMetricsClient, error) {
				f := stubs.NewFeed[metricsgrpc.WatchMetricsResponse](ctx)
				metrics <- f
				return f, nil
			},
			WatchClusterMetricsFunc: func(
				ctx context.Context,
				_ *metricsgrpc.WatchClusterMetricsRequest,
				_ ...grpc.CallOption,
			) (metricsgrpc.MetricsAPI_WatchClusterMetricsClient, error) {
				f := stubs.NewFeed[metricsgrpc.WatchMetricsResponse](ctx)
				clusterMetrics <- f
				return f, nil
			},
		},
	}

	go o.Serve(ctx, clients)

	n := &node{ID: p.GetId(), Engine: <-engines}
	n.sendEngine(t, enginegrpc.WatchEngineResponse_builder{Preamble: p})

	n.Metrics = <-metrics

	var list []string
	for _, m := range supported {
		list = append(list, string(proto.MessageName(m)))
	}
	n.sendMetrics(t, metricsgrpc.WatchMetricsResponse_builder{
		Preamble: metricsgrpc.WatchMetricsResponse_Preamble_builder{
			Id:               p.GetId(),
			ClusterId:        p.GetCluster().GetId(),
			Application:      p.GetApplication(),
			SupportedMetrics: list,
		}.Build(),
	})

	return n
}

func (n *node) sendEngine(t *testing.T, b enginegrpc.WatchEngineResponse_builder) {
	t.Helper()

	if err := n.Engine.Send(b.Build()); err != nil {
		t.Fatal(err)
	}
	synctest.Wait()
}

func (n *node) sendMetrics(t *testing.T, b metricsgrpc.WatchMetricsResponse_builder) {
	t.Helper()

	if err := n.Metrics.Send(b.Build()); err != nil {
		t.Fatal(err)
	}
	synctest.Wait()
}

// sample sends a sample of the metric with the given index in the preamble.
func (n *node) sample(t *testing.T, metric uint32, subject string, revision byte, value proto.Message) {
	t.Helper()

	b, err := proto.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}

	n.sendMetrics(t, metricsgrpc.WatchMetricsResponse_builder{
		Sample: metricsgrpc.WatchMetricsResponse_Sample_builder{
			MetricIndex: metric,
			Subject:     []byte(subject),
			Value:       b,
			Revision:    []byte{revision},
		}.Build(),
	})
}

func (n *node) heartbeat(t *testing.T) {
	t.Helper()

	n.sendEngine(t, enginegrpc.WatchEngineResponse_builder{
		Heartbeat: enginegrpc.WatchEngineResponse_Heartbeat_builder{}.Build(),
	})
}

func application(name string, handlers ...string) *configpb.Application {
	b := configpb.Application_builder{
		Identity: identitypb.Identity_builder{Name: name, Key: uuidpb.MustParse("0b6f0b7c-1a6c-4c2c-8d5c-4f3d3a1f0001")}.Build(),
	}
	for i, h := range handlers {
		b.Handlers = append(b.Handlers, configpb.Handler_builder{
			Identity: identitypb.Identity_builder{Name: h, Key: handlerKey(i)}.Build(),
			Type:     configpb.HandlerType_HANDLER_TYPE_AGGREGATE,
		}.Build())
	}
	return b.Build()
}

// handlerKey is the key of the handler with the given index in an application.
func handlerKey(i int) *uuidpb.UUID {
	return uuidpb.MustParse("0b6f0b7c-1a6c-4c2c-8d5c-4f3d3a1f1" + string(rune('0'+i)) + "00")
}

// watchRequest is a request for the stream of a cluster, which a test ends by
// cancelling it.
type watchRequest struct {
	Response *httptest.ResponseRecorder
	Cancel   context.CancelFunc
	Done     chan struct{}
}

// startWatch makes the request of the handler in the background.
func startWatch(ctx context.Context, h http.Handler, id string) *watchRequest {
	ctx, cancel := context.WithCancel(ctx)
	w := &watchRequest{httptest.NewRecorder(), cancel, make(chan struct{})}

	go func() {
		defer close(w.Done)
		req := httptest.NewRequest(http.MethodGet, "/-/api/clusters/"+id+"/watch", nil)
		h.ServeHTTP(w.Response, req.WithContext(ctx))
	}()

	return w
}

// event is one event of a stream.
type event struct {
	Name string
	Data map[string]any
}

// events returns the events that the stream has sent so far.
func (w *watchRequest) events(t testing.TB) []event {
	t.Helper()

	var out []event
	for block := range strings.SplitSeq(strings.TrimSpace(w.Response.Body.String()), "\n\n") {
		if block == "" {
			continue
		}

		name, data, ok := strings.Cut(block, "\n")
		if !ok || !strings.HasPrefix(name, "event: ") || !strings.HasPrefix(data, "data: ") {
			t.Fatalf("unexpected block: %q", block)
		}

		e := event{Name: strings.TrimPrefix(name, "event: ")}
		if err := json.Unmarshal([]byte(strings.TrimPrefix(data, "data: ")), &e.Data); err != nil {
			t.Fatal(err)
		}
		out = append(out, e)
	}

	return out
}

// since returns the events that came after the first event of the given name.
func since(events []event, name string) []event {
	for i, e := range events {
		if e.Name == name {
			return events[i+1:]
		}
	}
	return nil
}

// named returns the events of the given name.
func named(events []event, name string) []event {
	var out []event
	for _, e := range events {
		if e.Name == name {
			out = append(out, e)
		}
	}
	return out
}

// names returns the names of the events, in order.
func names(events []event) []string {
	var out []string
	for _, e := range events {
		out = append(out, e.Name)
	}
	return out
}

// at returns the value at the path in a decoded document, or fails the test.
func at(t testing.TB, doc any, path ...string) any {
	t.Helper()

	for _, key := range path {
		m, ok := doc.(map[string]any)
		if !ok {
			t.Fatalf("no object at %q in %v", key, doc)
		}
		doc, ok = m[key]
		if !ok {
			t.Fatalf("no %q in %v", key, m)
		}
	}

	return doc
}

func TestServer(t *testing.T) {
	t.Run("when the Observatory knows no cluster", func(t *testing.T) {
		h := New(observe.NewObserver(), observe.NewRecorder())

		t.Run("it lists no clusters, as an empty array", func(t *testing.T) {
			w := get(h, "/-/api/clusters")

			if w.Code != http.StatusOK {
				t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusOK)
			}
			if got := w.Body.String(); got != "[]\n" {
				t.Fatalf("unexpected body: got %q, want %q", got, "[]\n")
			}
		})

		t.Run("it fails with 404 for a cluster", func(t *testing.T) {
			w := get(h, "/-/api/clusters/e5c1bb5a-6ae0-4d3c-bba6-0cdd9e1f4e4a")

			if w.Code != http.StatusNotFound {
				t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusNotFound)
			}
		})

		t.Run("it fails with 404 for the stream of a cluster", func(t *testing.T) {
			w := get(h, "/-/api/clusters/e5c1bb5a-6ae0-4d3c-bba6-0cdd9e1f4e4a/watch")

			if w.Code != http.StatusNotFound {
				t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusNotFound)
			}
		})
	})

	t.Run("when the Observatory knows a cluster", func(t *testing.T) {
		withCluster := func(t *testing.T, test func(h http.Handler, id string)) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()

				o, r := observe.NewObserver(), observe.NewRecorder()
				cluster := uuidpb.Generate()
				connectNode(t, ctx, o, cluster, uuidpb.Generate(), application("statements", "account"))

				r.Record(time.Now(), o.Nodes())

				test(New(o, r), cluster.AsString())
			})
		}

		t.Run("it lists the cluster with the name of its application", func(t *testing.T) {
			withCluster(t, func(h http.Handler, id string) {
				var list []observe.ClusterSummary
				if err := json.Unmarshal(get(h, "/-/api/clusters").Body.Bytes(), &list); err != nil {
					t.Fatal(err)
				}
				if len(list) != 1 || list[0].ID != id || list[0].Application.Name != "statements" {
					t.Fatalf("unexpected clusters: %+v", list)
				}
			})
		})

		t.Run("it gives the cluster's view, which is not cached", func(t *testing.T) {
			withCluster(t, func(h http.Handler, id string) {
				w := get(h, "/-/api/clusters/"+id)

				if w.Code != http.StatusOK {
					t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusOK)
				}
				if got := w.Header().Get("Cache-Control"); got != "no-store" {
					t.Fatalf("unexpected Cache-Control: got %q, want %q", got, "no-store")
				}

				var view observe.ClusterView
				if err := json.Unmarshal(w.Body.Bytes(), &view); err != nil {
					t.Fatal(err)
				}
				if view.Application.Name != "statements" {
					t.Fatalf("unexpected application: %+v", view.Application)
				}
			})
		})
	})
}

// nilUUID is the key of the site of an installation with no site, in the API.
const nilUUID = "00000000-0000-0000-0000-000000000000"

func TestServerInstallations(t *testing.T) {
	// app returns an application with the given name and key.
	app := func(name string, key *uuidpb.UUID) *configpb.Application {
		return configpb.Application_builder{
			Identity: identitypb.Identity_builder{Name: name, Key: key}.Build(),
		}.Build()
	}
	site := func(name string, key *uuidpb.UUID) *identitypb.Identity {
		return identitypb.Identity_builder{Name: name, Key: key}.Build()
	}

	// keys are the keys and IDs of what the Observatory knows in these tests.
	type keys struct {
		EuWest, NamedStatements      *uuidpb.UUID
		Statements, Billing          *uuidpb.UUID
		StatementsAtEuWest, Unsited  *uuidpb.UUID
		BillingAtEuWest, BillingAtNS *uuidpb.UUID
	}

	// known is an Observatory that knows the statements application at the
	// eu-west site, run by a cluster, and with no site, run by an engine that
	// doesn't run as a cluster, and the billing application at the eu-west site
	// and at a site named "statements", each run by a cluster.
	known := func(t *testing.T, test func(h http.Handler, k keys)) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := observe.NewObserver(), observe.NewRecorder()
			k := keys{
				EuWest:             uuidpb.Generate(),
				NamedStatements:    uuidpb.Generate(),
				Statements:         uuidpb.Generate(),
				Billing:            uuidpb.Generate(),
				StatementsAtEuWest: uuidpb.Generate(),
				Unsited:            uuidpb.Generate(),
				BillingAtEuWest:    uuidpb.Generate(),
				BillingAtNS:        uuidpb.Generate(),
			}

			connectNodeAt(t, ctx, o, k.StatementsAtEuWest, uuidpb.Generate(), site("eu-west", k.EuWest), app("statements", k.Statements))
			connectEngine(t, ctx, o, enginegrpc.WatchEngineResponse_Preamble_builder{
				Id:          k.Unsited,
				Application: app("statements", k.Statements),
			}.Build())
			connectNodeAt(t, ctx, o, k.BillingAtEuWest, uuidpb.Generate(), site("eu-west", k.EuWest), app("billing", k.Billing))
			connectNodeAt(t, ctx, o, k.BillingAtNS, uuidpb.Generate(), site("statements", k.NamedStatements), app("billing", k.Billing))

			test(New(o, r), k)
		})
	}

	// installations returns what the API lists for the query, each as the name
	// of its application, and " at " and the name of its site if it has one.
	installations := func(t *testing.T, h http.Handler, query string) []string {
		t.Helper()

		w := get(h, "/-/api/installations"+query)
		if w.Code != http.StatusOK {
			t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusOK)
		}

		var list []observe.Installation
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}

		out := []string{}
		for _, i := range list {
			label := i.Application.Name
			if i.Site != nil {
				label += " at " + i.Site.Name
			}
			out = append(out, label)
		}
		return out
	}

	// clusters returns the IDs of the clusters that the API lists for the query.
	clusters := func(t *testing.T, h http.Handler, query string) []string {
		t.Helper()

		w := get(h, "/-/api/clusters"+query)
		if w.Code != http.StatusOK {
			t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusOK)
		}

		var list []observe.ClusterSummary
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}

		out := []string{}
		for _, c := range list {
			out = append(out, c.ID)
		}
		return out
	}

	expect := func(t *testing.T, got []string, want ...string) {
		t.Helper()

		if want == nil {
			want = []string{}
		}
		if !slices.Equal(got, want) {
			t.Fatalf("unexpected result: got %q, want %q", got, want)
		}
	}

	t.Run("it lists the installations at a site, by the site's key", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, installations(t, h, "?site="+k.EuWest.AsString()), "billing at eu-west", "statements at eu-west")
		})
	})

	t.Run("it lists the installations with no site, by the nil UUID", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, installations(t, h, "?site="+nilUUID), "statements")

			body := get(h, "/-/api/installations?site="+nilUUID).Body.String()
			if strings.Contains(body, `"site"`) {
				t.Fatalf("expected no site in an installation with no site: %s", body)
			}
		})
	})

	t.Run("it lists the installations of an application, by the application's key", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, installations(t, h, "?application="+k.Billing.AsString()), "billing at eu-west", "billing at statements")
		})
	})

	t.Run("it lists the installation of an application at a site, by their names", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, installations(t, h, "?site-name=eu-west&application-name=statements"), "statements at eu-west")
		})
	})

	t.Run("it tells a site from an application that has the same name", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, installations(t, h, "?site-name=statements"), "billing at statements")
			expect(t, installations(t, h, "?application-name=statements"), "statements", "statements at eu-west")
		})
	})

	t.Run("it lists no installation, as an empty array, for a name that nothing has", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, installations(t, h, "?application-name=nothing"))
		})
	})

	t.Run("it lists the clusters of an installation at a site", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, clusters(t, h, "?site="+k.EuWest.AsString()+"&application="+k.Statements.AsString()), k.StatementsAtEuWest.AsString())
		})
	})

	t.Run("it lists the engine of an installation with no site, by the nil UUID", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, clusters(t, h, "?site="+nilUUID+"&application="+k.Statements.AsString()), k.Unsited.AsString())
		})
	})

	t.Run("it lists no cluster, as an empty array, for an installation that it doesn't know", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			expect(t, clusters(t, h, "?site="+k.NamedStatements.AsString()+"&application="+k.Statements.AsString()))
		})
	})

	t.Run("it fails with 400 for the clusters of an application with no site's key", func(t *testing.T) {
		known(t, func(h http.Handler, k keys) {
			if w := get(h, "/-/api/clusters?application="+k.Statements.AsString()); w.Code != http.StatusBadRequest {
				t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusBadRequest)
			}
		})
	})
}

func TestServerDown(t *testing.T) {
	// forgotten is a cluster that the Observatory had a node of, and forgot the node
	// after it had not reported for a long time.
	forgotten := func(t *testing.T, test func(h http.Handler, id string)) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())

			o, r := observe.NewObserver(), observe.NewRecorder()
			cluster := uuidpb.Generate()
			site := identitypb.Identity_builder{Name: "eu-west", Key: uuidpb.Generate()}.Build()
			n := connectNodeAt(t, ctx, o, cluster, uuidpb.Generate(), site, application("statements", "account"))

			cancel()
			n.Engine.End(nil)
			synctest.Wait()

			time.Sleep(4 * 24 * time.Hour)
			o.ForgetIdle(time.Now())
			if got := len(o.Nodes()); got != 0 {
				t.Fatalf("unexpected number of nodes: got %d, want 0", got)
			}

			test(New(o, r), cluster.AsString())
		})
	}

	t.Run("it lists a cluster that it has forgotten the nodes of, as not reporting", func(t *testing.T) {
		forgotten(t, func(h http.Handler, id string) {
			var list []observe.ClusterSummary
			if err := json.Unmarshal(get(h, "/-/api/clusters").Body.Bytes(), &list); err != nil {
				t.Fatal(err)
			}
			if len(list) != 1 || list[0].ID != id || list[0].Reporting || list[0].Site == nil || list[0].Site.Name != "eu-west" {
				t.Fatalf("unexpected clusters: %+v", list)
			}
		})
	})

	t.Run("it gives the view of a cluster that it has forgotten the nodes of, as down, with its application and site", func(t *testing.T) {
		forgotten(t, func(h http.Handler, id string) {
			w := get(h, "/-/api/clusters/"+id)
			if w.Code != http.StatusOK {
				t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusOK)
			}

			var view observe.ClusterView
			if err := json.Unmarshal(w.Body.Bytes(), &view); err != nil {
				t.Fatal(err)
			}
			if view.Application.Name != "statements" || view.Site == nil || view.Site.Name != "eu-west" || len(view.Overview.Cluster.Nodes) != 0 {
				t.Fatalf("unexpected view: %+v", view)
			}
		})
	})

	t.Run("it streams a cluster that it has forgotten the nodes of, as down", func(t *testing.T) {
		forgotten(t, func(h http.Handler, id string) {
			// This runs in the bubble of the test, and t is not the bubble's.
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			w := startWatch(ctx, h, id)
			synctest.Wait()

			events := w.events(t)
			if len(events) == 0 || events[0].Name != "changed" {
				t.Fatalf("unexpected events: %+v", events)
			}
			doc := events[0].Data
			if at(t, doc, "application", "name") != "statements" || at(t, doc, "application", "site") != "eu-west" {
				t.Fatalf("unexpected application: %v", doc["application"])
			}
			if down, _ := doc["down"].(bool); !down {
				t.Fatalf("expected a document that says the cluster is down: %v", doc["down"])
			}

			w.Cancel()
			<-w.Done
		})
	})
}

func TestServerKeepsDown(t *testing.T) {
	t.Run("the document says that a cluster whose nodes have stopped reporting is down, and keeps its streams", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := observe.NewObserver(), observe.NewRecorder()
			cluster := uuidpb.Generate()
			n := connectNode(t, ctx, o, cluster, uuidpb.Generate(), application("statements", "account"), new(metricsgrpc.EventStreamLength))
			n.sample(t, 0, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: uuidpb.Generate(), Watermark: 7}.Build())
			r.Record(time.Now(), o.Nodes())

			n.Engine.End(nil)
			synctest.Wait()
			time.Sleep(time.Second)
			r.Record(time.Now(), o.Nodes())

			w := startWatch(ctx, New(o, r), cluster.AsString())
			synctest.Wait()

			doc := w.events(t)[0].Data
			if down, _ := doc["down"].(bool); !down {
				t.Fatalf("expected a document that says the cluster is down: %v", doc["down"])
			}
			if len(doc["eventStreams"].(map[string]any)) != 1 {
				t.Fatalf("expected the stream that it had: %v", doc["eventStreams"])
			}

			w.Cancel()
			<-w.Done
		})
	})
}

func TestStream(t *testing.T) {
	const (
		queueIndex    = 0 // QueueCommandsPending
		recordedIndex = 1 // HandlerEventsRecorded
		lengthIndex   = 2 // EventStreamLength
		removedIndex  = 3 // QueueCommandsRemoved
	)

	supported := []proto.Message{
		new(metricsgrpc.QueueCommandsPending),
		new(metricsgrpc.HandlerEventsRecorded),
		new(metricsgrpc.EventStreamLength),
		new(metricsgrpc.QueueCommandsRemoved),
	}

	// withStream connects a node of a cluster that runs an application with two
	// handlers, and starts the stream of the cluster.
	withStream := func(t *testing.T, test func(o *observe.Observer, r *observe.Recorder, n *node, w *watchRequest)) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := observe.NewObserver(), observe.NewRecorder()
			cluster := uuidpb.Generate()
			n := connectNode(t, ctx, o, cluster, uuidpb.Generate(), application("statements", "account", "ledger"), supported...)

			w := startWatch(ctx, New(o, r), cluster.AsString())
			synctest.Wait()

			test(o, r, n, w)

			w.Cancel()
			<-w.Done
		})
	}

	// patches returns the data of the changed events after the burst.
	patches := func(w *watchRequest, t testing.TB) []map[string]any {
		var out []map[string]any
		for _, e := range named(since(w.events(t), "synced"), "changed") {
			out = append(out, e.Data)
		}
		return out
	}

	t.Run("the document says what the engine declares in its preamble", func(t *testing.T) {
		// start connects a node of an engine whose preamble is p, and gives the
		// test the document of the stream of the node's cluster.
		start := func(t *testing.T, p *enginegrpc.WatchEngineResponse_Preamble, test func(doc map[string]any)) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()

				o, r := observe.NewObserver(), observe.NewRecorder()
				p.SetApplication(application("statements", "account"))
				connectEngine(t, ctx, o, p, supported...)

				id := p.GetId()
				if p.HasCluster() {
					id = p.GetCluster().GetId()
				}

				w := startWatch(ctx, New(o, r), id.AsString())
				synctest.Wait()

				test(w.events(t)[0].Data)

				w.Cancel()
				<-w.Done
			})
		}

		t.Run("it gives the cluster of an engine that runs as one, and whether any node reports its workloads", func(t *testing.T) {
			cluster := uuidpb.Generate()
			start(t, enginegrpc.WatchEngineResponse_Preamble_builder{
				Id: uuidpb.Generate(),
				Cluster: enginegrpc.WatchEngineResponse_Preamble_Cluster_builder{
					Id:               cluster,
					ReportsWorkloads: true,
				}.Build(),
			}.Build(), func(doc map[string]any) {
				b, _ := json.Marshal(at(t, doc, "cluster"))
				if string(b) != `{"reportsWorkloads":true}` {
					t.Fatalf("unexpected cluster: %s", b)
				}
			})
		})

		t.Run("it gives no cluster for an engine that doesn't run as one, and the engine as its only node", func(t *testing.T) {
			engine := uuidpb.Generate()
			start(t, enginegrpc.WatchEngineResponse_Preamble_builder{
				Id: engine,
			}.Build(), func(doc map[string]any) {
				if _, ok := doc["cluster"]; ok {
					t.Fatalf("unexpected cluster in %v", doc)
				}
				nodes := at(t, doc, "nodes").(map[string]any)
				if _, ok := nodes[engine.AsString()]; len(nodes) != 1 || !ok {
					t.Fatalf("unexpected nodes: %v", nodes)
				}
			})
		})

		t.Run("it says that the engine uses one event stream and one queue, if it says so", func(t *testing.T) {
			start(t, enginegrpc.WatchEngineResponse_Preamble_builder{
				Id: uuidpb.Generate(),
				EventStreamModel: enginegrpc.EventStreamModel_builder{
					SingleEventStream: &enginegrpc.EventStreamModel_SingleEventStream{},
				}.Build(),
				QueueModel: enginegrpc.QueueModel_builder{
					SingleQueue: &enginegrpc.QueueModel_SingleQueue{},
				}.Build(),
			}.Build(), func(doc map[string]any) {
				if doc["oneStream"] != true || doc["oneQueue"] != true {
					t.Fatalf("expected one stream and one queue: %v", doc)
				}
			})
		})

		t.Run("it says nothing of event streams and queues, if the engine uses several", func(t *testing.T) {
			start(t, enginegrpc.WatchEngineResponse_Preamble_builder{
				Id: uuidpb.Generate(),
				EventStreamModel: enginegrpc.EventStreamModel_builder{
					MultipleEventStreams: &enginegrpc.EventStreamModel_MultipleEventStreams{},
				}.Build(),
				QueueModel: enginegrpc.QueueModel_builder{
					MultipleQueues: &enginegrpc.QueueModel_MultipleQueues{},
				}.Build(),
			}.Build(), func(doc map[string]any) {
				for _, absent := range []string{"oneStream", "oneQueue"} {
					if _, ok := doc[absent]; ok {
						t.Fatalf("unexpected %q in %v", absent, doc)
					}
				}
			})
		})
	})

	t.Run("the document names the site of the cluster in its application, if there is one", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := observe.NewObserver(), observe.NewRecorder()
			a, b := uuidpb.Generate(), uuidpb.Generate()
			site := identitypb.Identity_builder{Name: "eu-west", Key: uuidpb.Generate()}.Build()

			connectNodeAt(t, ctx, o, a, uuidpb.Generate(), site, application("statements", "account"), supported...)
			connectNode(t, ctx, o, b, uuidpb.Generate(), application("billing", "invoices"), supported...)

			for cluster, want := range map[string]string{a.AsString(): "eu-west", b.AsString(): ""} {
				w := startWatch(ctx, New(o, r), cluster)
				synctest.Wait()

				doc := w.events(t)[0].Data
				got, _ := doc["application"].(map[string]any)["site"].(string)
				if got != want {
					t.Fatalf("unexpected site: got %q, want %q", got, want)
				}

				w.Cancel()
				<-w.Done
			}
		})
	})

	t.Run("the burst", func(t *testing.T) {
		t.Run("it is the whole document, then the time series, then the heartbeats, then synced", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()

				o, r := observe.NewObserver(), observe.NewRecorder()
				cluster := uuidpb.Generate()
				n := connectNode(t, ctx, o, cluster, uuidpb.Generate(), application("statements", "account", "ledger"), supported...)

				// The tiles need the metrics of what they show, and a handler has a
				// chart when the node reports the events that it records.
				n.sample(t, queueIndex, "q", 1, metricsgrpc.QueueCommandsPending_builder{QueueId: uuidpb.Generate(), CurrentCount: 1}.Build())
				n.sample(t, removedIndex, "r", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: uuidpb.Generate(), CumulativeCount: 1}.Build())
				n.sample(t, lengthIndex, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: uuidpb.Generate(), Watermark: 1}.Build())
				n.sample(t, recordedIndex, "a", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: handlerKey(0), CumulativeCount: 1}.Build())
				n.heartbeat(t)

				w := startWatch(ctx, New(o, r), cluster.AsString())
				synctest.Wait()

				events := w.events(t)
				got := names(events)
				want := []string{"changed", "recorded", "recorded", "recorded", "heartbeat", "synced"}
				if len(got) != len(want) {
					t.Fatalf("unexpected events: got %v, want %v", got, want)
				}
				for i := range want {
					if got[i] != want[i] {
						t.Fatalf("unexpected events: got %v, want %v", got, want)
					}
				}

				if got := w.Response.Header().Get("Content-Type"); got != "text/event-stream" {
					t.Fatalf("unexpected Content-Type: got %q, want %q", got, "text/event-stream")
				}

				doc := events[0].Data
				if at(t, doc, "application", "name") != "statements" {
					t.Fatalf("unexpected application: %v", doc["application"])
				}
				if at(t, doc, "handlers", handlerKey(0).AsString(), "name") != "account" {
					t.Fatalf("unexpected handlers: %v", doc["handlers"])
				}
				if at(t, doc, "handlers", handlerKey(1).AsString(), "kind") != "aggregate" {
					t.Fatalf("unexpected handlers: %v", doc["handlers"])
				}
				if len(at(t, doc, "queues").(map[string]any)) != 1 || len(at(t, doc, "eventStreams").(map[string]any)) != 1 {
					t.Fatalf("unexpected collections: %v", doc)
				}
				if len(at(t, doc, "nodes").(map[string]any)) != 1 {
					t.Fatalf("unexpected nodes: %v", doc["nodes"])
				}

				var series []string
				for _, e := range named(events, "recorded") {
					series = append(series, e.Data["series"].(string))
				}
				wantSeries := []string{"events", "handlers/" + handlerKey(0).AsString(), "throughput"}
				for i := range wantSeries {
					if series[i] != wantSeries[i] {
						t.Fatalf("unexpected time series: got %v, want %v", series, wantSeries)
					}
				}

				w.Cancel()
				<-w.Done
			})
		})

		t.Run("it leaves out a part that no node supports, and gives a rate that isn't known yet as an empty object", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()

				o, r := observe.NewObserver(), observe.NewRecorder()
				cluster := uuidpb.Generate()

				// Only the events that handlers record, and the messages that are removed.
				connectNode(t, ctx, o, cluster, uuidpb.Generate(), application("statements", "account", "ledger"),
					new(metricsgrpc.HandlerEventsRecorded), new(metricsgrpc.QueueCommandsRemoved))

				w := startWatch(ctx, New(o, r), cluster.AsString())
				synctest.Wait()

				doc := named(w.events(t), "changed")[0].Data
				for _, absent := range []string{"eventStreams", "queues"} {
					if _, ok := doc[absent]; ok {
						t.Fatalf("unexpected %q in %v", absent, doc)
					}
				}
				// A rate that isn't known yet has no "rate", and the throughput says what it
				// counts, which is the messages removed, because the nodes support that.
				for name, want := range map[string]string{
					"events":     "{}",
					"throughput": `{"of":"removed"}`,
				} {
					b, _ := json.Marshal(at(t, doc, "rates", name))
					if string(b) != want {
						t.Fatalf("unexpected rate %q: got %s, want %s", name, b, want)
					}
				}

				for _, h := range doc["handlers"].(map[string]any) {
					if _, ok := h.(map[string]any)["bindings"]; ok {
						t.Fatalf("unexpected bindings in %v", h)
					}
				}

				w.Cancel()
				<-w.Done
			})
		})

		t.Run("it gives a node's heartbeats as the time before the burst, oldest first", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()

				o, r := observe.NewObserver(), observe.NewRecorder()
				cluster := uuidpb.Generate()
				n := connectNode(t, ctx, o, cluster, uuidpb.Generate(), application("a"))

				n.heartbeat(t)
				time.Sleep(3 * time.Second)
				n.heartbeat(t)
				time.Sleep(time.Second)

				w := startWatch(ctx, New(o, r), cluster.AsString())
				synctest.Wait()

				beats := named(w.events(t), "heartbeat")
				if len(beats) != 2 || beats[0].Data["msBefore"] != 4000.0 || beats[1].Data["msBefore"] != 1000.0 {
					t.Fatalf("unexpected heartbeats: %v", beats)
				}
				if beats[0].Data["node"] != n.ID.AsString() {
					t.Fatalf("unexpected node: %v", beats[0].Data["node"])
				}

				w.Cancel()
				<-w.Done
			})
		})
	})

	t.Run("it doesn't send what hasn't changed", func(t *testing.T) {
		withStream(t, func(_ *observe.Observer, _ *observe.Recorder, _ *node, w *watchRequest) {
			time.Sleep(3 * time.Second)
			synctest.Wait()

			if got := patches(w, t); len(got) != 0 {
				t.Fatalf("unexpected patches after the burst: %v", got)
			}
		})
	})

	t.Run("it sends only the difference, as a merge patch", func(t *testing.T) {
		t.Run("when an entry is added to a collection", func(t *testing.T) {
			withStream(t, func(_ *observe.Observer, _ *observe.Recorder, n *node, w *watchRequest) {
				other := uuidpb.Generate()
				n.sendEngine(t, enginegrpc.WatchEngineResponse_builder{
					LiveClusterNodes: enginegrpc.LiveClusterNodes_builder{Nodes: []*enginegrpc.ClusterNode{
						enginegrpc.ClusterNode_builder{Id: n.ID}.Build(),
						enginegrpc.ClusterNode_builder{Id: other}.Build(),
					}}.Build(),
				})

				time.Sleep(time.Second)
				synctest.Wait()

				got := patches(w, t)
				if len(got) != 1 {
					t.Fatalf("unexpected patches: %v", got)
				}

				want := `{"nodes":{"` + other.AsString() + `":{}}}`
				b, _ := json.Marshal(got[0])
				if string(b) != want {
					t.Fatalf("unexpected patch: got %s, want %s", b, want)
				}
			})
		})

		t.Run("when a field of an entry changes", func(t *testing.T) {
			withStream(t, func(_ *observe.Observer, _ *observe.Recorder, n *node, w *watchRequest) {
				queue := uuidpb.Generate()
				// Each sample is taken in before the stream next looks, so that each
				// makes a patch of its own.
				n.sample(t, queueIndex, "q", 1, metricsgrpc.QueueCommandsPending_builder{QueueId: queue, CurrentCount: 7}.Build())
				synctest.Wait()
				time.Sleep(time.Second)
				synctest.Wait()
				n.sample(t, queueIndex, "q", 2, metricsgrpc.QueueCommandsPending_builder{QueueId: queue, CurrentCount: 9}.Build())
				synctest.Wait()
				time.Sleep(time.Second)
				synctest.Wait()

				got := patches(w, t)
				if len(got) != 2 {
					t.Fatalf("unexpected patches: %v", got)
				}

				// The first creates the collection, and the second changes the one
				// field of the one entry.
				b, _ := json.Marshal(got[1])
				want := `{"queues":{"` + queue.AsString() + `":{"messages":9}}}`
				if string(b) != want {
					t.Fatalf("unexpected patch: got %s, want %s", b, want)
				}
			})
		})

		t.Run("when an entry goes, as a null", func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()

				o, r := observe.NewObserver(), observe.NewRecorder()
				cluster, id := uuidpb.Generate(), uuidpb.Generate()
				connectNode(t, ctx, o, cluster, id, application("statements", "account", "ledger"))

				w := startWatch(ctx, New(o, r), cluster.AsString())
				synctest.Wait()

				// The node connects again, and the new version of its application has
				// one handler fewer.
				connectNode(t, ctx, o, cluster, id, application("statements", "account"))

				time.Sleep(time.Second)
				synctest.Wait()

				got := patches(w, t)
				if len(got) != 1 {
					t.Fatalf("unexpected patches: %v", got)
				}

				b, _ := json.Marshal(got[0])
				want := `{"handlers":{"` + handlerKey(1).AsString() + `":null}}`
				if string(b) != want {
					t.Fatalf("unexpected patch: got %s, want %s", b, want)
				}

				w.Cancel()
				<-w.Done
			})
		})
	})

	t.Run("it rounds a rate to three significant figures", func(t *testing.T) {
		withStream(t, func(_ *observe.Observer, _ *observe.Recorder, n *node, w *watchRequest) {
			n.sample(t, lengthIndex, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: uuidpb.Generate(), Watermark: 1}.Build())
			n.sample(t, recordedIndex, "a", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: handlerKey(0), CumulativeCount: 0}.Build())
			time.Sleep(30 * time.Second)
			n.sample(t, recordedIndex, "a", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: handlerKey(0), CumulativeCount: 10}.Build())

			time.Sleep(time.Second)
			synctest.Wait()

			// 10 events in the 31 seconds since the first sample is 0.32258...
			var rate any
			for _, p := range patches(w, t) {
				if r, ok := p["rates"].(map[string]any); ok {
					if v, ok := r["events"].(map[string]any); ok {
						rate = v["rate"]
					}
				}
			}
			if rate != 0.323 {
				t.Fatalf("unexpected rate: got %v, want 0.323", rate)
			}
		})
	})

	t.Run("it tells a page that a heartbeat has arrived, as it arrives", func(t *testing.T) {
		withStream(t, func(_ *observe.Observer, _ *observe.Recorder, n *node, w *watchRequest) {
			n.heartbeat(t)

			after := since(w.events(t), "synced")
			if len(after) != 1 || after[0].Name != "heartbeat" ||
				after[0].Data["node"] != n.ID.AsString() || after[0].Data["msBefore"] != 0.0 {
				t.Fatalf("unexpected events: %v", after)
			}
		})
	})

	t.Run("it doesn't tell a page about the heartbeats of another cluster", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := observe.NewObserver(), observe.NewRecorder()
			watched, other := uuidpb.Generate(), uuidpb.Generate()
			connectNode(t, ctx, o, watched, uuidpb.Generate(), application("a"))
			stranger := connectNode(t, ctx, o, other, uuidpb.Generate(), application("b"))

			w := startWatch(ctx, New(o, r), watched.AsString())
			synctest.Wait()

			stranger.heartbeat(t)

			if after := since(w.events(t), "synced"); len(after) != 0 {
				t.Fatalf("unexpected events: %v", after)
			}

			w.Cancel()
			<-w.Done
		})
	})

	t.Run("it sends the points of a time series that the page doesn't have yet, each time", func(t *testing.T) {
		withStream(t, func(o *observe.Observer, r *observe.Recorder, n *node, w *watchRequest) {
			// The stream ticks on the second, and the recording is done between ticks,
			// so that the order of the two doesn't matter.
			time.Sleep(500 * time.Millisecond)

			queue := uuidpb.Generate()
			n.sample(t, removedIndex, "r", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: queue, CumulativeCount: 0}.Build())

			// The rate is known once the total has been seen for long enough.
			time.Sleep(10 * time.Second)
			n.sample(t, removedIndex, "r", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: queue, CumulativeCount: 30}.Build())

			// The first tick after the sample is when the page learns the rate. It has
			// the point that was recorded.
			r.Record(time.Now(), o.Nodes())
			time.Sleep(time.Second)
			synctest.Wait()

			recorded := named(since(w.events(t), "synced"), "recorded")
			if len(recorded) != 1 || recorded[0].Data["series"] != "throughput" {
				t.Fatalf("unexpected events: %v", recorded)
			}
			got := recorded[0].Data["points"].([]any)
			if len(got) != 1 || got[0].([]any)[0] != 500.0 || got[0].([]any)[1] != 3.0 {
				t.Fatalf("unexpected points: %v", got)
			}

			n.sample(t, removedIndex, "r", 3, metricsgrpc.QueueCommandsRemoved_builder{QueueId: queue, CumulativeCount: 60}.Build())
			time.Sleep(time.Second)
			r.Record(time.Now(), o.Nodes())
			time.Sleep(time.Second)
			synctest.Wait()

			recorded = named(since(w.events(t), "synced"), "recorded")
			if len(recorded) != 2 {
				t.Fatalf("unexpected events: %v", recorded)
			}
			got = recorded[1].Data["points"].([]any)
			if len(got) != 1 || got[0].([]any)[0] != 500.0 || got[0].([]any)[1] != 5.0 {
				t.Fatalf("unexpected points: %v", got)
			}
		})
	})

	t.Run("it ends when the client goes away", func(t *testing.T) {
		withStream(t, func(_ *observe.Observer, _ *observe.Recorder, _ *node, w *watchRequest) {
			w.Cancel()
			<-w.Done
		})
	})

	t.Run("it ends when the Observatory forgets the cluster", func(t *testing.T) {
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := observe.NewObserver(), observe.NewRecorder()
			cluster := uuidpb.Generate()
			connectNode(t, ctx, o, cluster, uuidpb.Generate(), application("a"))

			w := startWatch(ctx, New(o, r), cluster.AsString())
			synctest.Wait()

			o.Forget(cluster)
			time.Sleep(time.Second)
			<-w.Done
		})
	})
}
