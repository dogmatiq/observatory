package observe

import (
	"context"
	"net"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Clients are the clients of the APIs that one node of an engine serves.
//
// Code that calls a node depends on these interfaces, rather than on a gRPC
// connection, so that tests can replace them with the stubs that
// [github.com/dogmatiq/protobuf] provides.
type Clients struct {
	// Engine calls the node's engine API.
	Engine enginegrpc.EngineAPIClient

	// Metrics calls the node's metrics API. A node that doesn't report metrics
	// fails every call with the UNIMPLEMENTED status code.
	Metrics metricsgrpc.MetricsAPIClient

	conn   *grpc.ClientConn
	dialer NodeDialer
}

// NewClients returns Clients that call a node over connections dialed by d.
//
// The Clients own d. Closing them closes d.
//
// The connections are not encrypted, and the node is not verified.
func NewClients(d NodeDialer) (*Clients, error) {
	// The target is a placeholder. The "passthrough" scheme stops gRPC from
	// resolving it, and the dialer below ignores it, because d already knows
	// how to reach the node. gRPC does use the name as the authority of each
	// call.
	conn, err := grpc.NewClient(
		"passthrough:///node",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return d.Dial(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, err
	}

	return &Clients{
		Engine:  enginegrpc.NewEngineAPIClient(conn),
		Metrics: metricsgrpc.NewMetricsAPIClient(conn),
		conn:    conn,
		dialer:  d,
	}, nil
}

// Close ends every call that was made through c, closes the connections that it
// dialed, and closes the [NodeDialer]. It does nothing if c wasn't made by
// [NewClients].
func (c *Clients) Close() error {
	if c.conn == nil {
		return nil
	}
	err := c.conn.Close()
	c.dialer.Close()
	return err
}
