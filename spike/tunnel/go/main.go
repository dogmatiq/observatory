// Command engine stands in for a Dogma engine in the tunnel spike.
//
// It dials the Observatory over TLS, then serves gRPC on that connection.
package main

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// oneConnListener is a net.Listener that yields a single, already-established
// connection from Accept and then blocks until the connection is closed.
type oneConnListener struct {
	conn net.Conn
	once sync.Once
	done chan struct{}
}

func newOneConnListener(c net.Conn) *oneConnListener {
	l := &oneConnListener{done: make(chan struct{})}
	l.conn = &notifyConn{Conn: c, closed: l.close}
	return l
}

func (l *oneConnListener) Accept() (net.Conn, error) {
	var c net.Conn
	l.once.Do(func() { c = l.conn })
	if c != nil {
		return c, nil
	}
	<-l.done
	return nil, net.ErrClosed
}

func (l *oneConnListener) close() {
	select {
	case <-l.done:
	default:
		close(l.done)
	}
}
func (l *oneConnListener) Close() error   { l.close(); return nil }
func (l *oneConnListener) Addr() net.Addr { return l.conn.LocalAddr() }

type notifyConn struct {
	net.Conn
	closed func()
}

func (c *notifyConn) Close() error { c.closed(); return c.Conn.Close() }

func main() {
	const (
		observatoryAddr = "localhost:7443"
		certsDir        = "certs"
	)

	trustedCAs := x509.NewCertPool()
	pem, err := os.ReadFile(certsDir + "/ca.pem")
	must(err)
	trustedCAs.AppendCertsFromPEM(pem)

	// Outer TLS: the engine is the client and verifies the Observatory.
	outer, err := tls.Dial("tcp", observatoryAddr, &tls.Config{RootCAs: trustedCAs, ServerName: "observatory.test"})
	must(err)
	log.Printf("engine: outer TLS established with %s", observatoryAddr)

	// Inner TLS: the gRPC server's own credentials, mutual TLS.
	cert, err := tls.LoadX509KeyPair(certsDir+"/engine.pem", certsDir+"/engine-key.pem")
	must(err)
	innerCreds := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientCAs:    trustedCAs,
		ClientAuth:   tls.RequireAndVerifyClientCert,
	})

	grpcServer := grpc.NewServer(grpc.Creds(innerCreds))
	healthServer := health.NewServer()
	healthpb.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("spike", healthpb.HealthCheckResponse_SERVING)

	// Alternate the status so that a client of the health service's streaming
	// Watch call receives a sequence of updates.
	go func() {
		for i := 0; ; i++ {
			time.Sleep(500 * time.Millisecond)
			s := healthpb.HealthCheckResponse_SERVING
			if i%2 == 0 {
				s = healthpb.HealthCheckResponse_NOT_SERVING
			}
			healthServer.SetServingStatus("spike", s)
		}
	}()

	err = grpcServer.Serve(newOneConnListener(outer))
	if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
		fmt.Println("engine: serve:", err)
	}
	log.Print("engine: connection ended")
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
