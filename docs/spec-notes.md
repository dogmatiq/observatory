# Notes for the spec and the tunnel spike

These notes hold research that the [v1 plan](.plans/2026-11-14-observatory-v1.md) relies on but does not record. They are
for whoever writes the `ObservationAPI` spec and runs the tunnel spike. The prototype's paths below are in the repository
named in the [prototype reference](prototype-reference.md).

Each fact is labelled with how it is known:

- **Checked**: the author read it in code.
- **Reported**: a research agent read it in a module cache or on GitHub on 14 November 2026, and nobody has checked it
  since.
- **Reasoning**: a conclusion drawn from other facts.
- **Belief**: nobody has checked it.

Check every item that is not **Checked** before building on it.

## What dogmatiq/protobuf contains

- **Reported.** The repository exists. Its description is "Protocol Buffers and gRPC definitions for Dogma, with generated
  code for Go and TypeScript". Its latest release is v0.8.0, from 13 November 2026.
- **Reported.** It uses protobuf edition 2024. Its proto package is `dogma.protobuf.v1`. The exception is `messaginggrpc`,
  whose proto package is `dogma.messaging.v1`.
- **Reported.** Its Go packages are `uuidpb`, `identitypb`, `envelopepb` and `messaginggrpc`. Each has generated Go and
  TypeScript.
- **Reported.** These packages were in enginekit until enginekit v0.29.0. Moving them changed the full message names and
  the `Any` type URLs, and left the binary encoding unchanged.
- **Reasoning.** Moving the `ObservationAPI` spec from runkit into dogmatiq/protobuf will rename its messages in the same
  way, because a message's full name includes its proto package.
- **Reported.** `messaginggrpc` defines the `EventStreamConsumerAPI` service, with the calls `WatchEvents` and
  `ReadEvents`.

## What the config messages are, and why they move

- **Reported.** enginekit's `config` package models an application and its handlers. It builds them from live Go values
  with `runtimeconfig.FromApplication`, which calls the application's `Configure` method. A search found no function that
  converts to or from `configpb`.
- **Reported.** `configpb` is in enginekit, at `protobuf/configpb/config.proto`:
  - An `Application` has an identity, a Go type name, its handlers, and a map from Go type name to message kind.
  - A `Handler` has an identity, a Go type name, a handler type, a map from Go type name to usage (produced, consumed or
    both), and whether it is disabled.
  - It has no message type IDs, no concurrency preference, and no direction for a route beyond produced or consumed.
- **Reported.** `configgrpc`, also in enginekit, defines the `ConfigAPI` service with one call, `ListApplications`. runkit
  uses neither `configgrpc` nor `configpb`.
- **Reasoning.** dogmatiq/protobuf cannot import enginekit's `configpb`, because enginekit depends on dogmatiq/protobuf.
  So the messages either move into dogmatiq/protobuf or the `ObservationAPI` defines its own. The plan moves them, with
  modifications, near release, and drops `configgrpc`.

## Why only the engine can show message content

- **Reported.** An envelope has a header and a body. The header has the causation and correlation IDs, a `Source`, and
  extensions. The `Source` has `site`, `application` and `handler` identities and an `instance_id`. The body has the
  message ID, an idempotency key, times, and a `Message`. A `Message` has a `type_id`, a `description` string and `data`.
- **Reported.** `data` is opaque bytes, and the proto file says there is no separate codec identifier.
- **Reasoning.** The encoding of `data` follows from `type_id`, so only code that has the application's Go types can decode
  it. The Observatory does not load application code, so decoding is the engine's job. The `description` is the one
  field in an envelope that is already text for a person.

## What runkit does today

- **Checked.** `WithListenAddress(addr, ...grpc.ServerOption)`, in `engineoption.go`, is the option through which an
  operator supplies credentials and interceptors for the engine's gRPC server. Its documentation says that the server is
  insecure unless credentials are supplied, and gives mutual TLS as the example. The plan therefore adds `WithGRPCServerOptions`
  and makes `WithListenAddress` take only an address.
- **Checked.** The gRPC server in `internal/grpcserver/server.go` registers only the `EventStreamConsumerAPI` service.
- **Reported.** The client of that service is in `internal/eventstream/source/remote.go`.
- **Checked, by a search that may have missed something.** Apart from the prototype and tests, no code in runkit sets the
  `site` identity in an envelope's `Source`. The plan's optional site option is therefore new engine work.
- **Reported.** Cluster heartbeats travel through PostgreSQL's `LISTEN` and `NOTIFY`. A notification can be lost, and it
  has a topic and no other data. runkit's constants are a 1 second interval and a 5 second timeout, in `engine.go`. The
  prototype keeps its own copy of the timeout.
- **Reported.** `internal/application` binds a database to one application identity.
- **Reasoning.** That binding is why the plan defines a cluster as the nodes that share one database.

## Inputs for the tunnel spike

All of this is **belief**. The spike checks each item and either confirms or drops it.

- The tunnel is a TLS connection that the engine dials. The side that accepts it, the Observatory, acts as the HTTP/2
  client on it, so the side that dials acts as the HTTP/2 server.
- In Go, the engine's gRPC server can serve a connection that the engine dialed, for example through a `net.Listener`
  that returns that one connection from `Accept`. The server then applies its own credentials to the connection.
- In Node, `http2.connect` accepts a `createConnection` option that supplies an existing socket, and `tls.connect` accepts
  an existing socket for the inner TLS handshake.
- The Connect library for Node probably passes those options through. It is unknown whether `@grpc/grpc-js` can pass them
  through.
- The alternative is SSH with a reverse port forward. In Go, the engine would use `golang.org/x/crypto/ssh`. In Node, the
  `ssh2` package implements an SSH server, which the Observatory would use. Neither runs an external program. The
  Observatory would still need an HTTP/2 client over the forwarded connection, so SSH helps only if its authentication is
  wanted for its own value.

## How the Observatory relates to dogmatiq/stories

[dogmatiq/stories](https://github.com/dogmatiq/stories) is a separate, private repository with a business-analyst-style
goal. Its only content besides the community health files is a brainstorm. The brainstorm describes narratives of what
happened, built from committed facts, in business language that avoids Dogma's own terms. The Observatory shows what an
engine is doing now, in Dogma's terms.

They are separate products. The plan allows the Observatory to read event streams over the tunnel later, and the same
`EventStreamConsumerAPI` service could serve stories if it ever needs event streams.

## Risks

- Observation runs continuously inside production engines. The plan gives it a budget, whose limits are not yet set, and
  makes the schema changes in the prototype's `docs/maintainers/inspector-schema-changes.md` part of the engine work.
- Reproducing the prototype's look exactly in TypeScript is a large piece of work and adds no new capability. It is
  accepted.
- The spec will be released before the pages for one instance, queue, stream or message exist. Those pages become
  ordinary calls through the tunnel, so adding them later adds calls to the `ObservationAPI` and does not change the
  existing ones.
