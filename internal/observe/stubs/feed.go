package stubs

import (
	"context"
	"io"
	"sync"

	"google.golang.org/grpc/status"
)

// Feed is a [ServerStreamingClientStub] whose messages are supplied by a test,
// one at a time, while the code under test is receiving them.
//
// A test returns a Feed from a stubbed method, then calls [Feed.Send] each time
// that it wants the node to report something:
//
//	feed := stubs.NewFeed[enginegrpc.WatchEngineResponse](ctx)
//	engine := &enginegrpc.EngineAPIClientStub{
//		WatchEngineFunc: func(
//			context.Context,
//			*enginegrpc.WatchEngineRequest,
//			...grpc.CallOption,
//		) (enginegrpc.EngineAPI_WatchEngineClient, error) {
//			return feed, nil
//		},
//	}
type Feed[T any] struct {
	ServerStreamingClientStub[T]

	ctx      context.Context
	messages chan *T
	ended    chan struct{}
	once     sync.Once
	err      error
}

// NewFeed returns a Feed for a call that ends when ctx ends. It should be the
// context that the call was made with.
func NewFeed[T any](ctx context.Context) *Feed[T] {
	f := &Feed[T]{
		ctx:      ctx,
		messages: make(chan *T),
		ended:    make(chan struct{}),
	}

	f.RecvFunc = f.recv
	f.ContextFunc = func() context.Context { return ctx }

	return f
}

// Send makes m the result of a call to Recv, and returns once Recv has
// received it. It returns an error if the call ends first.
func (f *Feed[T]) Send(m *T) error {
	select {
	case f.messages <- m:
		return nil
	case <-f.ended:
		return io.ErrClosedPipe
	case <-f.ctx.Done():
		return f.ctx.Err()
	}
}

// End ends the stream. Once Recv has received every message that was sent, it
// returns err. It returns [io.EOF], which is how a stream ends with an OK
// status, if err is nil. Only the first call to End has any effect.
func (f *Feed[T]) End(err error) {
	f.once.Do(func() {
		if err == nil {
			err = io.EOF
		}
		f.err = err
		close(f.ended)
	})
}

func (f *Feed[T]) recv() (*T, error) {
	select {
	case m := <-f.messages:
		return m, nil
	case <-f.ended:
		return nil, f.err
	case <-f.ctx.Done():
		return nil, status.FromContextError(f.ctx.Err()).Err()
	}
}
