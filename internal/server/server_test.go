package server_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
// application, and sends the preambles of its engine API and its metrics API.
// The preamble of the metrics API lists the given metrics, each with the whole
// cluster as its reach.
func connectNode(
	t *testing.T,
	ctx context.Context,
	o *observe.Observer,
	cluster, id *uuidpb.UUID,
	app *configpb.Application,
	supported ...proto.Message,
) *node {
	t.Helper()

	engines := make(chan *engineFeed, 1)
	metrics := make(chan *metricsFeed, 1)

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
			WatchMetricsFunc: func(
				ctx context.Context,
				_ *metricsgrpc.WatchMetricsRequest,
				_ ...grpc.CallOption,
			) (metricsgrpc.MetricsAPI_WatchMetricsClient, error) {
				f := stubs.NewFeed[metricsgrpc.WatchMetricsResponse](ctx)
				metrics <- f
				return f, nil
			},
		},
	}

	go o.Serve(ctx, clients)

	n := &node{ID: id, Engine: <-engines}
	n.sendEngine(t, enginegrpc.WatchEngineResponse_builder{
		Preamble: enginegrpc.WatchEngineResponse_Preamble_builder{
			NodeId:      id,
			ClusterId:   cluster,
			Application: app,
		}.Build(),
	})

	n.Metrics = <-metrics

	var list []*metricsgrpc.SupportedMetric
	for _, m := range supported {
		reach := metricsgrpc.Reach_REACH_CLUSTER
		list = append(list, metricsgrpc.SupportedMetric_builder{
			MessageName: string(proto.MessageName(m)),
			Reach:       &reach,
		}.Build())
	}
	n.sendMetrics(t, metricsgrpc.WatchMetricsResponse_builder{
		Preamble: metricsgrpc.WatchMetricsResponse_Preamble_builder{
			NodeId:           id,
			ClusterId:        cluster,
			Application:      app,
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
		req := httptest.NewRequest(http.MethodGet, "/api/clusters/"+id+"/watch", nil)
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
			w := get(h, "/api/clusters")

			if w.Code != http.StatusOK {
				t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusOK)
			}
			if got := w.Body.String(); got != "[]\n" {
				t.Fatalf("unexpected body: got %q, want %q", got, "[]\n")
			}
		})

		t.Run("it fails with 404 for a cluster", func(t *testing.T) {
			w := get(h, "/api/clusters/e5c1bb5a-6ae0-4d3c-bba6-0cdd9e1f4e4a")

			if w.Code != http.StatusNotFound {
				t.Fatalf("unexpected status: got %d, want %d", w.Code, http.StatusNotFound)
			}
		})

		t.Run("it fails with 404 for the stream of a cluster", func(t *testing.T) {
			w := get(h, "/api/clusters/e5c1bb5a-6ae0-4d3c-bba6-0cdd9e1f4e4a/watch")

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
				if err := json.Unmarshal(get(h, "/api/clusters").Body.Bytes(), &list); err != nil {
					t.Fatal(err)
				}
				if len(list) != 1 || list[0].ID != id || list[0].Application.Name != "statements" {
					t.Fatalf("unexpected clusters: %+v", list)
				}
			})
		})

		t.Run("it gives the cluster's view, which is not cached", func(t *testing.T) {
			withCluster(t, func(h http.Handler, id string) {
				w := get(h, "/api/clusters/"+id)

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
				n.sample(t, queueIndex, "q", 1, metricsgrpc.QueueCommandsPending_builder{QueueId: uuidpb.Generate(), Value: 1}.Build())
				n.sample(t, removedIndex, "r", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: uuidpb.Generate(), Value: 1}.Build())
				n.sample(t, lengthIndex, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: uuidpb.Generate(), Value: 1}.Build())
				n.sample(t, recordedIndex, "a", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: handlerKey(0), Value: 1}.Build())
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
					LiveNodes: enginegrpc.LiveNodes_builder{NodeIds: []*uuidpb.UUID{n.ID, other}}.Build(),
				})

				time.Sleep(time.Second)
				synctest.Wait()

				got := patches(w, t)
				if len(got) != 1 {
					t.Fatalf("unexpected patches: %v", got)
				}

				want := `{"nodes":{"` + other.AsString() + `":{"workloads":0}}}`
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
				n.sample(t, queueIndex, "q", 1, metricsgrpc.QueueCommandsPending_builder{QueueId: queue, Value: 7}.Build())
				synctest.Wait()
				time.Sleep(time.Second)
				synctest.Wait()
				n.sample(t, queueIndex, "q", 2, metricsgrpc.QueueCommandsPending_builder{QueueId: queue, Value: 9}.Build())
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
			n.sample(t, lengthIndex, "s", 1, metricsgrpc.EventStreamLength_builder{EventStreamId: uuidpb.Generate(), Value: 1}.Build())
			n.sample(t, recordedIndex, "a", 1, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: handlerKey(0), Value: 0}.Build())
			time.Sleep(30 * time.Second)
			n.sample(t, recordedIndex, "a", 2, metricsgrpc.HandlerEventsRecorded_builder{HandlerKey: handlerKey(0), Value: 10}.Build())

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
			n.sample(t, removedIndex, "r", 1, metricsgrpc.QueueCommandsRemoved_builder{QueueId: queue, Value: 0}.Build())

			// The rate is known once the total has been seen for long enough.
			time.Sleep(10 * time.Second)
			n.sample(t, removedIndex, "r", 2, metricsgrpc.QueueCommandsRemoved_builder{QueueId: queue, Value: 30}.Build())

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

			n.sample(t, removedIndex, "r", 3, metricsgrpc.QueueCommandsRemoved_builder{QueueId: queue, Value: 60}.Build())
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
