// Package tunnel accepts the tunnels that engines open to the Observatory.
//
// A cluster of an engine can usually make only outbound connections, so each
// of its nodes connects out to the Observatory, and the Observatory then calls
// the node's gRPC server through that connection. The tunnel is made by
// [github.com/dogmatiq/tenet]: the node is its client, and the Observatory is
// its server.
package tunnel

import (
	"context"
	"log/slog"
	"net"
	"net/http"

	"github.com/dogmatiq/tenet"

	"github.com/dogmatiq/observatory/internal/observe"
)

// Handler returns an [http.Handler] that accepts the tunnel of an engine's node
// from each request that it serves, and observes the node through the tunnel
// with o, until the tunnel ends or ctx ends.
//
// The tunnel carries no trust of its own. Anything that can reach the handler
// can open a tunnel, and what it sends is taken for what an engine reports. See
// [observe.NewClients].
func Handler(ctx context.Context, o *observe.Observer) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		d, err := tenet.Accept(w, r)
		if err != nil {
			// Accept has already written the response.
			return
		}

		clients, err := observe.NewClients(nodeDialer{d})
		if err != nil {
			d.Close()
			return
		}

		// The tunnel outlives this request, so the node is observed in its own
		// goroutine. Serve closes the clients, and with them the tunnel, when it
		// returns.
		go func() {
			err := o.Serve(ctx, clients)
			slog.Info("an engine's tunnel ended", "error", err)
		}()
	})
}

// nodeDialer is the [observe.NodeDialer] that dials the node at the other end
// of a tunnel.
type nodeDialer struct {
	*tenet.Dialer
}

func (d nodeDialer) Dial(ctx context.Context) (net.Conn, error) {
	return d.DialContext(ctx, Network, Address)
}
