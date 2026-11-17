# Dogma Observatory v1

## Context

Dogma Observatory (also "Observatory") is a web app that shows what Dogma applications are doing. It is a Go backend
and a React frontend that depend only on a protobuf spec, not on any engine.

It replaces a prototype, the Go inspector. The prototype is a server-rendered website that reads an engine's PostgreSQL
schema directly and calls the application's own code. It lives only in the `inspector` branch of
[jmalloc/runkit](https://github.com/jmalloc/runkit), at commit `0f099ce`, and is not released from dogmatiq/runkit. The
facts about the prototype that this plan relies on are in [prototype-reference.md](../prototype-reference.md).

## Terms

These are the engine's terms. A person who is new to Dogma does not need them to use the Observatory.

- **Cluster**: the engine nodes that share one database.
- **Site**: the set of applications, or the clusters that run them, that are deployed to one place. It is the same thing
  as the `site` identity in a Dogma envelope.
- **Universe**: every site and cluster connected to one Observatory.

## Decisions

### Direction of the product
- The Observatory is an insight tool and not a monitoring tool. It should give a better understanding of what is going on
  than a fresh OpenTelemetry setup, with zero configuration as one of its main values: "I just deployed some clusters,
  what's up". Alerts and pages are the job of OpenTelemetry and of whatever infrastructure operators build around it.
  Rules, views and options are judged against this.

### Connection: the engine dials, the Observatory asks
- Clusters sit in separate networks that allow only outbound connections, so each engine is told where the single
  Observatory is, and dials it.
- The connection is a tunnel. The engine dials the Observatory, and then serves gRPC over the tunnel it dialed. The
  Observatory is the gRPC client through that tunnel. The network direction is engine to Observatory, and the RPC
  direction is Observatory to engine, so the Observatory makes ordinary calls and opens server-streaming watches.
- The tunnel is `dogmatiq/tenet`, a new Go library with nothing specific to Dogma or to any protocol, shared by engines,
  the Observatory and Stories. tenet depends on no gRPC library.
- tenet's terms: the **initiator** connects to the **acceptor** over a secure WebSocket. Inside that WebSocket, the
  **dialer** dials connections to the **listener**. The initiator is always the listener, and the acceptor is always the
  dialer, so an engine is an initiator and a listener, and the Observatory is an acceptor and a dialer. "Connect" is
  used only for the WebSocket, and "dial" only for the connections inside it.
- The initiator gets a `net.Listener`, and serves its gRPC server on it. For each WebSocket, the acceptor gets a tunnel
  whose `Dial(ctx)` opens a new `net.Conn` to the listener over the same WebSocket, and the Observatory makes its gRPC
  calls through it, with `grpc.WithContextDialer`. Many connections share one WebSocket, multiplexed with yamux, so
  grpc-go's own reconnects and retries work as designed while the WebSocket lives. yamux is an implementation detail,
  and nothing in tenet's API or documentation names it.
- The acceptor serves the WebSocket itself, or behind an HTTPS proxy that terminates TLS with its own certificate, as
  Stories does on Railway. Raw TLS and SSH are not used: a WebSocket covers every deployment that they would, and it
  passes through the HTTP proxies of networks that allow only outbound connections.
- The acceptor admits each initiator in its own HTTP handler, with whatever checks it uses for other requests, such as a
  token, basic auth, or mutual TLS where it terminates TLS itself. The handler then passes the request to tenet, which
  upgrades it and returns the tunnel in the same function. The tunnel doesn't depend on the request's context, so it
  lives on after the handler returns.
- The initiator connects with an `http.Client` and request headers that its application gives it, so redirects, proxies
  and TLS follow that client, as for any other HTTP request. tenet adds no rules of its own.
- Each side has two settings, both about liveness: an interval, which is how often it checks that the other side still
  answers, and a timeout, which is how long a check or a write may stall before the tunnel ends. They play the part of
  TCP keepalive, so a silent break ends the WebSocket on whichever side notices first. Everything else is fixed and
  documented as bounds, as the kernel's settings are for TCP: at most 256 connections waiting for the listener to accept
  them, and at most 256 KB buffered per connection in each direction. A connection beyond the listener's backlog is
  reset, as TCP resets one beyond its own backlog.
- tenet adds no limits on connections, and no timeout on dialing one. The listener limits what it accepts, and the
  dialer what it dials, as they would without a tunnel. A dead initiator is noticed by the liveness check, and a
  listener that stops accepting leaves the dialer to its own context and deadlines, as a TCP backlog does. `Dial`
  returns as soon as its context ends, and a cancelled dial leaves nothing waiting behind it, so a dialer that keeps
  retrying against a listener that never accepts can't pile up work inside the tunnel.
- Closing the initiator's listener behaves like closing any `net.Listener`: no new connections open, and the dialer's
  new dials fail at once, while existing connections are left to the application. The WebSocket ends after the last one
  closes. Grace and its deadline come from the server on top, such as `grpc.Server.GracefulStop`. Cancelling the
  initiator's context ends the WebSocket and every connection at once. The initiator connects again whenever its
  WebSocket ends, with backoff that its application chooses.
- When a WebSocket ends, every connection on it ends, pending dials fail, and later dials fail. The acceptor's tunnel
  signals this with `Done()`, and the acceptor can end a tunnel with `Close()`. Why a tunnel ended is reported as an
  error on both sides: from the tunnel, and from the listener's `Accept`. tenet doesn't log, just as Go's `net` package
  doesn't.
- tenet doesn't know who connected, or which WebSocket replaces which. The Observatory identifies each tunnel by the
  node ID in the preamble of `WatchEngine`. On a second tunnel from the same node, it uses the newer one, and drops the
  older one once its calls have ended.
- tenet's wire format, yamux frames inside WebSocket messages, isn't the one that Stories' Node baseline uses today.
  Stories moves to tenet with its Go backend, together with the engines that it talks to.
- The spike proved the reversed roles over plain TLS, with a Node process accepting. Stories has since run the same
  tunnel over a secure WebSocket in production, with its own TypeScript accepting side, which `dogmatiq/tenet` replaces
  once Stories' backend is in Go.
- Over the tunnel, the engine serves every gRPC service it has, including the event stream service, because the
  Observatory will read event streams in the future. It is the engine's one gRPC server, the same one that serves the
  listen address.
- The tunnel has two layers of TLS. On the outer connection, the engine verifies the certificate of whatever terminates
  the WebSocket's TLS, as an ordinary HTTPS client. On each connection inside the tunnel, the engine's gRPC server uses
  the same credentials as it does on its listen address. If those are mutual TLS, the Observatory must present a client
  certificate that the cluster accepts, so the Observatory still has to be given access to each cluster. Finer
  configuration can come later.
- One Observatory process in v1.

### Shape of the Observatory
- New repo, with the same broad architecture as Stories: a Go backend, and a React 19, TypeScript and Tailwind CSS 4
  frontend. The prototype's colors and spacing become Tailwind theme values, and the cluster view is compared with the
  prototype in screenshots.
- It builds against the protobuf spec, not against an engine. Tests replay responses that were captured from an engine
  or written by hand. A Go program that captures them may live in the repo if it is needed.
- One smoke test runs a real engine with the Observatory. It is managed entirely by the Observatory's CI. runkit has no
  awareness of the Observatory, only of the spec.
- Conformance of engines to the spec is not checked in the first release.
- No built-in login. Run it behind a proxy.
- The Observatory derives rates from the counters that engines send, and keeps its history in memory only.
- The app must be robust. When one component of a page fails, the rest of the page is still shown.

### Spec
- Developed in dogmatiq/protobuf, in the Go packages `enginegrpc` and `metricsgrpc`, whose Protocol Buffers packages are
  `dogma.engine.v1alpha1` and `dogma.metrics.v1alpha1`, in the way that Kubernetes marks its unstable APIs. Releases of
  dogmatiq/protobuf can then carry the spec while it is still changing, and the stable package is added when the spec is
  ready. Versioning is at API level within dogmatiq/protobuf.
- New `EngineAPI` and `MetricsAPI` services, hosted by each engine and called by the Observatory through the tunnel.
  Metrics are in a service and a package of their own, because the set of metrics is open-ended and a package name is
  part of the full name of every metric's message. An engine that doesn't report metrics doesn't serve `MetricsAPI`.
- The `configpb` messages are the model for describing an application. They are brought into dogmatiq/protobuf as their
  own Go package `configpb`, outside `enginegrpc`, and their Protocol Buffers package is `dogma.config.v1alpha1`.
  The `EngineAPI` serves them. `configgrpc` (the `ConfigAPI` service) is dropped. They are brought in unchanged,
  apart from the package name and corrections to comments. `configpb` today has no message type IDs, no route direction
  and no concurrency preference, and its keys are Go type names. Each change is made only when the Observatory has a
  genuine need for it.
- Each node sends its own node configuration, including its description of the application and any timings it uses.
  These may differ between the nodes of one cluster. The Observatory never assumes that a cluster has one configuration.
- Each `Sample` is one metric of one thing: the commands or the deadlines of one queue that are pending, that are due,
  that are failing, or that it has removed, the length of one event stream, or one of the metrics of one handler. The
  node chooses how often it measures each metric, and the spec promises that once it has sent a sample on a stream, it
  sends a new one each time the value changes, including to zero. The spec has no signal that a subject no longer
  exists, because no v1 view or rule needs one. The Observatory can't know that it has seen every queue, so it never
  treats the queues that it knows as the complete set.
- A heartbeat is one concept. When an engine heartbeats, it tells every relevant listener: its cluster, through the
  database notification it sends today, and the Observatory, through the `EngineAPI`. In v1 of the spec a node sends
  only its own heartbeats and does not relay heartbeats received from other nodes.
- A node that heartbeats may say how often it will send a heartbeat.
- Each node sends the workloads that it believes it owns, and the set of nodes that it believes are live.
- Each answer to a cluster-wide question carries a `revision`: opaque bytes, compared byte by byte, that put the
  `Sample`s of one cluster's nodes in order. The node chooses what it holds, such as a timestamp or a logical
  clock. The ordering is a best effort with no promise, and a revision doesn't give how much time has passed. The
  Observatory shows the answer with the greatest revision, and tolerates revisions that are out of order.
- The Observatory measures every duration, such as the backlog rule's 5 minutes and the time between counters for a
  rate, with its own clock, at the moment each answer arrives.
- Each `WatchMetrics` call starts with a preamble that holds the node and cluster IDs, the node's own copy of the
  application and the metrics that the engine supports, so that no call depends on another reaching the same node. The
  Observatory interprets each stream's handler metrics with that stream's application. Each supported metric has a
  reach, and its position in the list is the number that its samples give for the call, in place of the full name of its
  message. When a metric's reach is the cluster, any node's samples of it describe the whole cluster, and the
  Observatory reads one node. When it is the node, each node's samples describe only the work that node owns, and the
  Observatory reads every node, which it must reach directly, and combines their samples. A part of the cluster that no
  node can read is missing, and the membership rule shows why.
- Dogma doesn't promise that an engine has nodes or clusters, so the spec defines them as its own model: a node is one
  process, and a cluster is the nodes that share the work of one application between them. An engine that runs as one
  process reports a cluster of one node. The spec never names an engine or the Observatory.
- An engine says what it supports in the simplest way. Every node serves `EngineAPI`, and a node that reports no metrics
  doesn't serve `MetricsAPI`, so a call to it ends with `UNIMPLEMENTED`. A node's metrics preamble lists the metrics
  that it reports, each with its reach. A metric that the Observatory doesn't know has no meaning to it, which lets an
  engine add metrics of its own. A metric that the preamble doesn't list is one that the engine doesn't support, and the
  Observatory hides its section. A richer declaration of what an engine supports is not designed for now.
- `EngineAPI.WatchEngine` sends a preamble once (the node and cluster IDs, the site, a description of the node for
  people, the application, and the heartbeat interval and the heartbeat timeout if the node has them, none of which
  change during the call), then `LiveNodes` (the nodes it believes are live) and `Workloads` (the workloads it believes
  it owns), each whenever it changes, and its heartbeats. `MetricsAPI.WatchMetrics` sends metrics that the node measures
  from the state that it can see. A node that can't read that state at all ends `WatchMetrics` with `UNAVAILABLE`, which
  is the Observatory's signal to ask another node for the metrics whose reach is the cluster.
- The preamble holds the node's heartbeat interval, and the timeout that the node applies to the heartbeats of the nodes
  of its cluster, each only if the node has one. Each heartbeat carries the node's own clock reading from when it was
  sent. A heartbeat may also say when it expires, as a time by that clock or as a length of time, for an engine whose
  nodes say when their own heartbeats expire, which is where runkit is heading. A node is reporting while each heartbeat
  arrives before the one before it expires. When its heartbeats don't say when they expire, it is reporting while each
  arrives within the shortest heartbeat timeout among the nodes of its cluster that the Observatory has a preamble from.
  So the Observatory needs no margin of its own. A node that doesn't heartbeat is reporting while its `WatchEngine` call
  is open.
- Each metric is read on its own, and a node sends its `Sample` when it chooses. A series is the samples of one metric
  for one subject. A node that can't measure a metric that it lists ends the `WatchMetrics` call with `UNAVAILABLE`, and
  the Observatory asks another node for the metrics whose reach is the cluster. The message of the status is for people
  and must hold no secrets. When a call ends, the Observatory discards its values, and shows a series again once the
  next call sends a sample of it, so it never takes a value from an ended call for a current one. A node that is over
  the observation budget measures less often, and sends no signal, because the engine is responsible for how often
  metrics arrive.
- A counter's value is comparable only with values of the same counter from the same call, so the Observatory derives
  rates only within one call. Event stream lengths are not counters, and are comparable across calls and nodes.
- The spec carries only the metrics that the cluster view and the health rules use. A handler's pending events are one
  total across the cluster's own event streams, not a checkpoint per stream, and a workload is only its key, with a
  description for people. The prototype's other metrics are added, compatibly, when a view needs them.
- Every count is exact. A metric that an engine can't count exactly within its budget is one that it doesn't support,
  and doesn't list in the preamble. The prototype's counts that stop at a limit and say "at least" are not carried over.
- The prototype's active aggregate instances, which had recorded an event within a window, are replaced by the aggregate
  instances that a node holds in memory, and the spec has the same metric for process instances.
- The Observatory relies only on what the spec promises. Where the Observatory and an engine come to rely on anything
  more, the spec is amended to promise it, or the Observatory stops relying on it.

### Engine (runkit)
- New option that takes a plain Observatory address. Without the option, an engine does not dial. The engine verifies the
  Observatory's certificate against the system's trusted roots. The site identity is a separate, optional option.
- New option `WithGRPCServerOptions`, which sets the options of the engine's gRPC server, however a client reaches it.
  `WithListenAddress` then takes only an address, which is a breaking change. The options are not given per route,
  because one server serves both the listen address and the tunnel.
- The Observatory picks the node that answers cluster-wide questions: it asks one connected node, and moves to another
  if that one fails. The engine chooses no node. Every node answers questions about itself.
- The engine does everything the prototype did that needs the application or the database: the owners of workloads, the
  application's config, and database statistics. It serves counters and gauges, not rates.
- The engine measures once however many watches are open, and chooses when to send. When it is over the observation
  budget it measures less often.
- runkit doesn't hold aggregate or process instances in memory yet, so it doesn't support the metrics of in-memory
  instances until it does, with locality from rendezvous hashing and a cache of instances.
- On the first measurement of a call, runkit sends a sample of every series, and afterwards only the series whose value
  changed. An empty queue reports zero, because runkit can't tell an empty queue from a removed one.
- Within one call, the engine never gives a sample a lower `revision` than its earlier samples of the same thing, even
  if the system time is changed. Encoding `time.Now()` is not enough, because encoding a `time.Time` drops its
  monotonic reading. The engine takes the wall-clock time once when it starts, and sends that time plus the monotonic
  time elapsed since, from `time.Since`. Clamping each value to the last one sent also works. Neither holds across a
  restart, so the engine keeps this only within one call.
- runkit counts the aggregate instances per event stream and the unhandled events of each handler exactly only through
  counter tables kept by triggers: one row per handler and stream for instances, one row per stream and event type for
  appended events, and a count of handled events beside each checkpoint. Their cost to the write path is measured
  against the observation budget first. If it doesn't fit, runkit doesn't support those two metrics in v1, and the
  handler card hides them. runkit counts the process instances bound to each queue through a partial index of the
  instances in progress.
- runkit counts the commands and the deadlines that it removes from each queue, each kind separately. The prototype's
  count of rows deleted from `messagequeue.messages` can't tell the queues or the kinds apart, so how runkit counts them
  is open. A cluster has tens of queues, spread across its nodes, so the number of counters on each node is small, and
  the question is only where they live: in memory on each node, which makes the counters node-scoped and restart from
  zero with the node, or in counter rows kept by triggers, which adds contention to the write path.
- Observation has a stated budget for what it may cost a production engine. The schema, index and signal changes
  listed in the prototype's `docs/maintainers/inspector-schema-changes.md` are part of the engine work, because the
  engine now runs these queries continuously.
- A cluster's identity is an ID that the engine stores in the database. Every node of the cluster reads it and sends it,
  so two clusters of one application in one site stay separate.

### Tree, and what v1 includes
- Tree: universe, site (optional), cluster, handlers. A cluster with no site is a direct child of the universe, so an
  operator without multi-site deployments never meets the site metaphor.
- v1 has dashboard-type granularity at four levels: universe, site, cluster and handler. The handler level is the
  handler card as it is on the prototype's overview, not a page of its own.
- The cluster view MUST look exactly like the prototype's overview page, except where another decision in this plan
  makes that impossible, or where this plan explicitly adds something to it. Those places are recorded below. An
  addition matches the prototype's style, colors, layout and behavior. The exact look is the starting point. Its
  shortcomings are addressed after it matches, and the work then moves up to the site and universe levels.
- v1 does not drill down to individual things, as the prototype did: no pages for a handler instance, a queue, an event
  stream or a message.
- The three views:
  - **Universe view**: the default page, across all sites, showing the health of the whole ecosystem. There is wide
    latitude for a creative "hero page" here. It may also be just a summarized view of the others.
  - **Site view**: all clusters of one site.
  - **Cluster view**: the prototype's overview, exactly, including its handler cards.
- Scale to design for: about 100 clusters per site and 10 sites.

### Health
- The Observatory decides health from facts that the engines send, by fixed rules. Engines send facts only.
- The Observatory defines no rule that depends on configuration that it does not know. It can be told node configuration
  by each node, but the nodes of one cluster may differ.
- v1 has only rules for what is clearly already a problem:
  - **Failed deliveries**: a queue holds a message with a failure streak.
  - **Backlog**: a queue holds messages that are due, and the number of them has not fallen within 5 minutes, measured
    by the Observatory's own clock. The rule is defined by time because the engine, not the Observatory, is responsible
    for how often metrics arrive.
  - **Membership**: each node sends the set of nodes that it believes are live. The members of a cluster are all the
    nodes in any of those sets. A cluster is unhealthy when any member is not reporting. A node is reporting as the Spec
    section defines it, from its heartbeats or, if it doesn't heartbeat, from its open `WatchEngine` call.
- These rules will mark a cluster as unhealthy during a deploy, and a queue during a long rise in traffic. That is
  accepted for v1, because a deploy and a rise in traffic are moments when an operator wants to look. The rules can be
  tuned later.
- A cluster is forgotten automatically after 3 days in which none of its nodes reported. The UI also has a "remove"
  action.
- How a flagged queue or node is shown is not decided at this level.

## Impact on what the prototype does

| Prototype capability | Fate |
|---|---|
| Overview page | Kept exactly as it looks, as the cluster view. |
| Live nodes and heartbeats (lossy Postgres NOTIFY) | Each node sends its own heartbeats to the Observatory as well as to its cluster. |
| Owners of workloads | Each node sends the workloads that it believes it owns. |
| Handler cards, backlogs, bindings, checkpoints | Same metrics. Their SQL and application calls move from the prototype into runkit. |
| Messages removed per minute (`pg_stat_user_tables`) | The engine counts the commands and the deadlines that it removes from each queue, and sends each counter. The Observatory adds them and derives the rate. |
| Events per minute, sparklines | Derived in the Observatory from successive counters. |
| Handler, queues, streams and cluster-nodes pages | Not in v1. The handler card on the cluster view is the handler level. |
| Message content, aggregate replay, and pages for one instance, queue, stream or message | After v1, as ordinary calls through the tunnel. |
| Works against a stopped cluster | Dropped. |
| SELECT-only database user | Dropped. The engine holds the only database access. |
| Server-rendered Go pages, htmx, SSE | Re-implemented in React and Tailwind to give the same look. |
| Prototype linked into the application | Dropped. The Observatory never loads application code. |
| Pointing the prototype at a cluster without touching it | Dropped. Each engine must be told where the Observatory is. |

## Visible differences from the prototype's overview

The cluster view must look exactly like the prototype's overview, so every place where it can't, and every addition that this plan makes to it, is recorded here. Keep
this list up to date as the plan evolves: add each new difference when it is found, and remove one that no longer applies.

- The heartbeat chart shows no heartbeats for a node that isn't connected to the Observatory. The prototype received
  every node's heartbeats from the database.
- The three tiles and the handler cards are links in the prototype, to the streams, queues, cluster-nodes and handler
  pages. Those pages are not in v1.
- The prototype's navigation bar links to the streams, queues, cluster-nodes and per-type handler pages, which are not in
  v1.
- By explicit request, each handler card also shows the commands or deadlines that the handler handled per minute, and
  for a process handler the deadlines canceled per minute, derived from per-handler totals. The prototype had only the
  cluster's messages removed per minute, which mixes successes and cancellations. The Observatory shows those
  per-handler rates when the engine supports their metrics, and the commands and deadlines removed per minute, added
  together, when it supports only those.
- The handler card of an aggregate handler doesn't show active instances. The spec replaces them with the instances
  that a node holds in memory, which runkit doesn't support yet.
- A section of the cluster view whose metric the engine doesn't list in its preamble is hidden. In v1 that may include
  the aggregate instances per event stream and the unhandled events of each handler, if runkit can't count them within
  its budget.
- Counts are exact and have no limit, so the Observatory never shows the prototype's "at least" form with a plus sign.
- The prototype shows "Reading the database for the first time" before its first reading. The Observatory doesn't read a
  database.

## Delivery order

Tick each item when it is done, and write the pull request or commit that did it beside it.

- [x] **Tunnel spike** (see [spike/tunnel/README.md](../../spike/tunnel/README.md)): prove that a Node process can
  accept a connection from a Go engine and act as the gRPC client on it, over plain TLS. Delete `spike/tunnel` when
  `dogmatiq/tenet` exists.
- [x] **Spec, in dogmatiq/protobuf**: documenting the meaning, unit and limits of each field, because the spec is the
  only contract.
  - [x] The `configpb` messages in `configpb`, at `v1alpha1`
    ([dogmatiq/protobuf#35](https://github.com/dogmatiq/protobuf/pull/35)).
  - [x] The `MetricsAPI` `.proto` files in `metricsgrpc`, at `v1alpha1`
    ([dogmatiq/protobuf@0d8aa19](https://github.com/dogmatiq/protobuf/commit/0d8aa19),
    [dogmatiq/protobuf@2fc5063](https://github.com/dogmatiq/protobuf/commit/2fc5063)).
  - [x] The `EngineAPI` `.proto` files in `enginegrpc`, at `v1alpha1`
    ([dogmatiq/protobuf@99574d8](https://github.com/dogmatiq/protobuf/commit/99574d8),
    [dogmatiq/protobuf@f71b447](https://github.com/dogmatiq/protobuf/commit/f71b447)).
- [ ] **Tunnel, in dogmatiq/tenet**: the contract, the initiator's side and the acceptor's side, in Go, over a secure
  WebSocket, with many connections over each WebSocket. Its tests run each side against the other, and cover: two
  connections with one stalled, a dial cancelled while it is blocked, connections closed and dialed again repeatedly on
  one WebSocket, a silent loss of the network noticed by each side, shutdown during concurrent dials, a full backlog,
  and abrupt close by either side. tenet itself mentions no protocol that runs over it.
- [ ] **Engine side, in dogmatiq/runkit**: the cluster ID, the Observatory option, the site option and
  `WithGRPCServerOptions`, dialing the Observatory through `dogmatiq/tenet`, sending heartbeats to the Observatory, the
  description of the application, the port of the prototype's SQL and derivation code from its `observe` package, the
  observation budget and the schema changes.
- [ ] **Observatory repo**: the Go backend, using the `v1alpha1` packages of dogmatiq/protobuf, accepting engines
  through `dogmatiq/tenet`, what it holds in memory, and the health rules. Then the cluster view, matching the
  prototype's overview exactly, then its shortcomings, then the site view, then the universe view. A check that React
  and Tailwind can match the prototype's look comes before the views. The smoke test belongs here.
- [ ] **Near release, dogmatiq/protobuf**: the spec is added as a stable package, and runkit and the Observatory switch to
  it.

## Open
- The observation budget's actual limits. They are set before the prototype's queries are ported.
- Whether `WatchMetrics` should signal a partial failure, so that one unreadable metric doesn't end every metric on the
  call. In v1 it does, and a persistent failure of one metric ends every call, unless the node leaves that metric out of
  its preamble. The design to add when a view needs it is an `Outage` message: one cause, with an id chosen by the node,
  the text for people, and scopes that each list some metrics and some subjects, or every subject. A later outage with
  the same id replaces the earlier one, and one with no scopes has ended. While an outage affects a series, its samples
  may be late or not come, and before it stops affecting a series the node sends a sample for it if its value changed. A
  node should send an outage only for series that it has already sent a sample for. An outage may also say whether the
  series are stalled or only delayed. Observatory would then list current outages by cause, and show a stalled series
  differently from one that may be out of date.
- Whether `WatchMetrics` takes a filter of the metrics that the client wants, so that an engine doesn't measure the
  rest. It is added only when an engine defines metrics that the Observatory doesn't use, or when measuring every metric
  costs too much. A server that doesn't know the filter sends every metric, so adding it is safe.
- The names in tenet's API. The proposal is `Accept` for the function that the acceptor's handler calls, `Tunnel` for
  what it returns, and `Dial(ctx context.Context) (net.Conn, error)` for its dial method, with no network or address
  because there is only one listener to reach.
- How tenet's initiator backs off between attempts to connect again, and how its application sets it.
- The path of tenet's WebSocket, and whether it names a subprotocol.
- Which commits on the prototype branch go upstream to dogmatiq/runkit, other than those about the inspector.
