package observe_test

import (
	"testing"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	. "github.com/dogmatiq/observatory/internal/observe"
)

// preambleServer is an engine API that sends one preamble, and nothing else.
type preambleServer struct {
	enginegrpc.UnimplementedEngineAPIServer
	NodeID *uuidpb.UUID
}

func (s *preambleServer) WatchEngine(
	_ *enginegrpc.WatchEngineRequest,
	stream grpc.ServerStreamingServer[enginegrpc.WatchEngineResponse],
) error {
	return stream.Send(
		enginegrpc.WatchEngineResponse_builder{
			Preamble: enginegrpc.WatchEngineResponse_Preamble_builder{
				NodeId: s.NodeID,
			}.Build(),
		}.Build(),
	)
}

func TestClients(t *testing.T) {
	listener, dialer := InProcess()
	t.Cleanup(func() { dialer.Close() })

	nodeID := uuidpb.Generate()

	// The node serves the engine API, but not the metrics API.
	server := grpc.NewServer()
	enginegrpc.RegisterEngineAPIServer(server, &preambleServer{NodeID: nodeID})
	go server.Serve(listener)
	t.Cleanup(server.Stop)

	clients, err := NewClients(dialer)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { clients.Close() })

	t.Run("it calls the engine API", func(t *testing.T) {
		stream, err := clients.Engine.WatchEngine(
			t.Context(),
			&enginegrpc.WatchEngineRequest{},
		)
		if err != nil {
			t.Fatal(err)
		}

		res, err := stream.Recv()
		if err != nil {
			t.Fatal(err)
		}

		preamble, ok := res.TryGetPreamble()
		if !ok {
			t.Fatal("expected the first response to be a preamble")
		}

		if !preamble.GetNodeId().Equal(nodeID) {
			t.Fatalf(
				"unexpected node ID: got %s, want %s",
				preamble.GetNodeId(),
				nodeID,
			)
		}
	})

	t.Run("it fails with UNIMPLEMENTED when the node doesn't serve the metrics API", func(t *testing.T) {
		stream, err := clients.Metrics.WatchMetrics(
			t.Context(),
			&metricsgrpc.WatchMetricsRequest{},
		)
		if err == nil {
			// The failure of a streaming call arrives with its first receive.
			_, err = stream.Recv()
		}

		if got := status.Code(err); got != codes.Unimplemented {
			t.Fatalf("unexpected status code: got %s, want %s", got, codes.Unimplemented)
		}
	})
}
