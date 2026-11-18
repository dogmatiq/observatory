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

- **Node**: one running process of an engine.
- **Cluster**: the nodes that share the work of one application between them.
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
- The Observatory picks the node that answers cluster-wide questions: it reads one connected node, the one whose
  `WatchMetrics` call began first, and moves to the next if that call ends. It calls every node, because metrics whose
  reach is the node need every node. The engine chooses no node. Every node answers questions about itself.
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
  node chooses how often it measures each metric, and the spec promises that once it has sent a sample on a stream, it
  sends a new one each time the value changes, including to zero. The spec has no signal that a subject no longer
  exists, because no v1 view or rule needs one. The Observatory can't know that it has seen every queue, so it never
  treats the queues that it knows as the complete set.
- A heartbeat is one concept. When an engine heartbeats, it tells every relevant listener: its cluster, through the
  database notification it sends today, and the Observatory, through the `EngineAPI`. In v1 of the spec a node sends
  only its own heartbeats and does not relay heartbeats received from other nodes.
- Each node sends the workloads that it believes it owns, and the set of nodes that it believes are live.
- Each `Sample` carries a `revision`: opaque bytes, compared byte by byte, that put the samples of one subject from a
  cluster's nodes in order. The node chooses what it holds, such as a timestamp or a logical clock. The ordering is a
  best effort with no promise, and a revision doesn't give how much time has passed. The Observatory shows the sample
  with the greatest revision, and tolerates revisions that are out of order.
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
- A running total is comparable only with values of the same running total from the same call, so the Observatory
  derives rates only within one call. Event stream lengths are not running totals, and are comparable across calls and
  nodes.
- The spec carries only the metrics that the cluster view and the health rules use, with one exception: the handler
  metrics for messages that are due, `HandlerCommandsDue` and `HandlerDeadlinesDue`, complete the set of handler metrics
  by request, and no v1 view reads them. A handler's pending events are one total across the cluster's own event
  streams, not a checkpoint per stream, and a workload is only its key, with a description for people. The prototype's
  other metrics are added, compatibly, when a view needs them.
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
- The footer shows no versions of Dogma, runkit or the application. The Observatory never loads application code, and the
  spec has no place for them: neither the engine API's preamble nor the metrics API's carries a version of anything. They
  return when the spec does.
- The three tiles and the handler cards are links in the prototype, to the streams, queues, cluster-nodes and handler
  pages. Those pages are not in v1.
- The prototype's navigation bar links to the streams, queues, cluster-nodes and per-type handler pages, which are not in
  v1.
- The handler card of an aggregate handler doesn't show active instances. The spec replaces them with the instances
  that a node holds in memory, which runkit doesn't support yet.
- A section of the cluster view whose metric the engine doesn't list in its preamble is hidden. In v1 that may include
  the aggregate instances per event stream and the unhandled events of each handler, if runkit can't count them within
  its budget.
- The cards and the queues tile use the spec's words, which keep their meaning though the grammar bends. A message kind on
  its own, such as "commands", "events", "deadlines" or "messages", is the ones that are pending, and its tooltip, later its
  popover, says "pending". The prototype said "command backlog", "event backlog" and "deadlines". Spelling "pending" out on
  every label made the process card's stats too wide for one row. "In progress" is the spec's word too. A process's
  instances that are bound to no queue are the last segment of its bar and are counted in "in progress".
- Failing messages are the red "+N" after the number that waits, such as "24 +1", on the queues tile and on a handler
  card, where the prototype had the number in red and the count in a line of its own along the bottom of the card. The
  failing messages are part of the ones that wait, so the number that is not red is those that are not failing. A line of
  its own made the card taller when messages began to fail, and moved the page. The red accent along the top of the card is
  unchanged.
- The cluster is teal-green where the prototype's was green, because green is for what is healthy on the site and universe
  views, and the cluster's own tile must not look healthy when its cluster isn't. The icon of each kind of handler has
  the color of the sticky note of the kind in event storming, where the prototype colored it by the messages that the
  kind works with: yellow for an aggregate, lilac for a process, pink for an integration and a lime green for a projection, which keeps it apart from the cluster's teal-green.
- The tooltip of the messages removed per minute doesn't say that the figure comes from PostgreSQL's table statistics,
  because the Observatory reads no database.
- Counts are exact and have no limit, so the Observatory never shows the prototype's "at least" form with a plus sign.
- The prototype shows "Reading the database for the first time" before its first reading. The Observatory doesn't read a
  database.

## Changes wanted to the cluster view

What has been asked for, in the order it came, to be settled before the site and universe views, because they reuse its
parts. Nothing here is built yet.

- Popovers in place of title text, for the bars and for everything else that has a tooltip.
- The same for a sparkline: pointing at a place on it shows the value there.
  - A sparkline scrolls, so the point under the pointer moves. Until a click, the readout is whatever is under the
    pointer. A click anchors it to that time, and the cursor then moves with the graph.
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
- The color mark that an identifier gets (below) comes from a palette that we control and that is reasonably large, so
  that two identifiers rarely share one.
- Identifiers. A UUID is inevitable on the page and it irks. It needs a special treatment, so that a person can tell
  one from another and knows what it is, without the 36 characters.
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
- A bar of the nodes that handled an integration's or a projection's messages could use the per-node rates of what the
  handler handled. The data is there, since each node reports its own totals, and Combine adds them up. A share of the
  rate would be volatile, so the shares would be smoothed with an exponentially weighted average. It says who did the
  work, not who owns it. For a handler that minimizes concurrency, one node doing all the work is the healthy bar, which
  reverses what an even bar means.
- Easter eggs for a sparkline with nothing to draw. Each would need to look unlike data, take no room, stay still under
  a request for reduced motion, and appear only when a chart really is empty, never in place of the sign that a figure is
  stale or unknown. A night sky of twinkling stars in the dark color mode was tried, with a shooting star, and parked: the
  stars did not read well enough, and the shooting star was too obvious to be an easter egg. The idea stays. An easter egg
  has to be subtle enough to be found by chance. It is in the history, at `3a30728`.
- Use the spec's words on the page: commands pending, events pending and deadlines pending for what the cards call
  backlogs, messages pending in the queues tile, and instances in progress, which is also the spec's word. The health
  rule that is called Backlog is about due messages, so it takes the spec's word "due" when the rules come back.
- The minimize-concurrency icon on a handler card shows a question-mark pointer when pointed at. An information icon would
  be the usual cue for a tooltip, but this is already a small icon, so the pointer should not suggest more help is behind
  it. A proper popover gives it its explanation.

### What a page shows when a metric isn't available

Decided. A slot is a place on a page that has a job, such as a tile's headline, its bar or a card's chart. Each slot has
the metric, or the group of metrics, that fills it, and the slot is removed when no node supports it, so that the page
responds to what the nodes can report and doesn't stretch what is available into a shape that was decided first. A tile
with nothing left is not shown. A slot has one candidate for now. Letting a slot fall back to a similar metric is
[dogmatiq/observatory#3](https://github.com/dogmatiq/observatory/issues/3).

- A metric that is supported and has no value yet is not a missing slot. A rate that has never been known is a dash,
  and one that is lost keeps its last value, fading to the muted colour, the one of a number that is zero, and becomes a
  dash after a minute.
- A part that begins or ends while a page is open grows in or shrinks away, with some animation, and not necessarily the
  same one for every part. Stats on a card appear and go without one so far.
- The state document says which: a part that no node supports is absent, and a rate that is supported and not yet known
  is an empty object.

### Changes asked for after the cluster view was built

- Failing counts are orange, and red is kept for health Issues. Done: the failing count and the accent along the top of
  a card with failing messages are orange (`--color-failing`, a red-orange). The "no live nodes" alarm stays red, because it is a
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
| A workload's description | `Workload` in the engine API | The cluster tile shows only the number of workloads. |
| A handler's and an application's Go type, and the messages that a handler uses | `configpb` | Only a handler's name, type and key are used. |
| A handler's failing messages split into commands and deadlines | `HandlerCommandsFailing`, `HandlerDeadlinesFailing` | The card shows one total. |
| Which nodes handled a handler's messages, and how many each | the per-node samples that `Combine` adds up | Only the sums are used. |
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
  - [x] **Metrics**: `Serve` also calls each node's `WatchMetrics`, and `Node.Metrics` holds what the node's current call
    has reported: its preamble, and the latest sample of each series, where a series is one metric of one subject.
    Of two samples of a series, the one with the greater revision is kept, and a later one wins a tie. Only metrics that
    the spec defines are kept. A sample's message is decoded, so that code that uses it reads typed fields. A call that
    ends leaves no values and `Node.MetricsErr`, and is made again after 5 seconds, except when the node answers
    UNIMPLEMENTED, which means that it reports no metrics. `Combine` turns the nodes of one cluster into what the
    cluster as a whole reports: for a metric whose reach is the cluster, the samples of one node, the one whose call
    began first; for a metric whose reach is the node, the sums over the nodes that are reporting, matched by their
    subject, which the spec now makes comparable among the nodes of one cluster. A call is made to every node, because the
    metrics whose reach is the node need every node. The cluster-reach samples of the nodes that aren't chosen are
    ignored, so a result never mixes values from different calls.
  - [x] **Rates and history**: rates from running totals within one call, and the history kept in memory for the
    sparklines and the heartbeat chart. A node sends a sample only when a value changes, so the Observatory takes a
    running total to stay the same until the next sample, and averages its growth over the last minute, or over the time
    it has been observed if that is shorter, with no rate before 5 seconds. A total that falls means that the node
    started again from zero, so the rate starts again too. Each call's rates are its own, and `Combine` adds the rates
    of nodes whose reach is the node, as it adds their values. A rate that any contributor can't give yet is none.
    The metrics that are running totals are a list in the Observatory, from the docs of the spec. The Observer keeps
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
    it to `Observer.Serve`, and `cmd/demo` serves it at `/tunnel`. A node must serve its gRPC server on the network and
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
    /api/clusters` and `GET /api/clusters/{id}` as JSON, and `GET /api/clusters/{id}/watch` as a stream of changes to what the page draws. The pages are `/`, a plain
    list of the clusters, each with its site or else the start of its ID, that stands in for the universe view, and `/clusters/{id}`. `cmd/demo` serves the API with a
    simulated cluster, which is the source of moving data for developing the page. The heartbeat levels and the scrolling
    sparklines are on the page.
  - [ ] **Smoke test**: a real engine with the Observatory, managed by the Observatory's CI.
  - [ ] **Beyond the cluster view**: its shortcomings, then the site view, then the universe view.
- [ ] **Near release, dogmatiq/protobuf**: the spec is added as a stable package, and runkit and the Observatory switch to
  it.

## Open
- A node that joins, or comes back, makes the cluster-wide rate of anything that nodes count unknown for five seconds,
  because a rate that any contributor can't give yet is none, so a `?` shows for that long. The demo does this now, because
  its nodes go down and come back. It belongs to the rule for what an unknown figure does, which is parked.
- Which node owns the workload of which handler. A workload is `{key, description}` and `Workloads` is the set that a node
  owns, so the Observatory can say how many workloads a node owns and not what they are for. A bar of the nodes that run
  an integration or a projection needs the spec to link a workload to a handler, or to the queue or event stream that it
  works on.
- A rule for what a rate that isn't known yet, or that may be stale, does on the page. Three questions: whether such a
  figure earns the space that it takes, by a test that we have still to write; whether the layout shift that it causes
  when it appears is worth it; and how to show that a figure may be stale with less visual weight than a `?`, such as a
  glitch or a fade on the text, which doesn't change the layout. The rules would differ for the large figures of a tile
  and for the figures that sit inside a line of prose. Come back to it with the site and universe views, which have the
  same figures in smaller places.
- The versions that the prototype's footer showed, of Dogma, the engine and the application, have no place in the spec.
  The engine API's preamble has a description for people and the application's identity, and neither the engine API nor
  the metrics API says what software a node runs. Whether the preamble gets a general list of named versions, or the
  facts are metrics, or the application's description carries its own version, is a spec decision.
- The observation budget's actual limits. They are set before the prototype's queries are ported.
- Where runkit keeps its counters of removed commands and deadlines: in memory on each node, which makes them
  node-scoped and restart from zero with the node, or in counter rows kept by triggers, which adds contention to the
  write path. A cluster has tens of queues, spread across its nodes, so the number of counters on each node is small.
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
- Which commits on the prototype branch go upstream to dogmatiq/runkit, other than those about the inspector.
