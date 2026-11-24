package stubs_test

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	. "github.com/dogmatiq/observatory/internal/observe/stubs"
)

func TestFeed(t *testing.T) {
	t.Run("it is the stream of a stubbed call", func(t *testing.T) {
		ctx := t.Context()
		feed := NewFeed[enginegrpc.WatchEngineResponse](ctx)

		engine := &enginegrpc.EngineAPIClientStub{
			WatchEngineFunc: func(
				context.Context,
				*enginegrpc.WatchEngineRequest,
				...grpc.CallOption,
			) (enginegrpc.EngineAPI_WatchEngineClient, error) {
				return feed, nil
			},
		}

		stream, err := engine.WatchEngine(ctx, &enginegrpc.WatchEngineRequest{})
		if err != nil {
			t.Fatal(err)
		}

		nodeID := uuidpb.Generate()
		go feed.Send(
			enginegrpc.WatchEngineResponse_builder{
				Preamble: enginegrpc.WatchEngineResponse_Preamble_builder{
					Id: nodeID,
				}.Build(),
			}.Build(),
		)

		res, err := stream.Recv()
		if err != nil {
			t.Fatal(err)
		}

		if !res.GetPreamble().GetId().Equal(nodeID) {
			t.Fatalf("unexpected node ID: got %s, want %s", res.GetPreamble().GetId(), nodeID)
		}
	})

	t.Run("func Send()", func(t *testing.T) {
		t.Run("it delivers messages in the order that they are sent", func(t *testing.T) {
			feed := NewFeed[int](t.Context())

			go func() {
				for _, m := range []int{1, 2, 3} {
					feed.Send(&m)
				}
			}()

			for want := 1; want <= 3; want++ {
				got, err := feed.Recv()
				if err != nil {
					t.Fatal(err)
				}
				if *got != want {
					t.Fatalf("unexpected message: got %d, want %d", *got, want)
				}
			}
		})

		t.Run("when the call has ended", func(t *testing.T) {
			t.Run("it returns an error", func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				feed := NewFeed[int](ctx)
				cancel()

				m := 1
				if err := feed.Send(&m); !errors.Is(err, context.Canceled) {
					t.Fatalf("unexpected error: got %v, want %v", err, context.Canceled)
				}
			})
		})
	})

	t.Run("func End()", func(t *testing.T) {
		t.Run("when the error is nil", func(t *testing.T) {
			t.Run("it makes Recv return io.EOF", func(t *testing.T) {
				feed := NewFeed[int](t.Context())
				feed.End(nil)

				if _, err := feed.Recv(); err != io.EOF {
					t.Fatalf("unexpected error: got %v, want %v", err, io.EOF)
				}
			})
		})

		t.Run("when the error is not nil", func(t *testing.T) {
			t.Run("it makes Recv return that error", func(t *testing.T) {
				want := status.Error(codes.Unavailable, "the node is going away")
				feed := NewFeed[int](t.Context())
				feed.End(want)

				if _, err := feed.Recv(); err != want {
					t.Fatalf("unexpected error: got %v, want %v", err, want)
				}
			})
		})

		t.Run("it only has an effect the first time", func(t *testing.T) {
			feed := NewFeed[int](t.Context())
			feed.End(nil)
			feed.End(errors.New("too late"))

			if _, err := feed.Recv(); err != io.EOF {
				t.Fatalf("unexpected error: got %v, want %v", err, io.EOF)
			}
		})
	})

	t.Run("func Recv()", func(t *testing.T) {
		t.Run("when the call's context ends", func(t *testing.T) {
			t.Run("it returns the CANCELED status code", func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				feed := NewFeed[int](ctx)
				cancel()

				_, err := feed.Recv()
				if got := status.Code(err); got != codes.Canceled {
					t.Fatalf("unexpected status code: got %s, want %s", got, codes.Canceled)
				}
			})
		})
	})
}
