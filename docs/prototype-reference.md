# The prototype, for reference

The Observatory replaces a prototype, the Go inspector. This document records the facts about the prototype that the
[v1 plan](.plans/2026-11-14-observatory-v1.md) depends on, so that the Observatory can be built without reading all of its
code first.

The prototype is the `inspector` branch of [jmalloc/runkit](https://github.com/jmalloc/runkit), at commit `0f099ce`. All
paths below are in that repository. The prototype's own documents are the authority on its rules:
`docs/maintainers/inspector.md`, `docs/maintainers/inspector-design.md` and
`docs/maintainers/inspector-schema-changes.md`.

## How the prototype is built

- `inspector.New(app, db)` returns an `http.Handler` that is linked into the application's process. It reads the engine's
  PostgreSQL database in read-only transactions with a 5 second statement timeout, and has no persistent storage of its
  own.
- Pages are `html/template` files in `internal/inspector/pages/templates`, rendered on the server and cached for 1 second
  per URL. Every page works without JavaScript.
- The browser code is `internal/inspector/pages/static/inspector.js` (404 lines, hand-written) and `theme.js`. The styling
  is `inspector.css`, which is 1,339 lines of plain CSS.
- htmx 2.0.11 and the idiomorph morph extension are loaded from a CDN. The main element of each page asks for its own
  URL again whenever the server sends an `observed` event, and morphs the result into the page.
- Live updates come from server-sent events at `/live`. The events are `hello` (carries a hash of the templates and
  static files, so a page reloads when the server restarts with new code), `observed`, and `heartbeat` (a node ID, sent
  as soon as the heartbeat is heard).
- The server draws sparklines and bars as inline SVG, in `pages/render.go` and `pages/bars.go`. Icons are inline SVG in
  `pages/icons.go`. The browser draws only one chart, the heartbeat chart, a `<canvas>` that `inspector.js` fills from
  `heartbeat` events.
- `inspector.js` also ticks relative times every 500 milliseconds, pulses the elements of a node when its heartbeat
  arrives, scrolls the sparklines with `requestAnimationFrame`, and keeps the theme choice in local storage.
- The page layout, `_layout.html`, puts a navigation bar and an `<h1>` on every page except the overview. The navigation
  bar links to the streams, queues, cluster and per-handler-type pages. Before the first reading exists, the overview shows
  "Reading the database for the first time".

## The overview page

`overview.html` is the page that the cluster view must match. It has no `<h1>`, and it runs no database queries when it
is rendered. It shows the latest observation and a history of samples.

**Three tiles**, each a link:

- **Events**, linking to the streams page. The headline is events per minute, averaged over the last 8 rates. The detail
  is the total number of events and the number of event streams. It has a bar of stream sizes and a sparkline of the rate
  over 1 minute.
- **Queues**, linking to the queues page. The headline is the number of messages in queues. The detail is the number of
  queues, messages removed per minute (or `?` with the error as a tooltip), and the number of messages that are failing,
  in red when it is above 0. It has a bar of messages per queue and a sparkline of the number of messages in queues over
  1 minute.
- **Cluster**, linking to the cluster page. The headline is the number of live nodes, or `?` while the heartbeats have
  not been heard for long enough. The detail is the number of workloads. It has a bar of workloads per node and the
  heartbeat chart.

**One card per handler**, each a link to the handler's page. A card shows:

- the name, the handler type, a "disabled" marker, and an icon for a handler that minimizes concurrency;
- a red failing state, "N messages failing";
- numbers that depend on the handler type: an aggregate shows instances, active instances and its command backlog; a
  process shows instances in progress, its event backlog and its deadlines; an integration shows its command backlog; a
  projection shows its event backlog;
- a bar of bindings (aggregates by event stream, processes that schedule deadlines by deadline queue);
- a sparkline of events recorded or handled per minute, which an integration that records no events does not have.

The same cards are on the pages for each handler type (`/aggregates`, `/processes`, `/integrations` and
`/projections`).

## The prototype's other pages

None of these are in v1. The overview or its navigation bar links to most of them.

| Route | Shows |
|---|---|
| `/aggregates`, `/processes`, `/integrations`, `/projections` | The handler cards of one handler type. |
| `/cluster` | A card for each node, with the queues it delivers messages from, its event stream workloads for each handler, and its last heartbeat. |
| `/queues`, `/queues/{id}` | A table of all queues. One queue and its messages. |
| `/streams`, `/streams/{id}` | A table of event streams. One stream with handler progress and its events. |
| `/handlers/{key}` | One handler: facts, progress, instances, deadlines, queued commands and routes. |
| `/handlers/{key}/instances/{id}` | One aggregate or process instance, including a replay of up to 10,000 events. |
| `/messages/{id}` | One queued message or event, with its envelope and decoded content. |

## What the overview is built from

The prototype's `observe` package (`internal/inspector/observe`, about 3,500 lines) produces an `Observation` and keeps a
history of 600 samples in memory. Its main fields are:

- the time of the reading, from the database clock and from the local clock, and an error for the whole reading;
- the live nodes, and the workloads of each node;
- the queues, each with its number of messages, its number of deadlines, how many messages are due, how many are failing,
  the most failures of one message, when the first failure began, and how long a message has been due;
- the event streams, with their lengths;
- messages removed, as a total;
- the handlers, each with its instance counts, active instances, bindings, progress on each stream, backlog, the number of
  messages that are failing, and last compaction. Each of these has its own error field.

Each `Sample` in the history holds the totals of events, messages in queues and removed messages, and events for each
handler. The overview derives its rates from successive samples.

The prototype reads each figure from one of these sources:

| Figure | Source |
|---|---|
| The application bound to the database | SQL on `application.identity` |
| Live nodes, last heartbeat | `LISTEN` on the `signal` channel, topic `heartbeat.<node-id>`, with a local 5 second timeout |
| Workloads of each node | `cluster.FindWorkloadOwner` in runkit's internal packages, over the computed live set |
| Queues, counts of messages in them, failure streaks | SQL on `messagequeue.messages` |
| Messages removed per minute | SQL on `pg_stat_user_tables` (`n_tup_del`) |
| Event streams and lengths | SQL on `eventstream.streams` |
| Active aggregate instances | SQL on `eventstream.events` |
| Aggregate and process instances, bindings | SQL on `aggregate.instances` and `process.instances` |
| Progress of a process on an event stream | SQL on `eventstream.handler_checkpoints` |
| Progress of a projection on an event stream | The application's `CheckpointOffset` method |
| Last compaction | SQL on `projection.handlers` |
| Handler names, handler types, routes, concurrency preference | The application's `Configure` method |
| Events per minute | Derived in the observer from successive `streams.next_offset` readings |

## How often it refreshes, and its limits

- A reading starts at least 1 second after the previous one ends. It then waits for any engine signal except a heartbeat,
  or at most 3 seconds.
- The slow parts (handler backlogs, bindings, progress, active instances and the progress of projections) are read at most
  every 5 seconds, so a handler card can be several seconds older than the rest of the page.
- Heartbeats are pushed at once and are never queried.
- Lists of queues and streams stop at 1,000 rows. Counts of instances, bindings and unhandled events stop at 10,000 and are
  marked "at least".

## How it handles failure

- Most parts of an observation fail on their own, and each shows "Unable to read this." with the error, or a `?` with the
  error as a tooltip.
- A panic in application code is recovered and shown as that part's error.
- There is no marker for how old a card's data is. When a whole reading fails, no template shows it. The client shows
  nothing when `/live` is disconnected, and reconnects after 1 second.

## Dependencies of the prototype

The Observatory has to replace each of these with data from the spec:

- runkit's `internal/cluster` (`FindWorkloadOwner`), and its own copy of the heartbeat topic, channel and timeout;
- runkit's `internal/x/xsql` (UUID scanning) and `internal/x/xerrors` (recovering panics from application code);
- enginekit's `config` and `config/runtimeconfig`, `message` and `uuidcollection` packages;
- dogma's `Application`, the aggregate, process and projection handler interfaces, and `RegisteredMessageTypeByID`;
- dogmatiq/protobuf's `uuidpb`, `identitypb` and `envelopepb`.
