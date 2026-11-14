# Tunnel spike

This directory holds a throwaway program pair that checks whether a Node process can accept a TLS connection from a Go
program and then make gRPC calls to that Go program over the same connection. It is the first step of the
[Observatory v1 plan](../../docs/.plans/2026-11-14-observatory-v1.md).

- `go/` is the stand-in engine. It dials the Observatory over TLS, then serves gRPC on that connection, using mutual TLS.
  It serves the standard gRPC health service, which has one unary call and one server-streaming call.
- `node/` is the stand-in Observatory. It accepts the connection, then uses [Connect](https://connectrpc.com/) as a gRPC
  client on it.

Run `./run.sh`. It exits non-zero if the Node program fails. `node/health.binpb` is `node/health.proto` compiled with
`protoc --descriptor_set_out=health.binpb --include_imports health.proto`.

## Result

The plan's approach works: plain TLS with the HTTP/2 roles reversed. No SSH is needed.

- **Go side.** A `net.Listener` whose `Accept` returns the dialed connection once, then blocks until that connection
  closes, is enough for `grpc.Server.Serve`. The server applies its own `grpc.Creds` to the connection, so the inner TLS
  handshake and the outer one are independent.
- **Node side.** `createGrpcTransport` from `@connectrpc/connect-node` passes `nodeOptions.createConnection` through to
  `http2.connect`. That function calls `tls.connect({ socket })` on the accepted socket, so the inner TLS handshake runs
  inside the outer one.
- **Checked.** A unary call and a server-streaming call both work. Once, by hand, with the client certificate removed from the Node program, the call failed with a TLS
  "certificate required" alert, so the inner mutual TLS is really in effect.
- **`@grpc/grpc-js` is not usable for this.** Its client creates the HTTP/2 session itself, and its `createConnection` returns a socket
  that it made (`transport.js`). It has no public option to supply a socket.

## Not covered

- The transport's own reconnect. It reuses the one socket, so a new HTTP/2 session cannot be made after the connection
  drops. The Observatory must create a new transport for each accepted connection.
- Many concurrent calls, keepalive, and what each side sees when the other closes abruptly.
- The outer connection's verification of the Observatory's certificate by the engine. The spike configures it, but only
  the success path ran.
