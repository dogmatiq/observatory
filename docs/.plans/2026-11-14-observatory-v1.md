# Dogma Observatory v1

## Context

Dogma Observatory (also "Observatory") is a web app that shows what Dogma applications are doing. It is a Go backend
and a React frontend that depend only on a protobuf spec, not on any engine.

It replaces a prototype, the Go inspector. The prototype is a server-rendered website that reads an engine's PostgreSQL
schema directly and calls the application's own code. It lives only in the `inspector` branch of
[jmalloc/runkit](https://github.com/jmalloc/runkit), at commit `0f099ce`, and is not released from dogmatiq/runkit. The
facts about the prototype that this plan relies on are in [prototype-reference.md](../prototype-reference.md).

## Terms

These are the terms that this plan uses. A person who is new to Dogma does not need them to use the Observatory.

- **Engine**: the software that an application runs on, which its developer chooses and configures. What an engine can
  do, such as whether it clusters, whether it divides its work into workloads and which metrics it reports, is said of
  the engine.
- **Node**: one running process of an engine, as a member of its cluster. What has an ID, a heartbeat, a state of being
  online or offline, or workloads that it owns, is a node.
- **Cluster**: the nodes that share the work of one application between them.
- **Contact**: a node is in contact while its `WatchEngine` call is open and, if it heartbeats, while each heartbeat
  arrives in time, as the Spec section defines it. The code calls this reporting. The page says "contact", and not
  "reporting", which reads as sending samples, and not "heartbeats", because not every engine heartbeats. Losing contact
  doesn't show that a node has stopped, so the page says that whether the application is working is
  unknown, and doesn't say why.
- The page says "node" only where there is a cluster. An engine that doesn't cluster has no nodes: its one process is
  "the engine", with the engine's ID and heartbeat, and the engine is online or offline. The spec says the same: an
  engine runs as a cluster or as a single instance, and only the instances of a cluster are nodes. The Observatory's
  backend keeps an engine that doesn't cluster as the only node of a cluster whose ID is the engine's own ID, so that it
  has a page, as a cluster does.
- **Site**: the set of applications, or the clusters that run them, that are deployed to one place. It is the same thing
  as the `site` identity in a Dogma envelope.
- **Universe**: every site and cluster connected to one Observatory.
- **Vitals**: the headline figures across the top of a page, such as the events per minute and the queues of a cluster.
  The vitals of a page are about the whole of what the page is for.
- **Breakdown**: what a page shows below its vitals, an entry for each part of what the vitals add up, such as a card for
  each handler of a cluster. It is the layer below the page's entity only when that layer is what is worth looking at,
  which is not always so: the breakdown of a cluster is its handlers, not its nodes.

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
- The tunnel is `dogmatiq/tenet`, a separate Go library with [its own
  plan](https://github.com/dogmatiq/tenet/blob/main/docs/.plans/2026-11-17-tenet-v1.md).
- The engine serves its gRPC server on tenet's listener. The Observatory accepts each engine's WebSocket in its own HTTP
  handler, gets a tunnel from tenet, and makes its gRPC calls through the tunnel's `Dial`, with
  `grpc.WithContextDialer`.
- tenet may let a dial carry an address, so that one tunnel can serve several destinations. If it does, `NodeDialer`
  takes the address in `Dial` too, and the placeholder target in `NewClients` is replaced by it.
- tenet doesn't know who connected. The Observatory identifies each tunnel by the node ID in the preamble of
  `WatchEngine`. On a second tunnel from the same node, it uses the newer one, and drops the older one once its calls
  have ended.
- The spike proved the reversed roles over plain TLS, with a Node process accepting. Stories has since run the same
  tunnel over a secure WebSocket in production, with its own TypeScript accepting side and one connection per WebSocket.
- tenet's wire format, many connections per WebSocket, isn't the one that Stories' Node baseline uses today. Stories
  moves to tenet with its Go backend, together with the engines that it talks to.
- Over the tunnel, the engine serves every gRPC service it has, including the event stream service, because the
  Observatory will read event streams in the future. It is the engine's one gRPC server, the same one that serves the
  listen address.
- The tunnel has two layers of TLS. On the outer connection, the engine verifies the certificate of whatever terminates
  the WebSocket's TLS, as an ordinary HTTPS client. On each connection inside the tunnel, the engine's gRPC server uses
  the same credentials as it does on its listen address.
- The Observatory holds no sensitive data, so it accepts a WebSocket from anyone, and the tunnel carries no trust of its
  own. Trust comes from the gRPC connections inside the tunnel, which must eventually use mutual TLS: the engine accepts
  only an Observatory whose client certificate the cluster trusts, and the Observatory accepts only an engine whose
  server certificate it trusts. Until then, a client that isn't an engine can open a tunnel and send invented data.
- The Observatory picks the node that answers cluster-wide questions: it calls `WatchClusterMetrics` on one connected
  node of a cluster at a time, and calls another at once if that call ends. It calls `WatchNodeMetrics` on every node,
  because the nodes' own metrics need every node. The engine chooses no node. Every node answers questions about itself.
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
- A page gets its data from a stream of server-sent events, as the prototype's page learned of heartbeats, and the
  stream only says what changes. The server aggregates: a page is a set of components, each with a key and props, and
  the stream sends a component's whole new props only when they differ from what that page was last sent, appends the
  new points of a chart, and tells the page of each heartbeat as it arrives. Every connection starts with a burst of
  everything, ending in `synced`, as a metrics call starts with a sample of every series, and a page that reconnects
  replaces its state with the burst. A rate is sent as times per second and rounded to three significant figures, and the
  page decides how to show it. The names are kept readable and short, and shortened further only where a measurement
  says that they matter. The protocol is documented in the package comment of `internal/server`. The cluster list is
  asked for again every second, which is a stopgap until the universe view.

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
  node chooses how often it measures each metric, and the spec promises that it sends a new sample each time the value
  differs from the last one that it sent on the stream, including when it is zero. A `Tombstone` says that the node has
  stopped reporting one metric of one subject, such as the current count of work that has moved to another node, and the
  Observatory discards the sample that it has of it. The Observatory can't know that it has seen every queue, so it never
  treats the queues that it knows as the complete set, unless the engine says that it uses one queue.
- A heartbeat is one concept. When an engine heartbeats, it tells every relevant listener: its cluster, through the
  database notification it sends today, and the Observatory, through the `EngineAPI`. In v1 of the spec a node sends
  only its own heartbeats and does not relay heartbeats received from other nodes.
- Each node sends the workloads that it believes it owns, and the set of nodes that it believes are live.
- Each `Sample` and `Tombstone` carries a `revision`: opaque bytes, compared byte by byte, that put the messages of one
  subject from one node and one method in order. The node chooses what it holds, such as a timestamp or a logical
  clock. Revisions from different nodes are not comparable, and a revision doesn't give how much time has passed. The
  Observatory keeps the message with the greatest revision within each call, and tolerates revisions that are out of
  order.
- The Observatory measures every duration, such as the backlog rule's 5 minutes and the time between counters for a
  rate, with its own clock, at the moment each answer arrives.
- `MetricsAPI` has two methods. `WatchNodeMetrics` reports the metrics of the node that serves the call, which are only
  its own share of the work if the engine runs as a cluster, and all of the engine's metrics if it doesn't.
  `WatchClusterMetrics` reports the metrics of the whole cluster, and any node can serve it. An engine that doesn't run
  as a cluster fails it with `UNIMPLEMENTED`, and the Observatory calls it only on a node whose engine runs as a cluster.
  Each call starts with a preamble that holds the engine's ID and, for a cluster, the cluster's ID, the node's own copy
  of the application, and the names of the metrics that the call reports, so that no call depends on another reaching
  the same node. The Observatory interprets each stream's handler metrics with that stream's application. A metric's
  position in the list is the number that its samples give for the call, in place of the full name of its message. A
  metric that the call to `WatchClusterMetrics` reports is read from that call alone. Every other metric is read from
  the calls to `WatchNodeMetrics` of every node, which the Observatory must reach directly, and combined as the spec says
  for the metric: the sum of a `current_count` or a `cumulative_count`, with a node that sent a `Tombstone` adding
  nothing, and the greatest `watermark` of an event stream. A metric that the spec gives no rule for combining, such as
  the `gauge` of `HandlerEventStreamLag`, is read only from `WatchClusterMetrics`, or from the one node of an engine that
  doesn't run as a cluster. A part of the cluster that no node can read is missing, and the membership rule shows why.
- Dogma doesn't promise that an engine has nodes or clusters, so the spec defines them as its own model: an engine may
  run as a cluster, which is a set of running instances that share the work of one application between them, and each
  instance is a node. An engine that runs as a single instance has no cluster and no nodes. The spec never names an
  engine or the Observatory.
- An engine says what it is and what it supports in the preamble of `WatchEngine`. Every node serves `EngineAPI`, and a
  node that reports no metrics doesn't serve `MetricsAPI`, so a call to it ends with `UNIMPLEMENTED`. The preamble says
  whether the engine runs as a cluster, and if it does, how the nodes share the work (`ClusterModel`: competing for
  each unit of work, or each assigning itself workloads), and whether each node reports the live nodes and the
  workloads that it owns. It also says whether the engine appends every event to one event stream
  (`EventStreamModel`), and whether it delivers every message through one queue (`QueueModel`). A model that a node
  doesn't give is unknown, and the Observatory assumes nothing about it. A metrics preamble lists the metrics that the
  call reports. A metric that the Observatory doesn't know has no meaning to it, which lets an engine add metrics of its
  own. A metric that no preamble lists is one that the engine doesn't support, and the Observatory hides its section.
- `EngineAPI.WatchEngine` sends a preamble once (the engine's ID, a description of it for people, the name and version
  of the engine's software, the site, the application with its version, the heartbeat interval if it heartbeats, the
  cluster if it runs as one, its models of queues and event streams, and which messages about projections it sends,
  none of which change during the call), then, from a node of a cluster that reports them, `LiveClusterNodes` (the nodes
  it believes are live) and `ClusterWorkloads` (the workloads it believes it owns), each whenever it changes, and its
  heartbeats. `MetricsAPI` sends metrics that the node measures from the state that it can see. A node that can't read
  that state at all ends its call with `UNAVAILABLE`, which, for `WatchClusterMetrics`, is the Observatory's signal to
  call another node.
- The preamble holds the engine's heartbeat interval, if it has one. Each heartbeat carries the engine's own clock
  reading from when it was sent. A heartbeat may also say when it expires, as a time by that clock or as a length of
  time, which is where runkit is heading. A node is reporting while each heartbeat arrives before the one before it
  expires. When its heartbeats don't say when they expire, the spec gives no deadline, so the Observatory has a rule of
  its own: such a heartbeat expires after three of the engine's heartbeat intervals, so that a node that hangs with its
  connection open stops counting as reporting. An engine that gives no interval either, and a node that doesn't
  heartbeat, is reporting while its `WatchEngine` call is open.
- Each metric is read on its own, and a node sends its `Sample` when it chooses. A series is the samples of one metric
  for one subject. A node that can't measure a metric that the call reports ends the call with `UNAVAILABLE`, and the
  Observatory calls it again after 5 seconds, or, for `WatchClusterMetrics`, calls another node at once. The message
  of the status is for people and must hold no secrets. When a call ends, the Observatory discards its values, and shows
  a series again once the next call sends a sample of it, so it never takes a value from an ended call for a current
  one. A node that is over the observation budget measures less often, and sends no signal, because the engine is
  responsible for how often metrics arrive.
- A cumulative count is comparable only with values of the same count from the same call, so the Observatory derives
  rates only within one call. Event stream lengths are not cumulative counts, and are comparable across calls and
  nodes.
- The spec carries the metrics that the cluster view and the health rules use, and some that no v1 view reads: the
  handler metrics for messages that are due, `HandlerCommandsDue` and `HandlerDeadlinesDue`, the failing events of a
  handler, `HandlerEventsFailing`, and the outcomes of a projection's compactions. A handler's pending events are its
  lag on each event stream, `HandlerEventStreamLag`, which counts the events of any type after the offset that it has
  reached, including those that it will skip, and the handler's card adds up its lag over the streams. A workload is
  only its key, with a description for people. The prototype's other metrics are added, compatibly, when a view needs
  them.
- Every count is exact. A metric that an engine can't count exactly within its budget is one that it doesn't support,
  and doesn't list in the preamble. The prototype's counts that stop at a limit and say "at least" are not carried over.
- The prototype's active aggregate instances, which had recorded an event within a window, are replaced by the aggregate
  instances that a node holds in memory, and the spec has the same metric for process instances.
- The Observatory relies only on what the spec promises. Where the Observatory and an engine come to rely on anything
  more, the spec is amended to promise it, or the Observatory stops relying on it.

### Engine (runkit)
- New option that takes the Observatory's URL, which is a secure WebSocket URL. Without the option, an engine does not
  dial. It dials through tenet with an `http.Client`, which by default verifies the Observatory's certificate against
  the system's trusted roots. The site identity is a separate, optional option.
- New option `WithGRPCServerOptions`, which sets the options of the engine's gRPC server, however a client reaches it.
  `WithListenAddress` then takes only an address, which is a breaking change. The options are not given per route,
  because one server serves both the listen address and the tunnel.
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
- runkit counts the commands and the deadlines that it removes from each queue, each kind separately. Where those
  counters live is open.
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
- The user interface is navigatory, not modal. Where a page is can be seen and followed, and every view has its own
  address. Nothing in the interface holds a current site or cluster that the other pages then use, and there is no
  switcher that sets one. Moving to another place means following a link to it.
- v1 does not drill down to individual things, as the prototype did: no pages for a handler instance, a queue, an event
  stream or a message.
- The overview pages of the universe, a site and a cluster have vitals across the top and a breakdown below, and their
  vitals are the same size. Other pages, such as the drill-downs, needn't have either. An entity such as a cluster has an
  overview page, and it can have drill-downs of its own, so a kind of entity doesn't have just one page.
- The breakdown of a site is its clusters, and is not a card for each. A site holds many applications, so what a person
  wants to know of it is whether anything is wrong and where, how busy it is, and how to reach a cluster, and not the
  data of every handler. The idea to try first is a matrix with a cell for each cluster, like GitHub's contribution
  matrix, in a fixed order so that a cluster keeps its place, with the cell showing a cluster's health and each cell
  leading to the cluster's page.
- The three views:
  - **Universe view**: the default page, across all sites, showing the health of the whole ecosystem. There is wide
    latitude for a creative "hero page" here. It may also be just a summarized view of the others.
  - **Site view**: all clusters of one site.
  - **Cluster view**: the prototype's overview, exactly, including its handler cards.
- Scale to design for: about 100 clusters per site and 10 sites.

### Health
- Deferred until close to the end of the plan. The rules are implemented in the backend and nothing uses them, and the work
  on them, such as naming the backlog rule for the due messages that it is about, waits until then. The reds on a page are
  plain data and are not Issues: a number is red because it is above zero. An Issue will have an indicator of its own that
  is not only a color, for which a striped warning tape is the idea.
- The Observatory decides health from facts that the engines send, by fixed rules. Engines send facts only.
- The Observatory defines no rule that depends on configuration that it does not know. It can be told node configuration
  by each node, but the nodes of one cluster may differ.
- What a rule finds is an *Issue*. A cluster is unhealthy when it has any.
- v1 has only rules for what is clearly already a problem:
  - **Failed deliveries**: a queue holds a message with a failure streak.
  - **Backlog**: a queue holds messages that are due, and the number of them has not fallen within 5 minutes, measured
    by the Observatory's own clock. The rule is defined by time because the engine, not the Observatory, is responsible
    for how often metrics arrive.
  - **Membership**: each node sends the set of nodes that it believes are live. The members of a cluster are all the
    nodes in the sets of the nodes that are reporting, or in the sets of every node when none is reporting, because the
    set of a node that stopped may list nodes that have left since. A cluster is unhealthy when any member is not
    reporting. A node is reporting as the Spec section defines it, from its heartbeats or, if it doesn't heartbeat, from
    its open `WatchEngine` call.
- These rules will mark a cluster as unhealthy during a deploy, and a queue during a long rise in traffic. That is
  accepted for v1, because a deploy and a rise in traffic are moments when an operator wants to look. The rules can be
  tuned later.
- A cluster is forgotten automatically after 3 days in which none of its nodes reported. The UI also has a "remove"
  action, which it offers only for a cluster that has no node reporting. Removing a cluster that is still reporting
  would only clear its history, because its nodes connect again.
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
- The title bar says "Observatory", and then the name of the application that the cluster runs, where the prototype says
  the name of the application and then "inspector". The prototype had one application, and the Observatory has many
  sites, clusters and applications, so the name is where the page is, not the name of the tool's subject. How the title
  bar shows where the page is will change, as the site and universe views come.
- The footer shows no versions of Dogma, runkit or the application. The Observatory never loads application code. The
  engine API's preamble now gives the name and version of the engine's software and the version of the application,
  which the Observatory doesn't show yet, and nothing in the spec gives the version of Dogma.
- The three tiles and the handler cards are links in the prototype, to the streams, queues, cluster-nodes and handler
  pages. Those pages are not in v1.
- The prototype's navigation bar links to the streams, queues, cluster-nodes and per-type handler pages, which are not in
  v1.
- The handler card of an aggregate handler doesn't show active instances. The spec replaces them with the instances
  that a node holds in memory, which runkit doesn't support yet.
- A section of the cluster view whose metric the engine doesn't list in its preamble is hidden. In v1 that may include
  the aggregate instances per event stream and the unhandled events of each handler, if runkit can't count them within
  its budget. The unhandled events of a handler are shown only when the whole cluster's lag is reported through
  `WatchClusterMetrics`, or the engine doesn't run as a cluster, because the spec gives no rule for adding up the lags
  that several nodes report.
- The cards and the queues tile use the spec's words, which keep their meaning though the grammar bends. A message kind on
  its own, such as "commands", "events", "deadlines" or "messages", is the ones that are pending, and its popover says "pending". The prototype said "command backlog", "event backlog" and "deadlines". Spelling "pending" out on
  every label made the process card's stats too wide for one row. "In progress" is the spec's word too. A process's
  instances that are bound to no queue are the last segment of its bar and are counted in "in progress".
- Failing messages are the orange "+N" after the number that waits, such as "24 +1", on the queues tile and on a handler
  card, where the prototype had the number in red and the count in a line of its own along the bottom of the card. The
  failing messages are part of the ones that wait, so the number that is not orange is those that are not failing. A
  line of its own made the card taller when messages began to fail, and moved the page. The accent along the top of the
  card is orange, as the count is.
- The cluster is teal-green where the prototype's was green, because green is for what is healthy on the site and universe
  views, and the cluster's own tile must not look healthy when its cluster isn't. The icon of each kind of handler has
  the color of the sticky note of the kind in event storming, where the prototype colored it by the messages that the
  kind works with: yellow for an aggregate, lilac for a process, pink for an integration and a lime green for a projection, which keeps it apart from the cluster's teal-green.
- The popover of the messages removed per minute doesn't say that the figure comes from PostgreSQL's table statistics,
  because the Observatory reads no database.
- Counts are exact and have no limit, so the Observatory never shows the prototype's "at least" form with a plus sign.
- The prototype shows "Reading the database for the first time" before its first reading. The Observatory doesn't read a
  database.

## Changes wanted to the cluster view

What has been asked for, in the order it came, to be settled before the site and universe views, because they reuse its
parts. An item that says "Done" is built.

- Popovers in place of title text, for the bars and for everything else that has a tooltip. Done: no element of the
  page has a `title` any more. A popover appears after the pointer has rested on an element for 0.3 s, at once if another
  went less than 0.5 s before, so that moving along a bar shows each segment's. It is above the element, centered on the
  pointer, or below it if there is no room, and inside the window. It also appears for the keyboard's focus, and goes with
  the pointer, a press, Escape and a scroll. A finger doesn't show one. Only one is open at a time. The pointer can cross to a
  popover, which stays while the pointer is on it and for 0.2 s after the pointer leaves it or its element. A popover can
  hold something to click, such as the copy button of an identifier, and a keyboard can't reach that yet, because the
  bar segments that open it can't take focus.
  - A popover does one of two things. One that explains says what something is or means, such as the card of a tile's
    icon, a rate's card or the card of the nodes. One that drills down is about one thing, such as the card of a segment
    of a bar or a readout of a chart, and its figures and the identity of the thing vary. Both keep to one rule, so that
    a reader never hunts for a detail: a popover's paragraphs are fixed text, and a whole paragraph may be there only
    when it applies, such as the advice on the card of a segment, which is there only when the bar can be spread
    unevenly. Figures and identity have their own places, and are never inside a sentence, and an explanation is never
    reworded from one state to another. A status is a paragraph that is there only when it applies, drawn apart from
    the rest. The detail line, the line under a tile's headline, such as "events per minute, 1.2K events in 2 streams", is not
    prose: it is figures with their nouns, and the rule is not about it.
  - When a figure or a phrase in prose gets a popover: only if the reader can't get its meaning from the words alone.
    That is when the term is not one of Dogma's, such as a cluster, a node, a workload or a site, which come from the
    engine and the Observatory, so that a reader of Dogma has not met them there; when a common word means something
    narrower here than the reader would assume (a node is one process of an engine, and not a machine; a workload is the
    spec's unit of work that a node owns, and not a deployment, nor a count of handlers); when the figure is worked out,
    or can't be given at the moment; and when the thing has an identity to show. The terms of Dogma itself, such as
    aggregate, process, projection, integration, command, event and deadline, are assumed, and a card reminds the reader
    of them and doesn't define them. A popover is not for repeating a figure's own value or restating its words, nor for
    what a bar or another element beside it already says.
  - In a popover, prose about whether the figure can be given at the moment, and why, is a status, with an icon and a
    tinted ground under the rest, so it is clearly about the ability to give the figure, and not about what the figure
    means. The rate's card has one when the rate is lost or unavailable, which says that the samples are being averaged,
    with a turning icon, because the rate is being worked out.
  - Every element that is being worked on, or that has something undecided, is shown in every state that it can be in,
    side by side, at `/-/review`, because the demo reaches the unusual ones only by chance. A new element gets its section
    there before it is presented, and an element leaves the page once it is settled, so that the page shows only what is
    still open. A tile is shown whole, in each of its states, and then part by part, in the order of review, from the
    least specific to the most: its icon, its headline, its detail line, its bar and its chart, each with
    what it shows when it is pointed at. A card whose words never change, and that has a status in some states, is shown
    once, with its status. Each tile, part and state on the page has an ID that no other has, in full, such as "CL" for a tile,
    "CL 4" for one of its parts and "CL 4A" for a state: the code of its tile, the number of its part, 0 for the tile as a
    whole, and a letter for its place, so that it can be named in a review. A click on an ID copies it. Each
    part, or each state, is marked as decided or under review, and what is under review has the recommendation of what
    to decide beside it. A button accepts a recommendation: the dev server keeps the decisions that are made on the page in
    `artifacts/review/decisions.json`, which is not committed, for the agent that the review is with to read and act on. Where there are other wordings or designs of what a state shows, the state shows the recommended one, and the others are in a row of alternatives below the part's states, in a dashed frame named for the state and what is being chosen, which says that accepting the state or one of them is one decision, each with the state's ID and a number, such as "CL 4C1", and a button that accepts it in the state's place. A button at the top of the page plays the animations again.
    `/-/vitals` has the words of the popovers of the vital statistics on one page, in every combination of what they
    count and of the state of the rate, so that they can be read in one go. Its sentences can be rewritten in place: a bar says how many have changed, copies each change, as it was and as it is now, with the card that it is in, to be sent as feedback, and puts them back. The edits are kept in the browser.
  - What each popover says, and the hover state of its element, are being settled one element at a time, by using them,
    and the hover state of an element follows from its content. Done: the bar segments, whose popovers show the thing
    that a segment is of with its identifier (below); and the events tile's detail line and icon. A number that is abbreviated
    has no popover with its exact value, because the exact value is not wanted. The icon of a tile has a card that says
    what the tile is about in general, and not what it shows, because that depends on what the nodes can tell it, and
    each part has a popover of its own. A help card says its scope under its kind, such as "on the … node", only
    if the thing is narrower than the page, because a scope of the application would repeat the title bar. The events
    tile's card has none. The icon of an application is Lucide's `blocks`, which is not in use yet. An engine's is Lucide's `cpu`. A node's is the cluster's icon, Lucide's `network`, with the lower left of its three boxes filled, because a node is a member of a cluster, and its icon relates to the cluster's and not to the engine's. It is the one icon with a filled shape. An icon is as simple as those of the kinds of handler, without a badge. A workload's is Lucide's `briefcase`. A process's is Lucide's `waypoints`, which says that a process moves through its steps, and not always in a line, without drawing a tree, and looks nothing like the cluster's icon. The icon of a tile, and the kind icon of a handler card, grow a
    little, to 115%, when pointed at, because an icon is a compact target and a chip behind it was tried and not liked. The
    pointer stays the standard one. The queues tile, done as the events tile is: no popover with the exact number of messages;
    a help card that says "This section shows information about the messages and queues in the … application"; a rate
    card for the messages removed per minute, on the figure and its detail line, which scales to per hour as the
    events' does; the card of a queue for a segment of the bar, which is the card of a stream with messages and queues
    for events and streams, and says that when messages are waiting an even distribution is better; and the sparkline
    of the removal rate. The number of messages that wait and the count of those that fail after it are one headline, with
    one card, "Messages waiting", which says that, if there are any failing ones, they are shown separately, and leaves how to the example, which has a
    plus sign and smaller type, and does not rely on color, and that lower is
    better, because if the number keeps rising, messages arrive faster than they are handled, and shows an example,
    "24 +1", in grays and a dashed box, with numbers of its own and, drawn over it as if by hand, an arrow and a short label under each of its two numbers, in a bundled handwriting face, Gaegu, with its letters a little closer, chosen from Caveat, Gochi Hand and others; pointing at a number, or at its arrow or its label, shows the number, its arrow and its label in the number's real color, so that the relationship is seen and not only described,
    and it is not taken for the real figure.
    A failing count of a handler's card has none yet, because its stat has a popover of its own. The words and the figures in a
    sentence that have a popover get a faint ground behind them when pointed at, so that it is clear which words the
    popover is about; it is not an underline, which says that they are a link. The icon of a card is the icon of the entity that the card is about, and the card of a figure is about the entity that the figure counts, so the cluster tile's headline card has the node's icon, and its title names the figure. For a tile, it is the entity of its vital
    signal, except for the cluster tile, whose card is about the cluster and gives its ID, so it has the cluster's icon: the events tile's is events, and the queues tile's is messages, so the queues tile's icon and its cards' are an
    envelope, and only a card about a queue has the tray. If the chart and the rate are ever built from the messages that the handlers
    handle, because the queues don't report their removals, the card says so, and says which verb it counts. All of its
    states are at `/-/review`. The stats have a chip behind them when pointed at, because a stat
    is a group of elements to read as a whole, and the chip is not for a single element, such as a name. Done: the kind icon, whose card, in the color of the kind, says in the way of the events tile's card, "This section shows information
    about the … aggregate in the … application", so that it is clear when the handler's name is not, such as a handler
    named "aggregate", and then reminds the reader what that kind of handler does. It assumes that the reader knows the
    terms. To do, in this
    order: every stat, including "instances"
    and "in progress", which have a chip and no popover now, with the failing count in it; the figures of the events and
    queues tiles that have none; the handler name, whose
    popover would show its key as an identifier; the application name and the link of a cluster, whose popovers would
    show their identifiers; the concurrency icon, whose question-mark pointer would go.
- A hovered bar segment rises out of the bar, by a pixel above and below, and goes to full opacity, so its shade is
  cancelled. Done, for every bar. Nothing else on the page changes. A smear that faded down over the chart and an underline
  below the segment were tried first, and neither fit the page's style. A rising segment is outside its bar, so the
  segments are boxes, and the two at the ends of the bar have its rounded corners, and a part of the page that holds a
  bar doesn't clip once it has grown in.
- Every sparkline on the cluster view is a message rate, so that they all have the same basic axis: events, commands and
  deadlines are all messages, and each chart counts one kind of them per minute. The verb differs: events recorded,
  events handled, commands handled, messages removed. The cluster tile's wave is not a sparkline. The queues tile's chart
  was the number of messages waiting, which is a level, and which sits at zero in a healthy system, so it is now the rate
  at which messages are removed from the queues, from the cumulative counts of commands and deadlines removed. Done. The throughput is chosen by what the nodes report, as James decided on 2026-11-19: if
  they report both the commands and the deadlines that handlers have handled, it is those, because it is what was done,
  it is complete, and it is what the handlers' cards add up to; otherwise, if they report the removal of messages from
  the queues, it is those, which are complete too, but include messages that are removed without being handled, such as
  the deadlines of a process that has ended; otherwise, if they report one kind of handled message, it is that, which is
  only a part, and the tile says which, "commands" or "deadlines", in its words and its card. The Observatory says which in `counted`, and the page says it too: the detail line says
  "handled", "removed", "commands handled" or "deadlines handled", the card is "Message handling rate", "Message removal
  rate", "Command handling rate" or "Deadline handling rate", and says what it counts and, for a kind of message, that
  it is only a part, and the chart's readout is "handled/min", "removals/min", "commands/min" or "deadlines/min". When nodes
  report none of them, the chart is left out. `go run ./cmd/demo -combinations` also serves a cluster of one node for
  each of the sixteen combinations of what the queues tile is made from, and one for each of the four combinations of what the events tile is made from (its rate, and the lengths of the streams), named by their tile and by what they report, so that each tile
  can be seen for each. The number of messages waiting stays the
  tile's headline and its bar. A level and a rate on one chart was considered and not done, because they are in different
  units and each is scaled to its own peak.
- The events tile of an engine that appends every event to one event stream doesn't count streams, and has no bar, as
  the cluster tile leaves out the workloads of an engine that doesn't divide its work: "347 events per minute, 1.2K
  events". The queues tile of an engine that delivers every message through one queue doesn't count queues, and has no
  bar: "19 messages, 442/min". Each is shown when every node of the cluster says so in its preamble, in
  `EventStreamModel` and `QueueModel`, and not otherwise, because nothing in the spec promises that a node reports every
  stream or queue, or by when, so a stream or a queue that is the only one reported may not be the only one. Decided on
  `/-/review` (EV 0B, QU 0B).
- The cluster tile, in progress: its headline is the number of live nodes with the workloads that they own, and "0 cluster
  nodes" with the number in red (`Alarm`), and not the words, so that they still make a sentence, with a red accent along the top of the tile, and the heartbeat chart drawn as a flat gray line in the
  middle of its room, because the accent and the words already say what is wrong. It is not the moon's sky, because that
  is for a metric that nothing reports, and this is an outage.
  Its icon has a card that says what the tile is about, with the cluster's ID under its kind, as the cards of an event
  stream and a queue have theirs, because an application may run in several clusters and nothing else on the page says
  which one this is. A cluster has no name, only an ID, so the card has no scope line. The number of nodes and the words
  "cluster nodes" in its detail line share one card, with the node's icon because the number counts nodes, which says what a node is, and that the nodes together form the cluster, with "Contact with every node has been lost, so it's unknown whether the application is working." as a status while no node is live, and the workloads have another, which says what a workload is. Neither card
  describes the bar: as on the other tiles, only the card of a segment of the bar does. Each card keeps to about forty words, as the others do. A segment of the bar has the card of its node, with the node's ID, the
  workloads that it owns and its share of them. If no node's engine divides its work into workloads, the tile leaves the
  workloads out, and has no bar, because a bar of the nodes alone would say only how many there are, which the
  headline says (decided on `/-/review`, CL 0D). What one node is, and how it beats, is for the hover of the chart. The page tells four kinds of engine apart, which a node says in its preamble:
  one that doesn't cluster, whose preamble has no `cluster`, which has an engine tile in place of the cluster tile, and
  is not drawn as a cluster of one; one that clusters and doesn't divide its work into workloads, whose nodes compete
  for work; one that divides its work and doesn't report the workloads, whose nodes assign themselves workloads and say
  that they don't report them, which is shown as the one before it, because the page can't give the number; and one
  whose nodes say that they report them, as above. The state document says whether the engine runs as a cluster, and
  whether any node says that it reports its workloads, and a node's workloads are absent until it sends them. The engine tile's headline says whether the engine is online, which is while it is in contact:
  "Online" or, in red with the red accent, "Offline", with no detail line, because the engine never changes from one
  process to several. Its card says that online means in contact, with contact being lost, and so whether the application is working being unknown, as a status, both in words still to be settled at `/-/review`, and mentions
  neither nodes nor clusters. A page says "offline", and not "down" or "stopped", for an engine or a cluster that isn't reporting, because it
  can't tell a process that has stopped from one that it can't reach. The code and the state document call it `down`. Its chart is the process's
  heartbeat, and it has no bar. Its icon has a card that says what the tile is about, with the engine's ID. Such an
  engine has no page of its own, because its ID changes each time that it starts; it is seen through its application at
  its site. Decided at `/-/review`: its place in the row of tiles (EN 0C) and the card of its icon (EN 1). Still to do: the popover and hover rule of the heartbeat wave.
- Wherever the page names the application, it names the site as well, if the cluster has one ("the statements application at the
  eu-west site"; the title bar says "statements at eu-west"), because an application may run at several sites and a site
  may have several clusters. The site comes from the nodes' preambles, in `ClusterView.Site`, and the state document
  gives it in `application.site`. A site does not identify a cluster, so it is never used as the cluster's name.
- A cluster's page is a permalink that stays valid for any cluster that the Observatory has ever had a node of. The Observer
  keeps a `ClusterRecord` of each cluster (its application, name and key, and its site) after `ForgetIdle` has forgotten
  the nodes, and only `Forget`, the explicit removal, deletes it, and a restart loses all of them. A cluster that has no node
  reporting is down (`ClusterView.Down`, `down` in the document). If the Observer still has nodes of it, which it has
  until `ForgetIdle` forgets them after three days, its page keeps its shape: the tiles and cards keep their places, with their bars empty and their charts standing
  still, as they were when a node last reported (the server draws them as of that time), and the cluster tile says "0 cluster nodes", with the red accent and
  the grey line, so that nothing moves when a node reports again. No number is current, so each is the muted, blurred
  zero of a figure that is not available (`Distrusted`, which `Ramped`, `Figure`, `Failing` and the handler card's numbers
  read). What the page shows depends on the state of the cluster and not on how it got there: the numbers are those
  zeros both when the page loads with the cluster down and when the cluster goes down while the page is open, where
  they ramp down to zero at once instead of being kept for a minute as a lost figure is. If it has none, the page shows the
  application and site in the title bar and the cluster tile, and nothing else, because nothing about it is current. The
  page comes alive when a node connects, as the stream goes on. A cluster that it has no record of is unknown, and its page
  says so with a 404 from the API, and asks again every five seconds, so that it comes alive when the cluster becomes
  known. The clusters page lists a cluster that is not reporting after those that are, marked "out of contact".
- The grey line of the cluster tile with no live node is quiet, then breaks into a short burst of static, and
  then a lens passes along it for ten seconds or more, to and fro at different speeds and with pauses, as of something
  searching the line for the cluster, and then gives up: it stops where it is and shrinks to nothing, slowly, as it loses
  its focus, before the next burst, with its circle as grey as the line the whole time, so that it blends into the line as
  it closes. The lens is a plain circle, as thick and as grey as
  the line, with a gap between it and every line so that none touches it, which gets bigger and smaller as it goes, and is
  kept inside the chart, and through which the line is seen in
  more detail and in the cluster's teal: it is rough inside the circle, as a telescope shows what the eye does not see, and the roughness is the same wherever the
  lens is, because it belongs to the line. When the first node comes back the lens finds it: if it was scanning there is
  no static, and it finds it where it is. If it was not, there is a burst of static first, and the lens appears and
  looks to one side and back a little. It then comes into focus and zooms in with a start, a little past where it stops,
  which sharpens and magnifies the roughness and leaves the circle as big as it was. As it does, the roughness inside
  resolves into a clean heartbeat, as a heart monitor draws one, and the heartbeat grows out of that place: the lens is gone almost at once, and a ripple, which is a crest that flicks up from the flat line, then a
  trough and a crest again, each smaller than the one before, as in the wake of a wave, rolls out to both ends, taking the heartbeat's color as it goes, and behind it the line
  flows to the height of its heartbeat. The flat line is at the height of a full heartbeat, which is where a node that has just come back is, so
  the settle moves it only if the heartbeat has drained. The flat line and the heartbeat are one line that changes its
  height and its color, and are never two lines that fade into each other. When the last node goes the line settles back
  to the height of the flat line as it turns grey, so that it never jumps. The states page lets nodes be added and
  removed, each beating at its own pace. All of it is still for a viewer who asks for less motion.
- The same for a sparkline: pointing at a place on it shows the value there.
  - Done for the sparklines of the events and queues tiles: a cursor line, which fades out upward and downward, so that it ends in the chart's area, and has a round dot of five pixels
    where it meets the chart's line, of which only the center pixel has the full color of the text, and the rest is fainter
    toward the edge (three, four, six and seven pixels were tried, and a cross hair of lines sideways from the dot, which
    was not liked), and a readout beside the tile's icon, which expands from the icon, with the value and how
    long ago it was. There is no anchor: a click that held the cursor to a moment was built and removed, because the chart moves slowly
    enough to read under the pointer, and one held moment could not be compared with anything. The readout is of medium length, as in
    "347 events/min". A rate has three lengths: "347 events per minute" in a detail line, "347 events/min"
    in a readout, and "347/min" where the thing is named next to it. The cards' sparklines and the heartbeat chart are not done. The chart and the rate beside it are in the same unit, per minute,
    which the data layer converts once, and the readout is in the unit that the headline has, so a slow rate is per hour
    in both.
  - A sparkline scrolls, so the point under the pointer moves, and the readout is whatever is under the pointer. The
    mouse pointer stays shown: hiding it while the chart's cursor was shown was tried and not kept.
  - The cursor line fades out before it reaches the bar above, or flows into the readout in some way. Where it meets the
    chart's own line, not the shaded area, the line is more intense. It is not made to connect when it can't.
  - On the heartbeat chart, the hovered node's share has no border. Its line and its shade are more intense instead.
  - The readout is not a popover that follows the pointer. It is something on the card that appears only while the chart
    is pointed at, perhaps expanding from the card's icon, and always inside the card.
- Clicking a segment of a bar goes to something about that thing, such as a queue, an event stream or a node. Those pages
  don't exist, and none is made up until there is something good to show there. Until then a segment is not a link.
- The colors of the icons of handler types match the colors of event storming's sticky notes, and not the kind of message
  that a handler works with: yellow for an aggregate, lilac for a process, which is a policy, pink for an integration,
  which is an external system, and green for a projection, which is a read model. Done, as the visible differences say.
  There must not be many colors, and the projection's green and the process's lilac come close to the healthy green that
  the site view will use and to the event streams' indigo, to be judged when they are side by side on a page.
- Identifiers. A UUID is inevitable on the page and it irks. It needs a special treatment, so that a person can tell
  one from another and knows what it is, without the 36 characters. Done, without color. A color for an ID was tried as a
  square, as an icon of the kind of thing and as the color of the text, and dropped, because there are only 48 colors,
  so two IDs often share one, light colors can't be read as text, and the page puts too much meaning on color already.
  The conventions: an ID is shown only in a popover, never in the body of the page or in a sentence; it is its first
  eight characters in monospace type, which is the page's own, JetBrains Mono, at 10 px, with a button that copies the whole ID; the ID of a thing that has no name, such
  as an event stream or a queue, is its identity, and is in the color of the text; the ID of a thing that has a name,
  such as an application or a handler, is in the color of muted text, because the name is the identity.
- A handler card's chart is events recorded or handled, so the card of an integration that records no events, such as the
  mailer, has no chart and looks idle while it is busy handling commands. Decided: the chart shows what the handler's
  routes say that it works with. An aggregate charts events recorded, because it produces the business changes, and a
  process or a projection charts events handled. An integration charts events recorded if its routes produce any event
  type, and commands handled if they produce none. The routes are in the application's description, so the rule never
  changes while a handler runs, and it needs no thresholds. Charting whichever of the two there is more of would adapt
  as a handler's ratio changes, but it needs a rule for when to change and a label that changes with it, and it is for
  later if this proves wrong for a handler whose two counts differ. Nothing about it is configurable.
- An integration or a projection has no instances, so its card has no bar. A bar of the nodes that own the handler's
  workload would give it one, and both kinds care about concurrency. The spec can't say which node owns which handler's
  workload: a workload has a key and a description for people, and nothing links it to a handler or a queue.
- Flag a handler that minimizes concurrency but seems to be running on more than one node. It would be a health rule, and
  so an Issue. It can be found without knowing who owns the workload: the counters of what a handler handled are per
  node, so two nodes whose counters for one handler are both growing is handling seen on two nodes. A move of the
  workload between nodes makes it true for a short time, so the rule would need the two nodes to keep growing for a
  while, like the backlog rule, and its time is fixed, not set by a person. Whether the hint is clearly a problem when
  it is not met is the question of the health rules' own test.
- The icons on a handler card, which are the handler's kind, the little icons before its numbers, and the concurrency
  icon, feel as though they should do something when pointed at or chosen. What, is not settled.
- For later, a concept: a ratio, or some measure, of how well balanced a thing is across the nodes, or across the
  partitions that a bar shows, to go along with the cards' "an even distribution is better". It would turn the cue
  above into a figure that can be compared and followed over time, and not only a bar that is judged by eye. What it is
  measured on, such as workloads, instances or the rate at which a stream grows, and how it is calculated, are not
  settled.
- A bar shows how something is spread over the engine's partitions, and it is healthiest, for scalability, when the
  segments are close to even. A uniform bar means no hot partition. The page could say so: a faint mark where an even
  share would end, or a cue on a segment that is far larger than its even share. It is a cue and not an Issue, because an
  uneven bar is not clearly a problem. The sizes in a bar are not all load: the length of an event stream only adds up
  what it ever received, and a queue's messages are its backlog, so the cue is truer for the rate at which a stream
  grows, for the instances in a handler's bar, and for the workloads of the nodes.
  The queues' bar meets it only when there is a backlog worth caring about: a backlog that is spread over queues can be
  worked through in parallel, and one that sits in a single queue can't, so there the even bar is the better one, and
  with no backlog the bar needs no cue.
  The events tile's bar meets it more than first thought: in a growing system new instances get bound to the quieter
  streams, so the lengths should converge to even. They converge slowly, because a length adds up everything that a stream
  has received, but the bar is true about that history. The spec does not promise how an engine binds instances, and it
  needn't: an engine that lets one stream run hotter than the rest limits its throughput by how streams work, because a
  stream is consumed in order, so unevenness is a sign of harm whatever the engine's policy. It is a cue, and not an
  Issue, until it is clear that a rule for it would be about something that is already a problem.
- The icon of a tile or a stat should be the entity that its number is about. The Events tile's headline, events per
  minute, and the Queues tile's, messages waiting, are both about messages, so both would have a message icon. There is
  none yet, only the icons for an event, a command and a deadline, so the Events tile has the event icon and the Queues
  tile has the queue's, which is a container, and the mismatch stays until there is one.
- A count of things that can't be divided, such as events, is never shown as a fraction. A rate of them is a whole number
  per minute, and if that would be less than one, a whole number per hour, and then per day, so the unit of time scales
  and not the number. Done for the headline of the events tile, which says "events per hour" below one a minute. Not yet
  done for the queues tile's messages removed per minute or for the titles of the node bars, which round to whole numbers
  per minute and so show 0 for a slow rate. Where it may fall down: a rate that is near one a minute would change its
  unit back and forth, which would want a margin before it changes; the rate is an average over the last minute, so below
  one a minute it is really whether there was an event in that minute, and a longer window would be needed for it to
  mean more; and the nodes in one bar could have different units, which are hard to compare.
- A figure ramps: when its number changes, it passes through the values in between, quickly, and doesn't skip, so a
  change reads as a ramp and not as a jump. A figure is a number alone in its element, or leading its unit or noun, such
  as "2 streams". A number inside a sentence, one with a verb, changes at once, and so does text for screen readers.
  Done, with `useRamped`, for the numbers of the tiles, the stats and failing counts of the cards, and the figures of the
  event stream's card. A change of one takes 0.16 s, and each further step adds 0.04 s, up to half a second, with the
  last steps slower. A whole number ramps through whole numbers. It doesn't ramp when a number is first shown, when it
  is in other units, such as per hour and per minute, and for a viewer who asks for less motion. A number that comes
  back after it was lost ramps from the last value that it showed, and a lost figure ramps down to its zero when its
  minute is up, because the ramp only eases the jump: the blur is what says that the zero isn't a measure. It is not the
  flip-clock style that was tried and dropped, which animated the digits. It is on the states page, with buttons, which also lose a figure, expire it now and bring it back. The zero of a rate
  that was lost is in the unit that the rate was in. The zero is the colour of the text while the figure ramps down to it, and then fades to muted. The numbers of a
  handler's card that recede at zero do the same, and get their colour back as they rise from it. Both are on the states
  page, with buttons. A
  failing count that falls to zero ramps to "+0", stays for a second, and then shrinks away, so that a count that
  goes up and down doesn't come and go. A stream's card keeps the explanation of the bar however few events there are, and its figures say how many
  the stream has.
- A metric that only some of the nodes report: decided by the rule that a cluster supports everything that any of its
  nodes supports, and by the coverage rule. A part of a tile is shown if any node supports its metrics. A metric that
  is read from the nodes' calls to `WatchNodeMetrics` is combined over the nodes, and while only some nodes support it,
  the result is of those nodes, which is too small. Its coverage is the share of the nodes that support it, which
  `Coverage` gives, and a tile or a handler's card has the lowest coverage of the metrics it is made from. A figure's
  trust is its freshness times its coverage: it is blurrier the less it is trusted, it glitches for a moment each time
  its trust falls in a step, and its bars and charts stay live. The card of its icon says why, as a status. A metric
  that is read from `WatchClusterMetrics` doesn't have the problem, because one node describes the whole cluster. The workloads follow the same rule: a node that doesn't report
  its workloads, while others do, is a faint square, with a card that says so as a status, and the number of workloads
  counts the nodes that report them, blurred by their coverage. Done.
- A lost rate, undecided. A node joins or reconnects often in some clusters, and the rate pauses for a few seconds each
  time, because it is the sum over the nodes and a node's rate needs a few seconds of readings. The suggestion is to sum
  the nodes that have enough readings, so that the rate never pauses for a joined node, and dips by that node's share
  until it counts, and to say so in the card's status, so that "lost" means that no node has enough readings, which is
  at the start and not often after. A node that leaves stops counting at once either way.
- Places for the `Glitch`, which James likes and which is in use in one place so far, a lost figure just before its
  zero: somewhere that needs attention, kept for the
  exceptional so that it keeps its meaning. Candidates so far: the cluster tile's "0 cluster nodes", the notice that updates
  have stopped because the Observatory can't be reached, a node leaving the cluster, a handler's failing count when it
  first rises, and the health Issues when the rules come back. It would be a short burst and not a constant shake, and
  with reduced motion only the split. More are added as they are found.
- The prepositions of the page, proposed and not settled. The spec's own words are kept: events are "on" an event
  stream, messages are "in" a queue, instances are "bound to" an event stream or a queue, and workloads are "owned by" a
  node. A distribution is "across" the things that it is of, and "between" is not used, because it means two. The places
  that differ are the Events tile's "events in 2 streams", which would be "on", and the titles and popovers of the
  instance bars, which say "on event stream" for what is bound.
- Some bars show load at this moment, such as the bar of the nodes that handled a handler's messages, and others show
  values that build up over a long time, such as the bindings of instances. Both are worth having, so a card for which
  both make sense may need to show both. For later.
- A bar of the nodes that handled an integration's or a projection's messages could use the per-node rates of what the
  handler handled. The data is there, since each node reports its own totals, and Combine adds them up. A share of the
  rate would be volatile, so the shares would be smoothed with an exponentially weighted average. It says who did the
  work, not who owns it. For a handler that minimizes concurrency, one node doing all the work is the healthy bar, which
  reverses what an even bar means.
- A tile or card with no chart has a sky in the room of the chart (`Sky`), and the tile or card keeps that room, so that the
  bars of a row sit in one place. Of the options that were tried for the blank room (a short tile, the bar at the foot,
  the bar as the chart, constellations, an orrery, an aurora, an observatory, an Earth-rise, radio dishes, a sundial and
  an armillary sphere) the user chose these. In the dark color mode it is the night: stars that drift sideways very slowly
  and twinkle, over opaque hills that drift a little faster. In the light mode it is the day: a pale wash of the tile's
  color, thin cloud, and the same hills. In one sky of the page, the one that has been without a chart longest, there is
  the moon in its real phase, with seas and craters that are only just there. It rises from behind the hills over eighteen
  seconds when it comes to a sky, and passes to the next when its sky goes. In the day the cloud is in front of it. Its
  popover is a card (`MoonCard`): its heading is the author's own word for the moon, with "the moon" after it in a lighter
  style on the same line if the word is foreign, or just "Moon" for an English quote; then the phase of the moon; then
  a quote about the moon, in a block quote, with the author and a link to the text, and, if the quote is not in English,
  its translation in a block quote with the translator under it; then a status that says there is no chart because
  nothing is reporting what it counts. A different quote opens each time. Only quotes that were checked against the text
  they link to are in `moon-lore.ts`, and a translation is only ever a published one: a quote that has none is left out,
  and a test says so. The quotes are in scripts that the bundled typefaces have letters for (a test says so too), which
  is why there is no polytonic Greek, Chinese, Arabic or Hindi. The quotes still wanted are those for the countries that
  have none (the user asked for one each); the researchers found no published public-domain translation for the
  Spanish, Portuguese, Romanian, Czech, Hungarian, Lithuanian, Latvian, Albanian, Vietnamese, Indonesian, Welsh,
  Ukrainian, Turkish, Maltese, Dutch, Swedish, Icelandic, Finnish and Estonian ones. Nothing
  moves for a viewer who asks for less motion, and everything drifts very slowly: the stars take half an hour to cross a
  tile. The earlier idea, a night sky for a chart that is only empty, with a tumbleweed, is at `3a30728`, and is not used.
  - Handler cards say what their chart counts in the moon's popover, by kind, in `chartedWords` of `HandlerCard`. Those
    words reach users, so they are the user's to change.
- Use the spec's words on the page: commands pending, events pending and deadlines pending for what the cards call
  backlogs, messages pending in the queues tile, and instances in progress, which is also the spec's word. The health
  rule that is called Backlog is about due messages, so it takes the spec's word "due" when the rules come back.
- The minimize-concurrency icon on a handler card shows a question-mark pointer when pointed at. An information icon would
  be the usual cue for a tooltip, but this is already a small icon, so the pointer should not suggest more help is behind
  it. A proper popover gives it its explanation. Done, with the popover above.

### What a page shows when a metric isn't available

Decided. A slot is a place on a page that has a job, such as a tile's headline, its bar or a card's chart. Each slot has
the metric, or the group of metrics, that fills it, and the slot is removed when no node supports it, so that the page
responds to what the nodes can report and doesn't stretch what is available into a shape that was decided first. A tile
with nothing left is not shown. A slot has one candidate for now. Letting a slot fall back to a similar metric is
[dogmatiq/observatory#3](https://github.com/dogmatiq/observatory/issues/3).

- A metric that is supported and has no value yet is not a missing slot. A rate that has never been known is a zero in
  the muted colour, as blurred as a figure gets, described to assistive technology as "not available". A placeholder
  that is not a digit was tried as a dash, an oval, a rounded block and others, and none was liked, so it is a zero.
  There is no place yet where an infinity symbol makes more sense. One that is lost keeps its last value, in the same
  font, and the lost state is trust falling: it starts as the live figure was, and gets blurrier, steadily, over the
  minute that the value is kept, and in the last half second it glitches, and it ramps down to the zero when the time is up. When the rate returns, it gets its trust
  back in a moment. The blur was chosen over a grid, scanlines, and a glitch for the whole minute. The glitch is the
  `Glitch` component, which plays once, as a burst, just before the zero: the top half and the bottom half of the figure slip sideways on their own,
  with red and cyan shadows that drift apart. Dot-matrix type, with its own glyphs, was tried and dropped, because the
  font must stay the same, and a halftone of dots over the digits looked like a texture. It was a dash, and muting
  alone, and then dots that dimmed and shrank, whose pace was uneven.
  - The card of a rate says what it is and that it is averaged over the last minute in every state, and under that a
    status that says what is happening with the samples and what follows: "There aren't enough samples yet, so the average
    can't be calculated." when there is none yet, which does not say how long that takes, because nodes can be flaky, and
    "No new samples are arriving, so this average is out of date." when it is lost.
- A part that begins or ends while a page is open grows in or shrinks away, with some animation, and not necessarily the
  same one for every part. Stats on a card appear and go without one so far.
- The page adapts to what the engine says that it supports, in three cases. What the engine declares that it doesn't
  support, in its preamble, its supported metrics or its features, may change the layout: a part is absent, a tile is
  another tile, a chart is a sky. It has no status, because nothing is wrong. What is supported and isn't working at the
  moment, such as a rate that isn't known yet or has stopped arriving, or an engine or a cluster that is offline, keeps
  the layout that it has when it works: its figures are blurry or are the zero of a figure that is not available, and its
  card has a status. That is the only case that has one. What is supported, works, and is quiet at the moment, such as an
  engine that uses several streams and has one so far, a node that owns no workloads or a queue with no messages, keeps
  the layout too, and its figures say so, with no status. The state document says which: a part that no node supports
  is absent, and a rate that is supported and not yet known is an empty object.
- A cluster supports everything that any of its nodes supports. Nodes of one cluster that support different things may
  be partway through a deploy, which the page doesn't say, because it can't know and "deploy" reads as something the engine does: a card says that some nodes, or this node, may be running a different version of the engine, and a node that doesn't support what another node of its
  cluster does is supported, and not working, for that thing: its part of a figure is not available, and the figure's
  card says so, as a status.

### Changes asked for after the cluster view was built

- Failing counts are orange, and red is kept for health Issues. Done: the failing count and the accent along the top of
  a card with failing messages are orange (`--color-failing`, a red-orange). The red number of "0 cluster nodes" stays red, because it is a
  judgment, as an Issue will be.
- Animating the numbers themselves, such as rolling the digits of a counter like a flip clock, was tried and is too
  much. Numbers change at once. What around them changes may be animated.
- The punctuation in a handler's name is muted, the same colour as a number that is zero. Done.
- The failing count is smaller on a card, and its digits have their tops on the same line as the number's, which is
  not a superscript. Done.

## Held back from the views

What the spec carries, or what the Observatory already computes, that no view shows. The cluster view keeps to the
figures that the prototype's overview had, and the rest is for drilling down. Add to this list whenever something exists
but isn't shown, and decide towards the end which of them to show and where.

| What | Where it is | Why it isn't shown |
|---|---|---|
| Commands or deadlines handled per minute by each handler | `HandlerCommandsHandled`, `HandlerDeadlinesHandled` | Added to the cards, then taken off to keep the prototype's figures. |
| Deadlines canceled per minute | `HandlerDeadlinesCanceled` | As above. |
| Process instances ended per minute | `ProcessInstancesEnded` | As above. |
| Events recorded or handled per minute as a figure | `HandlerEventsRecorded`, `HandlerEventsHandled` | The cards draw only their chart, as the prototype did. |
| Messages that are due, by queue and by handler | `QueueCommandsDue`, `QueueDeadlinesDue`, `HandlerCommandsDue`, `HandlerDeadlinesDue` | Only the backlog rule reads the queues' counts. No view does. |
| Instances that a node holds in memory | `AggregateInstancesInMemory`, `ProcessInstancesInMemory` | The Observatory doesn't read them yet, and runkit doesn't support them. |
| Which queue or handler has the failing messages | `QueueCommandsFailing`, `QueueDeadlinesFailing`, and the handler counterparts | The tile and the card show only the total. |
| The Issues that the health rules find | `Health.Assess` | No view shows them, and nothing calls `Assess` yet. |
| Removing a cluster | `Observer.Forget` | The "remove" action has no control. |
| A node's description, its heartbeat timing, its call's error | `Node` | Only the heartbeat levels are drawn. |
| A workload's description | `ClusterWorkload` in the engine API | The cluster tile shows only the number of workloads. |
| The name and version of the engine's software, and the version of the application | `implementation` and `application.version` in the engine API's preamble | Nothing shows them yet. The footer and the statuses about versions are where they would go. |
| How the nodes of a cluster share its work | `ClusterModel` in the engine API's preamble | The page shows a cluster whose nodes compete for work as one whose nodes assign themselves workloads and don't report them. |
| A handler's failing events | `HandlerEventsFailing` | The card's failing messages are its commands and deadlines. |
| The compactions and reset operations of a projection, and whether a projection supports them | `ProjectionCompactions*`, the messages about projections of `WatchEngine`, `ProjectionAPI`, and `configpb` | No view reads them. |
| A handler's lag on each event stream | `HandlerEventStreamLag` | The card shows the total over the streams. |
| A handler's and an application's Go type, and the messages that a handler uses | `configpb` | Only a handler's name, type and key are used. |
| A handler's failing messages split into commands and deadlines | `HandlerCommandsFailing`, `HandlerDeadlinesFailing` | The card shows one total. |
| Which nodes handled a handler's messages, and how many each | the per-node samples that `Combine` adds up | Only the sums are used. |
| The signals that the queues tile's rate doesn't use, when nodes report several of the removed messages, the handled commands and the handled deadlines | `QueueCommandsRemoved`, `QueueDeadlinesRemoved`, `HandlerCommandsHandled`, `HandlerDeadlinesHandled` | The tile shows one, by a rule, and the others are not shown anywhere, because there is no deeper view yet. Revisit when there is, for example to show the removals that are not handled, which are the cancelled deadlines. |
| A handler's concurrency preference when it is not minimize | `ConcurrencyPreference` | Only minimize has an icon. |

## Delivery order

Tick each item when it is done, and write the pull request or commit that did it beside it.

- [x] **Tunnel spike** (see [spike/tunnel/README.md](../../spike/tunnel/README.md)): prove that a Node process can
  accept a connection from a Go engine and act as the gRPC client on it, over plain TLS. Delete `spike/tunnel` once
  tenet's two sides work.
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
  - [x] A handler's concurrency preference in `configpb`, and the metric `ProcessInstancesEnded`
    ([dogmatiq/protobuf#40](https://github.com/dogmatiq/protobuf/pull/40)).
- [x] **Tunnel, in dogmatiq/tenet**: delivered as [its own
  plan](https://github.com/dogmatiq/tenet/blob/main/docs/.plans/2026-11-17-tenet-v1.md) says. Its first cut is tagged
  v0.1.0 (2026-11-18), which the Observatory uses.
- [ ] **Engine side, in dogmatiq/runkit**: the cluster ID, the Observatory option, the site option and
  `WithGRPCServerOptions`, dialing the Observatory through `dogmatiq/tenet`, sending heartbeats to the Observatory, the
  description of the application, the port of the prototype's SQL and derivation code from its `observe` package, the
  observation budget and the schema changes.
- [ ] **Observatory repo**: the Go backend and the React frontend, as the tasks below, each of which ends in a review.
  - [x] **Setup**: the Go module, and the frontend's toolchain in the Makefile. A Go interface for one connected node,
    `NodeDialer`, in `internal/observe`: it dials connections to the node, and signals when it can no longer be reached.
    tenet's `Dialer` is meant to satisfy it without a wrapper. `NewClients` builds the clients of the engine and
    metrics APIs over a `NodeDialer`, in one place, and the rest of the Observatory depends on those clients. Its first
    implementation is in-process, over gRPC's `bufconn`. The Go module is at the root and the frontend
    is in `web`, built by Vite into `artifacts/vite/dist`. Delete `docs/spec-notes.md`, which tenet and the spec have
    superseded.
  - [x] **Fake engine**: a stub engine that answers `EngineAPI` and `MetricsAPI` from data that a test supplies while the
    code under test is receiving it. It is built on the client stubs that `dogmatiq/protobuf` generates, such as
    `EngineAPIClientStub`. `internal/observe/stubs` adds what they lack: a `ServerStreamingClientStub` for the stream
    that a stubbed call returns, in the usual style (a `<Method>Func` field for each method), and a `Feed`, which is
    that stream with `Send` and `End` for the test to call. The Observatory's code takes its `Clients`, so a stub is
    handed to it in place of a real node. A source of moving data for local development of the frontend is not part
    of this task. It is decided in the Look task.
  - [x] **Engine state**: the preambles, live nodes, workloads and heartbeats of each node, whether each node is
    reporting, and identifying each tunnel by node ID. `Observer.Serve` watches one node's `WatchEngine` call, and
    `Observer.Nodes` returns what the nodes reported. A node is reporting by the Spec section's rule, with these
    additions where the spec says nothing: until its first heartbeat arrives, and if its heartbeats give no way to
    tell when one expires, it is reporting while its call is open. A newer connection from a node ends the older one's
    `WatchEngine` call at once, and the node keeps its latest heartbeat across connections. `Serve` closes the older
    connection's clients only once every call that it made through them has ended.
  - [x] **Metrics**: `Serve` also calls each node's `WatchNodeMetrics`, and `Node.Metrics` holds what the node's current
    call has reported: its preamble, and the latest sample of each series, where a series is one metric of one subject.
    For a node whose engine runs as a cluster, `Serve` also calls `WatchClusterMetrics`, on one node of the cluster at a
    time, and `Node.ClusterMetrics` holds what that call has reported. When that call ends, another node of the cluster
    is called at once, and the node whose call ended is called again only after 5 seconds, if no other node is being
    called by then. Of two messages of a series, the one with the greater revision is kept, and a later one wins a tie.
    A `Tombstone` discards the series' sample. Only metrics that the spec defines are kept. A sample's message is
    decoded, so that code that uses it reads typed fields. A call that ends leaves no values and `Node.MetricsErr` or
    `Node.ClusterMetricsErr`, and is made again after 5 seconds, except when the node answers UNIMPLEMENTED, which
    means that it doesn't report those metrics. `Combine` turns the nodes of one cluster into what the cluster as a
    whole reports: for a metric that the call to `WatchClusterMetrics` reports, that call's samples, from the node
    whose call began first if there are several; for any other metric, the nodes' own samples, combined by the rule
    that the spec gives for the metric's field and matched by their subject, which the spec makes comparable among the
    nodes of one cluster. A node's own samples of a metric that the cluster's call reports are ignored, so a result
    never mixes values from different calls.
  - [x] **Rates and history**: rates from cumulative counts within one call, and the history kept in memory for the
    sparklines and the heartbeat chart. A node sends a sample only when a value changes, so the Observatory takes a
    cumulative count to stay the same until the next sample, and averages its growth over the last minute, or over the
    time it has been observed if that is shorter, with no rate before 5 seconds. A count that falls means that the node
    started again from zero, so the rate starts again too. Each call's rates are its own, and `Combine` adds the rates
    of the nodes' own calls, as it adds their values. A rate that any contributor can't give yet is none. The metrics
    that are cumulative counts are those whose field is `cumulative_count`, as the spec names it. The Observer keeps
    when each node's heartbeats arrived, for 10 minutes, and `Trail` is the bounded history of one number that the
    cluster view adds to for each sparkline.
  - [x] **Health rules**: failed deliveries, backlog and membership, and forgetting a cluster after 3 days. What a rule
    finds is an *Issue*, and a cluster is unhealthy when it has any. `Health.Assess` decides from `Observer.Nodes()`,
    and it remembers what it has seen, because a queue has a backlog when the number of messages that are due, commands
    and deadlines together, has not fallen for 5 minutes as `Assess` has seen it. A queue whose messages stop being due,
    or that no node reports, starts again. The members of a cluster come from the sets of live nodes of the nodes that
    are reporting, or of every node when none is, so that a node that left is not a member forever and a cluster that
    stopped is still unhealthy. A member that no node has connected for is not reporting. `Observer.ForgetIdle` forgets
    a cluster 3 days after the last time that any of its nodes was reporting, and `Observer.Forget` forgets a cluster
    for the "remove" action. Both end the connections of its nodes, and a node that connects again is new.
  - [ ] **Engines through tenet**: accepting engines through tenet once its two sides work, and checking engines' server
    certificates once their gRPC connections use mutual TLS.
    The accepting side is written: `internal/tunnel` has the HTTP handler that takes a node's tunnel from tenet and gives
    it to `Observer.Serve`, and `cmd/demo` serves it at `/-/tunnel`. A node must serve its gRPC server on the network and
    address that `internal/tunnel` names: network `dogma`, address `engine`, which runkit serves its gRPC server on
    through the tunnel. A node that doesn't send its preamble within 10 seconds is dropped, because a tunnel can be
    opened by anything that reaches the Observatory. The spec promises no time, and is not amended: the limit is the
    Observatory's own, and a node that is slower than that is not one that it will observe. The checking of server
    certificates waits for mutual TLS.
  - [x] **Look**: a check that React and Tailwind can match the prototype's overview, compared in screenshots. The
    overview is built from components that the cluster view reuses, with the prototype's colors, spacing, radii, shadows
    and fonts as Tailwind theme tokens, and it matches a frozen copy of the prototype page in light and dark at 1440, 900
    and 390 pixels wide, with no pixel over the comparison's threshold. The heartbeat chart is drawn once, and the
    sparklines don't scroll, which the cluster view adds with live data.
  - [x] **Cluster view**: the prototype's overview, exactly, with the differences recorded above, fed by live data.
    `observe.Recorder` keeps the history behind each chart, one point a second for the last 70 seconds, and makes the
    `ClusterView` of a cluster from what its nodes report: the tiles and the handler cards, with a section left out when
    no node supports its metrics, and a number left out until it can be given. `internal/server` serves `GET
    /-/api/clusters` and `GET /-/api/clusters/{id}` as JSON, and `GET /-/api/clusters/{id}/watch` as a stream of changes to what the page draws. The pages are `/`, a plain
    list of the clusters, each with its site or else the start of its ID, that stands in for the universe view, and `/-/cluster/{id}`. `cmd/demo` serves the API with a
    simulated cluster, which is the source of moving data for developing the page. The heartbeat levels and the scrolling
    sparklines are on the page.
  - [ ] **Smoke test**: a real engine with the Observatory, managed by the Observatory's CI.
  - [ ] **Beyond the cluster view**: its shortcomings, then the site view, then the universe view.
- [ ] **Near release, dogmatiq/protobuf**: the spec is added as a stable package, and runkit and the Observatory switch to
  it.

## Open
- Decided and built: a person browses by the application at a site. Its page's address is the application's key and the
  site, and it is what the clusters page links to. Each cluster that runs it is a drill-down beneath it, by the
  cluster's ID, so two clusters of one application at one site, as in a blue/green deploy, are side by side and not
  merged; with one cluster, the application's page can show it directly. An engine that doesn't run as a cluster gets a
  new ID each time it starts, so each run is a drill-down beneath the application's page by that ID, and a restart is
  a new run under the same page, not a new page that leaves the old one out of contact until it is forgotten.
  Done, with the permalinks below in place of drill-downs: the clusters page links each cluster to the application view
  of its application at its site, which shows its cluster directly, and lists the clusters, each linking to
  `/-/cluster/{id}`, while more than one runs it. `Observer.ClustersOf` says which clusters those are: each cluster of
  the installation that has a node reporting, apart from one that has been replaced, which is one that has no node
  connected while a cluster of the installation that the Observer began to remember after it has one; and, if no
  cluster is reporting, the newest, which is down. A restart of an engine that doesn't run as a cluster is therefore the
  new run on the same page, even while the old run's heartbeat has not expired, and the page, which asks which clusters
  run the installation every second, moves on to it. The clusters page leaves out a cluster that has been replaced, and
  `Observer.ForgetIdle` forgets the record of one, as well as its nodes, once it has been idle for 3 days; the newest
  cluster of an installation is remembered until the Observatory stops, as before.
- Decided and built: the permalinks, by keys and IDs, which never change, with singular words. An application nests under a site,
  because a site is always bigger than an application. `/` is the universe; `/site/{site key}` a site, with every
  application at it; `/site/{site key}/app/{app key}` the application at that site, which is the view designed so far;
  `/app/{app key}` an application across every site that it runs at, an aggregate, which with only one site shows
  the same as that site's view, so that it covers the common case of one application with no site; and `/cluster/{cluster id}` a cluster, which keeps its own address because a cluster can be replaced
  while its application and site stay the same. The current `/clusters/{id}` addresses redirect. An engine that doesn't
  run as a cluster has no permalink of its own, because its ID changes when it restarts; it is seen through its
  application. An application with no site is at the site whose key is the nil UUID,
  `/site/00000000-0000-0000-0000-000000000000/app/{app key}`: Dogma rejects the nil UUID as a key, so it can't be a
  real site, though the Observatory's addresses may use it. The Observatory's own routes, the permalinks above, the review pages, the API and the
  page's static files, all sit under `/-/`, so that `/-/site/{site key}` and so on, and the root belongs to names
  learned at runtime: `/{name}` is the site or the application with that name, and `/{site name}/{app name}` is the
  application at that site. A name address resolves on each visit: it shows the one match, lists the permalinks of the
  candidates when there are several, and waits for the name to become known when there are none. This relies on
  dogmatiq/dogma#233, accepted for Dogma 1.0.0, which makes every identity name start with a letter or a digit, so
  that no name can be `-`.
  Done: `web/lib/route.ts` has the addresses, and `/-/fixture`, `/-/terms`, `/-/review` and `/-/vitals` are the
  pages for development. The API is `GET /-/api/clusters`, which with the query parameters `site` and `application`
  gives the clusters of one installation, and `GET /-/api/installations`, which the keys or the names of a site and an
  application filter, with the nil UUID as the key of no site; a name's page asks for both kinds of name and tells them
  apart. The demo serves its tunnel at `/-/tunnel`. The page's files are under `/-/`, and the dev server serves the
  page at every address that a browser asks for a page at outside `/-/`, which the Observatory's own server must do
  too once it serves the page. A name
  address keeps the address that was visited. `/clusters/{id}` moves to `/-/cluster/{id}` only for an ID that is a
  UUID, because a site named "clusters" has addresses of the same form. The page of a site, of an application at
  several sites, and the lists of candidates are plain lists of links until they are designed. Their words, and the
  heading "Clusters" of the root list, whose entries are now applications at sites, are placeholders until then, and
  are settled as those pages are designed on `/-/review`. Every page that waits
  for something to become known asks again every second.
- Decided, to build next: a member of a cluster that is out of contact counts toward a figure's coverage as a node that
  doesn't report, on every view, so the cluster view's figures blur while some nodes are out of contact, as the site
  view's do, rather than shrinking with no sign. Today `Coverage` counts only the nodes that are reporting. Its new
  state is reviewed under the cluster tile.
- Decided, to build with the item above: the cluster tile's headline sets apart the members that are out of contact as a
  red "+N", as in "4 +1", as the site view's applications tile does, without the red accent, which stays for when every
  node is out of contact, because the other nodes still work. The members are those of the membership rule, from the
  nodes' sets of live nodes, so a node that leaves cleanly isn't counted. An engine that doesn't report its live nodes
  has no "+N". The headline's card gets the worked example of a number set apart. The cluster explainer then gets an
  annotation of its own for the "+N", along the lines of "the number of nodes out of contact", placed by the rules for a
  figure beside the headline, and a mockup variant, whose wording is reviewed then.
- Under review on `/-/review` (SV): the site view. Three tiles, the same size as the cluster view's: the events per
  minute across the applications, with the events in the event streams of all the applications together, and the number of
  those streams, which is how widely a reader of the site's events has to read, and a bar of which applications record the most; the messages waiting, with those
  that are failing, and a bar of which applications have the most, and the number of queues of all the
  applications together, which says roughly how widely the site's work can be spread; and the number of applications in contact, with the
  number out of contact, whose chart is the heartbeat chart with a share for each application in contact. Below them,
  each application in the order of their names, as a small card with its name, its events per minute and its messages
  waiting, linking to its application view; the plan's first idea, a grid of squares like a contribution graph, is the
  alternative. An application is in contact while its engine, or any node of its cluster, is. The coverage rule
  applies across the site: a total's coverage is the share of the nodes at the site that report it, and an application
  out of contact counts as nodes that don't. The view of the applications at no site is the same, at the nil UUID's
  address. The backend is built once the design is settled.
- What a cluster's page shows of `HandlerEventStreamLag`. The spec gives no rule for combining it across nodes, on
  purpose: what makes sense to show is for the Observatory to work out. Until then a cluster shows it only if
  `WatchClusterMetrics` reports it.
- Which reading to show when a metric appears in both `WatchNodeMetrics` and `WatchClusterMetrics`, which the spec
  allows. For now the cluster call wins, and the sums of the node calls stand in while no cluster call is open. What
  gives the reader the best experience is for the Observatory to work out.
- For the design review: the kinds of hovercard. First the kinds are worked out, and then each is written into the
  design doc with what it must have. Then, as decided: the application's name in the title bar, and each cluster in the
  list of clusters, gets a hovercard with its identity in place of a tooltip, once the kinds are settled; every segment
  of a bar gets a segment hovercard in place of its line of text, including the bars of a handler digest and the merged
  segment of every bar; and the minimize-concurrency icon and the labels of a handler digest's figures get hovercards
  that explain them. A tooltip is only for text that is cut short. Done: the color mode control has no tooltip.
  Decided since, and being explored at `/-/annotations`: a vital card or digest is explained all at once by an
  explainer, a dialog that zooms a copy of the card, with made-up figures, to the middle of the window, with annotations
  around it that point at its parts. Hovercards are then only for drilling down, so the kinds above are worked out
  again with that in mind. The explainer opens from a "?" at the bottom right of every vital card and digest, which
  shows while the card is pointed at or focused, and always on a touch screen, which can't point. The copy has
  made-up figures, fixed for each layout, chosen so that every state worth explaining is shown, such as a "+N", an
  accent and blur, and it shows only what this card can show, by the rules for how what the nodes support shapes the
  layout. It is in its own colors, with a small caption under it, "Example data only". Pointing at an
  annotation, or at the part that it is about, fades the rest of the card back, with a soft edge around the part,
  and draws focused text in the most prominent color. Every
  explainer has a title, which says what the card is about and where, in place of "This section shows information
  about…"; then the annotated card, whose annotations say what each part is; and then a paragraph of the definitions
  of terms that aren't Dogma's and of advice, such as that fewer messages waiting is better.
  Text that depends on the engine that runs this application is drawn apart, on a sunken ground, with the engine icon.
  Its first sentence has the engine as its subject, named through the application, in bold. The events card's reads
  "The statements application's engine spreads events across several event streams. An even spread is better; a stream that holds more than its fair share limits parallel
  throughput." and "Each aggregate instance is bound to a single stream so that its events can be read in order.", shown whenever the card shows its bar of streams, which an engine that reports the
  multiple-streams model shows even while only one stream has been seen. In a window too narrow for the annotations beside the card at full
  size, each is a numbered marker on the card, and their words are listed under it, by number.
  The rules for every explainer, drawn from the events card's, are in docs/ui-design.md under Explainers, and the
  queues, cluster, handler digest and compact digest explainers are built from them at `/-/annotations`, for review.
  When the events card shows its streams, its explainer says "Each event that the application records is written to an
  event stream. Streams store events in the order they are written, so they can be read in that order." Each bar's advice, such
  as "An even spread is better", is in the explainer of its card, only when the card has the bar, and leaves the
  hovercards of the bar's segments, which then only drill down; that move is made when the explainer is built. A bar's
  amounts are a spread: "distribution" and "shared among" are not used. In the explainer the advice
  names what is spread: "An even spread is better; a stream that holds more than its fair share limits parallel
  throughput." The queues card's says the same of queues. The advice relies on what the multiple-streams and
  multiple-queues models are for, which is handling the streams or queues in parallel; the spec doesn't promise that
  unconditionally, and isn't changed to.
  The queues explainer is approved. Its annotations of the rate and of the chart say what the engine counts, and what
  it leaves out: "the rate of handled messages", "the rate at which messages leave the queues, handled or not", "the
  rate of handled commands, not deadlines" or "the rate of handled deadlines, not commands", each "averaged over the
  last minute". While no node reports the messages waiting, the rate is the headline, and the explainer has no bar, no
  box and no advice about messages waiting. Under the card it says "Commands and deadlines wait on queues until they
  are delivered. A deadline is delivered when its scheduled time arrives." and "Fewer messages waiting is better. If the
  number of waiting messages keeps rising, messages are arriving faster than they are being handled." Its box reads
  "The statements application's engine spreads messages across several queues. An even spread is better; a queue that
  holds more than its fair share limits parallel throughput."
  The cluster explainer is approved. It has no box, because the cluster card is shown only for an engine that clusters,
  so the card already says what the box would. Under the card it says, following the card from top to bottom, "Each
  node is a running process of the application's engine, and the nodes share the application's work.", when the card
  shows workloads "The work is divided into ongoing tasks, such as delivering messages to a handler, which are called
  workloads. Each workload is given to one node at a time.", and "Each node sends heartbeats to show that it is running. Its
  section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats
  stop." Its paragraphs describe
  what happens rather than define terms, as the events and queues explainers' do. Its annotations are "the number of nodes in contact now", "the number of workloads in the
  cluster", "how the workloads are spread across the nodes" and "how recently each node sent a heartbeat".
  The aggregate's digest explainer is approved. Its arrows point at the figures themselves: the handler's name from
  above the card, the kind and the instances level from the left, the commands waiting from above, and the failing
  count level from the right. Its box says "several event streams", so it is there only when the bar has more than one
  segment. Done: the segment hovercards' advice says
  "An even spread is better".
- Later, for the design review: whether the queues card's detail line says what its rate counts. While the card shows
  the messages waiting, the rate in the detail line is a bare "442/min", whatever the engine counts; only the explainer's
  annotation says whether it is messages handled, messages removed, commands handled or deadlines handled. The chart's
  hovercard already gives a unit for each ("handled", "removals", "commands", "deadlines"), which the detail line could
  use, as in "442 commands/min". While the rate is the headline, its label already says what it counts.
- To build after the review of the explainers: an aggregate's digest has no bar when the engine reports that it has one
  event stream, as the events card has none, because a bar with one segment shows no spread. The digest needs the
  engine's event stream model from the server for this, as the events card has it.
- Later: the lens of the cluster tile with no live node needs a popover, as the moon has, and something playful in the
  same spirit as the moon's card and its quotes. A theme of the search for extraterrestrial intelligence, or of Carl
  Sagan, would suit a lens that searches for a signal. The rules of the moon's quotes apply: each quote is checked
  against its published text, with a link to where it can be read, and a quote in another language has a published
  translation, with its translator.
- Done: the statuses of the card of a node that doesn't report its workloads and of a section that only some nodes
  report say nothing about versions, because a status has one fixed text for each cause. The server still compares the
  nodes' versions of the engine and of the application, and sends whether they are the same, for wherever the views
  come to show versions, which is the footer's open question below.
- A node that joins, or comes back, makes the cluster-wide rate of anything that nodes count unknown for five seconds,
  because a rate that any contributor can't give yet is none, so a `?` shows for that long. The demo does this now, because
  its nodes go down and come back. It belongs to the rule for what an unknown figure does, which is parked.
- Which node owns the workload of which handler. A workload is `{key, description}` and `ClusterWorkloads` is the set that a node
  owns, so the Observatory can say how many workloads a node owns and not what they are for. A bar of the nodes that run
  an integration or a projection needs the spec to link a workload to a handler, or to the queue or event stream that it
  works on.
- A rule for what a rate that isn't known yet, or that may be stale, does on the page. Three questions: whether such a
  figure earns the space that it takes, by a test that we have still to write; whether the layout shift that it causes
  when it appears is worth it; and how to show that a figure may be stale with less visual weight than a `?`, such as a
  glitch or a fade on the text, which doesn't change the layout. The rules would differ for the large figures of a tile
  and for the figures that sit inside a line of prose. Come back to it with the site and universe views, which have the
  same figures in smaller places.
- The versions that the prototype's footer showed. The engine API's preamble gives the name and version of the engine's
  software and the version of the application, and nothing in the spec gives the version of Dogma. Whether the footer
  shows the versions that the spec gives, and what it shows when the nodes of a cluster give different ones, is still
  to decide.
- The observation budget's actual limits. They are set before the prototype's queries are ported.
- Where runkit keeps its counters of removed commands and deadlines: in memory on each node, which makes them
  node-scoped and restart from zero with the node, or in counter rows kept by triggers, which adds contention to the
  write path. A cluster has tens of queues, spread across its nodes, so the number of counters on each node is small.
- Whether `WatchNodeMetrics` and `WatchClusterMetrics` should signal a partial failure, so that one unreadable metric doesn't end every metric on the
  call. In v1 it does, and a persistent failure of one metric ends every call, unless the node leaves that metric out of
  its preamble. The design to add when a view needs it is an `Outage` message: one cause, with an id chosen by the node,
  the text for people, and scopes that each list some metrics and some subjects, or every subject. A later outage with
  the same id replaces the earlier one, and one with no scopes has ended. While an outage affects a series, its samples
  may be late or not come, and before it stops affecting a series the node sends a sample for it if its value changed. A
  node should send an outage only for series that it has already sent a sample for. An outage may also say whether the
  series are stalled or only delayed. Observatory would then list current outages by cause, and show a stalled series
  differently from one that may be out of date.
- Whether `WatchNodeMetrics` and `WatchClusterMetrics` take a filter of the metrics that the client wants, so that an engine doesn't measure the
  rest. It is added only when an engine defines metrics that the Observatory doesn't use, or when measuring every metric
  costs too much. A server that doesn't know the filter sends every metric, so adding it is safe.
- Which commits on the prototype branch go upstream to dogmatiq/runkit, other than those about the inspector.
