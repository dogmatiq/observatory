package tunnel_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dogmatiq/protobuf/configpb"
	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/identitypb"
	"github.com/dogmatiq/protobuf/uuidpb"
	"github.com/dogmatiq/tenet"
	"google.golang.org/grpc"

	"github.com/dogmatiq/observatory/internal/observe"
	. "github.com/dogmatiq/observatory/internal/tunnel"
)

// engine is the engine API of a node, which sends its preamble and then nothing.
type engine struct {
	enginegrpc.UnimplementedEngineAPIServer
	node, cluster *uuidpb.UUID

	// ended is closed when the Observatory's call to the engine API ends.
	ended chan struct{}
}

func (e *engine) WatchEngine(
	_ *enginegrpc.WatchEngineRequest,
	stream grpc.ServerStreamingServer[enginegrpc.WatchEngineResponse],
) error {
	defer close(e.ended)

	err := stream.Send(enginegrpc.WatchEngineResponse_builder{
		Preamble: enginegrpc.WatchEngineResponse_Preamble_builder{
			NodeId:    e.node,
			ClusterId: e.cluster,
			Application: configpb.Application_builder{
				Identity: identitypb.Identity_builder{
					Name: "statements",
					Key:  uuidpb.Generate(),
				}.Build(),
			}.Build(),
		}.Build(),
	}.Build())
	if err != nil {
		return err
	}

	<-stream.Context().Done()
	return stream.Context().Err()
}

// connect starts a node that connects to the tunnel at url, and serves its
// engine API, as a node of an engine does. The channel that it returns is closed
// when the Observatory's call to the engine API ends.
func connect(t *testing.T, url string, node, cluster *uuidpb.UUID) (*tenet.Client, *grpc.Server, <-chan struct{}) {
	t.Helper()

	client, err := tenet.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { client.Close() })

	listener, err := client.Listen(Network, Address)
	if err != nil {
		t.Fatal(err)
	}

	server := grpc.NewServer()
	ended := make(chan struct{})
	enginegrpc.RegisterEngineAPIServer(server, &engine{node: node, cluster: cluster, ended: ended})
	go server.Serve(listener)
	t.Cleanup(server.Stop)

	return client, server, ended
}

// patience is how long a test waits for something that happens over the network.
const patience = 5 * time.Second

// eventually fails the test unless the condition becomes true within
// [patience].
func eventually(t *testing.T, what string, condition func() bool) {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), patience)
	defer cancel()

	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for !condition() {
		select {
		case <-ctx.Done():
			t.Fatalf("timed out waiting for %s", what)
		case <-ticker.C:
		}
	}
}

// ends reports whether the channel is closed within [patience].
func ends(ch <-chan struct{}) bool {
	ctx, cancel := context.WithTimeout(context.Background(), patience)
	defer cancel()

	select {
	case <-ch:
		return true
	case <-ctx.Done():
		return false
	}
}

// start serves the tunnel handler, and returns the URL that a node connects to.
func start(t *testing.T, ctx context.Context, o *observe.Observer) string {
	t.Helper()

	server := httptest.NewServer(Handler(ctx, o))
	t.Cleanup(server.Close)

	return "ws" + strings.TrimPrefix(server.URL, "http")
}

// connected reports whether the observer has a node with the given ID, and
// whether its connection is open.
func connected(o *observe.Observer, node *uuidpb.UUID) (known, open bool) {
	for _, n := range o.Nodes() {
		if n.Preamble.GetNodeId().AsString() == node.AsString() {
			return true, n.Connected
		}
	}
	return false, false
}

func TestHandler(t *testing.T) {
	t.Run("it observes a node that opens a tunnel", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()

		o := observe.NewObserver()
		url := start(t, ctx, o)

		node, cluster := uuidpb.Generate(), uuidpb.Generate()
		_, _, _ = connect(t, url, node, cluster)

		eventually(t, "the node to be observed", func() bool {
			_, open := connected(o, node)
			return open
		})

		nodes := o.Nodes()
		if len(nodes) != 1 {
			t.Fatalf("unexpected number of nodes: got %d, want 1", len(nodes))
		}
		if got := nodes[0].Preamble.GetClusterId().AsString(); got != cluster.AsString() {
			t.Fatalf("unexpected cluster: got %s, want %s", got, cluster)
		}
	})

	t.Run("it stops observing a node when its tunnel ends", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()

		o := observe.NewObserver()
		url := start(t, ctx, o)

		node := uuidpb.Generate()
		client, server, _ := connect(t, url, node, uuidpb.Generate())

		eventually(t, "the node to be observed", func() bool {
			_, open := connected(o, node)
			return open
		})

		// The tunnel ends once the last connection through it has closed.
		server.Stop()
		client.Close()

		eventually(t, "the node to be disconnected", func() bool {
			known, open := connected(o, node)
			return known && !open
		})
	})

	t.Run("it replaces the connection of a node that opens another tunnel", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()

		o := observe.NewObserver()
		url := start(t, ctx, o)

		node, cluster := uuidpb.Generate(), uuidpb.Generate()
		_, _, first := connect(t, url, node, cluster)

		eventually(t, "the node to be observed", func() bool {
			_, open := connected(o, node)
			return open
		})

		_, _, second := connect(t, url, node, cluster)

		// The older tunnel's call ends, and the newer one's does not.
		if !ends(first) {
			t.Fatal("timed out waiting for the older tunnel's call to end")
		}
		select {
		case <-second:
			t.Fatal("the newer tunnel's call ended")
		default:
		}

		// There is still one node, and it is connected.
		if got := len(o.Nodes()); got != 1 {
			t.Fatalf("unexpected number of nodes: got %d, want 1", got)
		}
		if _, open := connected(o, node); !open {
			t.Fatal("the node is not connected")
		}
	})

	t.Run("it ends the tunnels when the context ends", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()

		o := observe.NewObserver()
		url := start(t, ctx, o)

		node := uuidpb.Generate()
		_, _, _ = connect(t, url, node, uuidpb.Generate())

		eventually(t, "the node to be observed", func() bool {
			_, open := connected(o, node)
			return open
		})

		cancel()

		eventually(t, "the node to be disconnected", func() bool {
			known, open := connected(o, node)
			return known && !open
		})
	})

	t.Run("it refuses a request that is not for a tunnel", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()

		server := httptest.NewServer(Handler(ctx, observe.NewObserver()))
		defer server.Close()

		res, err := http.Get(server.URL)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()

		if res.StatusCode < 400 || res.StatusCode >= 500 {
			t.Fatalf("unexpected status: %s", res.Status)
		}
	})
}
