// Command demo serves the Observatory's API with a simulated cluster, so that
// the user interface can be developed and tried without an engine.
//
// It listens on localhost:8080. Run the user interface's development server
// beside it, which proxies "/-/api" to this address.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/dogmatiq/observatory/internal/demo"
	"github.com/dogmatiq/observatory/internal/observe"
	"github.com/dogmatiq/observatory/internal/server"
	"github.com/dogmatiq/observatory/internal/tunnel"
)

const address = "localhost:8080"

var combinations = flag.Bool(
	"combinations",
	false,
	"also simulate a cluster for each combination of what the nodes report that the events tile and the queues tile are made from",
)

func main() {
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := run(ctx); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {
	observer := observe.NewObserver()
	recorder := observe.NewRecorder()

	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				recorder.Record(now, observer.Nodes())
			}
		}
	}()

	go func() {
		if err := demo.Run(ctx, observer, *combinations); err != nil {
			log.Print(err)
		}
	}()

	// An engine's node can open a tunnel here, to be observed as well as the
	// simulated nodes are.
	mux := http.NewServeMux()
	mux.Handle("/-/tunnel", tunnel.Handler(ctx, observer))
	mux.Handle("/", server.New(observer, recorder))

	srv := &http.Server{
		Addr:    address,
		Handler: mux,
	}

	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	log.Printf("serving the API at http://%s/-/api/clusters, and tunnels at ws://%s/-/tunnel", address, address)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}
