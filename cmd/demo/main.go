// Command demo serves the Observatory's API with a simulated cluster, so that
// the user interface can be developed and tried without an engine.
//
// It listens on localhost:8080. Run the user interface's development server
// beside it, which proxies "/api" to this address.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/dogmatiq/observatory/internal/demo"
	"github.com/dogmatiq/observatory/internal/observe"
	"github.com/dogmatiq/observatory/internal/server"
)

const address = "localhost:8080"

func main() {
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
		if err := demo.Run(ctx, observer); err != nil {
			log.Print(err)
		}
	}()

	srv := &http.Server{
		Addr:    address,
		Handler: server.New(observer, recorder),
	}

	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	log.Printf("serving the API at http://%s/api/clusters", address)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}
