package observe_test

import (
	"context"
	"errors"
	"net"
	"testing"

	. "github.com/dogmatiq/observatory/internal/observe"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
)

func TestInProcess(t *testing.T) {
	t.Run("it carries gRPC calls to the node", func(t *testing.T) {
		listener, dialer := InProcess()
		t.Cleanup(func() { dialer.Close() })

		server := grpc.NewServer()
		grpc_health_v1.RegisterHealthServer(server, health.NewServer())
		go server.Serve(listener)
		t.Cleanup(server.Stop)

		conn, err := grpc.NewClient(
			"passthrough:///node",
			grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
				return dialer.Dial(ctx)
			}),
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.Close() })

		res, err := grpc_health_v1.NewHealthClient(conn).Check(
			t.Context(),
			&grpc_health_v1.HealthCheckRequest{},
		)
		if err != nil {
			t.Fatal(err)
		}

		if res.GetStatus() != grpc_health_v1.HealthCheckResponse_SERVING {
			t.Fatalf("unexpected status: got %s, want SERVING", res.GetStatus())
		}
	})

	t.Run("func Dial()", func(t *testing.T) {
		t.Run("when ctx ends first", func(t *testing.T) {
			t.Run("it returns an error that wraps ctx.Err()", func(t *testing.T) {
				_, dialer := InProcess()
				t.Cleanup(func() { dialer.Close() })

				ctx, cancel := context.WithCancel(t.Context())
				cancel()

				// Nothing accepts on the listener, so the connection can't be
				// made before ctx ends.
				_, err := dialer.Dial(ctx)
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("unexpected error: got %v, want %v", err, context.Canceled)
				}
			})
		})
	})

	t.Run("func Err()", func(t *testing.T) {
		t.Run("it returns nil before the NodeDialer ends", func(t *testing.T) {
			_, dialer := InProcess()
			t.Cleanup(func() { dialer.Close() })

			if err := dialer.Err(); err != nil {
				t.Fatal(err)
			}
		})
	})

	t.Run("func Close()", func(t *testing.T) {
		t.Run("it ends the NodeDialer with net.ErrClosed", func(t *testing.T) {
			_, dialer := InProcess()

			if err := dialer.Close(); err != nil {
				t.Fatal(err)
			}

			assertEnded(t, dialer)

			if err := dialer.Err(); !errors.Is(err, net.ErrClosed) {
				t.Fatalf("unexpected error: got %v, want %v", err, net.ErrClosed)
			}
		})

		t.Run("it closes every connection that the NodeDialer dialed", func(t *testing.T) {
			listener, dialer := InProcess()
			client, server := dialAndAccept(t, listener, dialer)

			dialer.Close()

			if _, err := client.Read(make([]byte, 1)); err == nil {
				t.Fatal("expected the dialer's half of the connection to be closed")
			}

			if _, err := server.Read(make([]byte, 1)); err == nil {
				t.Fatal("expected the listener's half of the connection to be closed")
			}
		})

		t.Run("it can be called more than once", func(t *testing.T) {
			_, dialer := InProcess()

			dialer.Close()
			if err := dialer.Close(); err != nil {
				t.Fatal(err)
			}
		})
	})

	t.Run("when the listener is closed", func(t *testing.T) {
		t.Run("when no connections are open", func(t *testing.T) {
			t.Run("it ends the NodeDialer", func(t *testing.T) {
				listener, dialer := InProcess()

				listener.Close()

				assertEnded(t, dialer)

				if err := dialer.Err(); err == nil {
					t.Fatal("expected an error")
				}
			})
		})

		t.Run("when connections are open", func(t *testing.T) {
			t.Run("it keeps those connections open", func(t *testing.T) {
				listener, dialer := InProcess()
				t.Cleanup(func() { dialer.Close() })

				client, server := dialAndAccept(t, listener, dialer)

				listener.Close()

				go server.Write([]byte("x"))

				if _, err := client.Read(make([]byte, 1)); err != nil {
					t.Fatal(err)
				}

				select {
				case <-dialer.Done():
					t.Fatal("expected the NodeDialer not to end while a connection is open")
				default:
				}
			})

			t.Run("it fails new dials", func(t *testing.T) {
				listener, dialer := InProcess()
				t.Cleanup(func() { dialer.Close() })

				dialAndAccept(t, listener, dialer)

				listener.Close()

				if _, err := dialer.Dial(t.Context()); err == nil {
					t.Fatal("expected an error")
				}
			})

			t.Run("it ends the NodeDialer when the last connection closes", func(t *testing.T) {
				listener, dialer := InProcess()

				client, _ := dialAndAccept(t, listener, dialer)

				listener.Close()
				client.Close()

				assertEnded(t, dialer)
			})
		})
	})
}

// dialAndAccept dials a connection through dialer, accepts it on listener, and
// returns both halves.
func dialAndAccept(
	t *testing.T,
	listener net.Listener,
	dialer NodeDialer,
) (client, server net.Conn) {
	t.Helper()

	accepted := make(chan net.Conn, 1)
	go func() {
		conn, err := listener.Accept()
		if err == nil {
			accepted <- conn
		}
		close(accepted)
	}()

	client, err := dialer.Dial(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	server, ok := <-accepted
	if !ok {
		t.Fatal("expected the listener to accept the connection")
	}

	return client, server
}

// assertEnded fails the test if the channel that dialer.Done() returns isn't
// closed, or if dialer.Dial() succeeds.
func assertEnded(t *testing.T, dialer NodeDialer) {
	t.Helper()

	select {
	case <-dialer.Done():
	default:
		t.Fatal("expected the NodeDialer to have ended")
	}

	if _, err := dialer.Dial(t.Context()); err == nil {
		t.Fatal("expected Dial to fail after the NodeDialer ended")
	}
}
