// Package observe connects to the nodes of Dogma engines, and watches what they
// report.
//
// A node is one running process of an engine, as defined by the engine API in
// [github.com/dogmatiq/protobuf/enginegrpc].
package observe

import (
	"context"
	"net"
)

// NodeDialer dials connections to one node of an engine. The gRPC calls to the
// node are made over these connections.
//
// A NodeDialer ends when its Close method is called, or when the node can no
// longer be reached through it, such as when the tunnel to the node breaks.
// Once it has ended, every connection that it dialed is closed, and every call
// to its Dial method fails.
type NodeDialer interface {
	// Dial opens a new connection to the node.
	//
	// If ctx ends first, Dial returns an error that wraps ctx.Err().
	Dial(ctx context.Context) (net.Conn, error)

	// Done returns a channel that is closed when the NodeDialer ends.
	Done() <-chan struct{}

	// Err returns nil until the channel that Done returns is closed. Then it
	// returns why the NodeDialer ended. It returns [net.ErrClosed] if Close
	// ended it.
	Err() error

	// Close ends the NodeDialer. It may be called more than once.
	Close() error
}
