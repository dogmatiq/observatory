# Dogma Observatory v1

## Context

Dogma Observatory (also "Observatory") is a web app that shows what Dogma applications are doing. It is a TypeScript
backend and frontend that depends only on a protobuf spec, not on any engine.

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
- The connection is a tunnel. The engine dials the Observatory, and then serves gRPC over the connection it dialed. The
  Observatory is the gRPC client on that connection. The network direction is engine to Observatory, and the RPC
  direction is Observatory to engine, so the Observatory makes ordinary calls and opens server-streaming watches.
- The tunnel is tried first as a plain TLS connection with the HTTP/2 roles reversed. SSH, using a library in each
  language and no shelling out, is the alternative if the spike finds a reason for it.
- The TypeScript side must accept a connection and then act as an HTTP/2 client on it. A small spike proves this first.
  A Go backend is acceptable if it turns out to be needed, which is not expected.
- Over the tunnel, the engine serves every gRPC service it has, including the event stream service, because the
  Observatory will read event streams in the future. It is the engine's one gRPC server, the same one that serves the
  listen address.
- The tunnel has two layers of TLS. On the outer connection, the engine verifies the Observatory's certificate, as an
  ordinary TLS client. Inside the tunnel, the engine's gRPC server uses the same credentials as it does on its listen
  address. If those are mutual TLS, the Observatory must present a client certificate that the cluster accepts, so the
  Observatory still has to be given access to each cluster. Finer configuration can come later.
- One Observatory process in v1.

### Shape of the Observatory
- New repo. TypeScript backend and frontend. The frontend is an SPA or islands. The choice needs its own exploration.
- It builds against the protobuf spec, not against an engine. Tests replay responses that were captured from an engine
  or written by hand. A Go program that captures them may live in the repo if it is needed.
- One smoke test runs a real engine with the Observatory. It is managed entirely by the Observatory's CI. runkit has no
  awareness of the Observatory, only of the spec.
- Conformance of engines to the spec is not checked in the first release.
- No built-in login. Run it behind a proxy.
- The Observatory derives rates from the counters that engines send, and keeps its history in memory only.
- The app must be robust. When one component of a page fails, the rest of the page is still shown.

### Spec
- Developed in runkit first. The `.proto` files and generated code live in runkit for as long as needed, and
  dogmatiq/protobuf is not involved until release is close. Versioning is at API level within dogmatiq/protobuf.
- New `ObservationAPI` service, hosted by each engine and called by the Observatory through the tunnel.
- The `configpb` messages, with modification, are the model for describing an application. The `ObservationAPI` serves
  them. `configgrpc` (the `ConfigAPI` service) is dropped. The modifications are to be decided. `configpb` today has no
  message type IDs, no route direction and no concurrency preference, and its keys are Go type names.
- Each node sends its own node configuration, including its description of the application and any timings it uses.
  These may differ between the nodes of one cluster. The Observatory never assumes that a cluster has one configuration.
- Each message on a watch holds the full current figures, with full lists of queues and event streams. The number of
  queues and of event streams is low by design.
- A heartbeat is one concept. When an engine heartbeats, it tells every relevant listener: its cluster, through the
  database notification it sends today, and the Observatory, through the `ObservationAPI`. In v1 of the spec a node sends
  only its own heartbeats and does not relay heartbeats received from other nodes.
- Each node says how often it will send a heartbeat.
- Each node sends the workloads that it believes it owns, and the set of nodes that it believes are live.
- Answers to cluster-wide questions carry the database clock at the time of the reading. The Observatory shows the answer
  with the newest database time.
- How an engine declares which features it supports is deliberately not designed for now.

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
- One shared reading per interval, however many watches are open. The engine sets the interval.
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
- The cluster view MUST look exactly like the prototype's overview page, except where another decision in this plan makes
  that impossible. Those places are recorded below. The exact look is the starting point. Its shortcomings are addressed
  after it matches, and the work then moves up to the site and universe levels.
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
  - **Backlog**: a queue holds messages that are due, and the number of them has not fallen within 5 minutes of
    database time. The rule is defined by time because the engine, not the Observatory, is responsible for how often
    figures arrive.
  - **Membership**: each node sends the set of nodes that it believes are live. The members of a cluster are all the
    nodes in any of those sets. A cluster is unhealthy when any member is not reporting. A node is reporting when it
    sends heartbeats within the time it said it would.
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
| Handler cards, backlogs, bindings, checkpoints | Same figures. Their SQL and application calls move from the prototype into runkit. |
| Messages removed per minute (`pg_stat_user_tables`) | The engine reads the statistic and sends the counter. The Observatory derives the rate. |
| Events per minute, sparklines | Derived in the Observatory from successive counters. |
| Handler, queues, streams and cluster-nodes pages | Not in v1. The handler card on the cluster view is the handler level. |
| Message content, aggregate replay, and pages for one instance, queue, stream or message | After v1, as ordinary calls through the tunnel. |
| Works against a stopped cluster | Dropped. |
| SELECT-only database user | Dropped. The engine holds the only database access. |
| Server-rendered Go pages, htmx, SSE | Re-implemented in TypeScript to give the same look. |
| Prototype linked into the application | Dropped. The Observatory never loads application code. |
| Pointing the prototype at a cluster without touching it | Dropped. Each engine must be told where the Observatory is. |

## Visible differences from the prototype's overview

The cluster view must look exactly like the prototype's overview, so every place where it can't is recorded here. Keep
this list up to date as the plan evolves: add each new difference when it is found, and remove one that no longer applies.

- The heartbeat chart shows no heartbeats for a node that isn't connected to the Observatory. The prototype received
  every node's heartbeats from the database.
- The three tiles and the handler cards are links in the prototype, to the streams, queues, cluster-nodes and handler
  pages. Those pages are not in v1.
- The prototype's navigation bar links to the streams, queues, cluster-nodes and per-type handler pages, which are not in
  v1.
- The prototype shows "Reading the database for the first time" before its first reading. The Observatory doesn't read a
  database.

## Delivery order

- **Tunnel spike**: prove that a Node process can accept a connection from a Go engine and act as the gRPC client on it,
  over plain TLS.
- **Spec and engine side, in dogmatiq/runkit**: the `ObservationAPI` `.proto` files, documenting the meaning, unit and
  limits of each field, because the spec is the only contract. Then the cluster ID, the Observatory option, the site
  option and `WithGRPCServerOptions`, the tunnel, sending heartbeats to the Observatory, the description of the
  application, the port of the prototype's SQL and derivation code from its `observe` package, the observation budget and
  the schema changes.
- **Observatory repo**: TypeScript generated from runkit's `.proto` files, the tunnel's accepting side, what it holds in
  memory, and the health rules. Then the cluster view, matching the prototype's overview exactly, then its shortcomings,
  then the site view, then the universe view. The frontend exploration comes before the views. The smoke test belongs
  here.
- **Near release, dogmatiq/protobuf**: the spec and the modified `configpb` messages move into dogmatiq/protobuf, and
  runkit and the Observatory switch to them.

## Open
- Frontend: SPA or islands.
- The modifications to the `configpb` messages.
- The observation budget's actual limits. They are set before the prototype's queries are ported.
- Which commits on the prototype branch go upstream to dogmatiq/runkit, other than those about the inspector.
