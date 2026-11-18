package stubs

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// ServerStreamingClientStub is a test implementation of
// [grpc.ServerStreamingClient].
//
// It is the stream that a call to a server-streaming method returns, such as
// the [github.com/dogmatiq/protobuf/enginegrpc.EngineAPIClientStub] returns
// from its WatchEngine method.
type ServerStreamingClientStub[T any] struct {
	// RecvFunc is a function that implements the Recv method.
	RecvFunc func() (*T, error)

	// ContextFunc is a function that implements the Context method.
	ContextFunc func() context.Context

	// HeaderFunc is a function that implements the Header method.
	HeaderFunc func() (metadata.MD, error)

	// TrailerFunc is a function that implements the Trailer method.
	TrailerFunc func() metadata.MD

	// CloseSendFunc is a function that implements the CloseSend method.
	CloseSendFunc func() error

	// SendMsgFunc is a function that implements the SendMsg method.
	SendMsgFunc func(m any) error

	// RecvMsgFunc is a function that implements the RecvMsg method.
	RecvMsgFunc func(m any) error
}

var _ grpc.ServerStreamingClient[struct{}] = &ServerStreamingClientStub[struct{}]{}

// Recv calls s.RecvFunc if it is non-nil. Otherwise, it returns an error.
func (s *ServerStreamingClientStub[T]) Recv() (*T, error) {
	if s.RecvFunc == nil {
		return nil, status.Error(codes.Unimplemented, "method Recv not implemented")
	}
	return s.RecvFunc()
}

// Context calls s.ContextFunc if it is non-nil. Otherwise, it returns
// [context.Background].
func (s *ServerStreamingClientStub[T]) Context() context.Context {
	if s.ContextFunc == nil {
		return context.Background()
	}
	return s.ContextFunc()
}

// Header calls s.HeaderFunc if it is non-nil. Otherwise, it returns no
// metadata.
func (s *ServerStreamingClientStub[T]) Header() (metadata.MD, error) {
	if s.HeaderFunc == nil {
		return nil, nil
	}
	return s.HeaderFunc()
}

// Trailer calls s.TrailerFunc if it is non-nil. Otherwise, it returns no
// metadata.
func (s *ServerStreamingClientStub[T]) Trailer() metadata.MD {
	if s.TrailerFunc == nil {
		return nil
	}
	return s.TrailerFunc()
}

// CloseSend calls s.CloseSendFunc if it is non-nil. Otherwise, it does
// nothing.
func (s *ServerStreamingClientStub[T]) CloseSend() error {
	if s.CloseSendFunc == nil {
		return nil
	}
	return s.CloseSendFunc()
}

// SendMsg calls s.SendMsgFunc if it is non-nil. Otherwise, it returns an
// error.
func (s *ServerStreamingClientStub[T]) SendMsg(m any) error {
	if s.SendMsgFunc == nil {
		return status.Error(codes.Unimplemented, "method SendMsg not implemented")
	}
	return s.SendMsgFunc(m)
}

// RecvMsg calls s.RecvMsgFunc if it is non-nil. Otherwise, it returns an
// error.
func (s *ServerStreamingClientStub[T]) RecvMsg(m any) error {
	if s.RecvMsgFunc == nil {
		return status.Error(codes.Unimplemented, "method RecvMsg not implemented")
	}
	return s.RecvMsgFunc(m)
}
