/**
 * The data that the cluster view shows, in the form that the view draws it.
 *
 * Everything here is a plain number or string that the Observatory derives from
 * what a cluster's nodes report. A component never receives a protocol message.
 */

/**
 * Application is the application that a cluster runs.
 */
export interface Application {
	name: string;

	/** The key of the application's identity, which is a UUID. */
	key: string;

	/**
	 * The name of the site that the cluster that runs it is deployed to, if it has
	 * one. An application may run at several sites, so wherever the page names the
	 * application it names the site too.
	 */
	site?: string;
}

/**
 * Site is a site that clusters are deployed to.
 */
export interface Site {
	name: string;

	/** The key of the site's identity, which is a UUID. */
	key: string;
}

/**
 * Installation is one application at one site, which is what the application
 * view shows. An application that runs at no site has one installation, with
 * no site.
 */
export interface Installation {
	application: { name: string; key: string };

	/** The site, which is absent for the installation with no site. */
	site?: Site;
}

/**
 * SiteData is everything that the site view shows: the totals of the
 * applications at one site, or at no site, and each application.
 */
export interface SiteData {
	/** The site, which is absent for the applications at no site. */
	site?: Site;

	/**
	 * The events tile. Absent if no application's engine supports the events
	 * recorded.
	 */
	events?: {
		/** The events recorded per minute, across the applications. */
		rate: { perMinute?: number };

		/**
		 * The event streams of all the applications together, if any application's
		 * engine reports its streams: how many there are, and how many events they
		 * hold. An engine that appends every event to one stream has one.
		 */
		streams?: Streams;

		/**
		 * The share of the nodes at the site that report the events recorded, if
		 * only some of them do, as it is for a cluster's events tile. An application
		 * with no signal from any of its nodes counts as nodes that don't report.
		 */
		coverage?: number;

		/** The history of events recorded per minute. */
		history?: Chart;
	};

	/**
	 * The queues tile. Absent if no application's engine supports the messages in
	 * queues.
	 */
	queues?: {
		/** The number of messages that are waiting, across the applications. */
		messages: number;

		/**
		 * The number of queues of all the applications together, if any
		 * application's engine reports its queues. An engine that keeps every
		 * message in one queue has one.
		 */
		queues?: number;

		/** The number of those messages whose delivery is failing. */
		failing: number;

		/** The share of the nodes at the site that report the messages in queues. */
		coverage?: number;

		/** The messages handled per minute, if any engine supports it. */
		throughput?: { perMinute?: number };

		/** The history of the messages handled per minute. */
		history?: Chart;
	};

	/** The applications, in the order of their names. */
	applications: SiteApplication[];
}

/**
 * SiteApplication is what the site view shows of one application at the site.
 */
export interface SiteApplication {
	application: { name: string; key: string };

	/**
	 * The number of the application's nodes that are sending a signal. Zero if
	 * there is no signal from any of them.
	 */
	nodes: number;

	/**
	 * The share of the application's nodes that are sending a signal, if only some of
	 * them are. The application's figures are then the sums of those nodes.
	 */
	coverage?: number;

	/**
	 * The times at which the heartbeats that the applications tile's chart
	 * follows arrived, as [LiveNode.heartbeats] are: with a deadline, each
	 * heartbeat of any of the application's nodes that moved the deadline
	 * later, and without one, those of the node that sent the latest heartbeat.
	 * Empty while there is no signal from it.
	 */
	heartbeats: number[];

	/**
	 * The latest of the deadlines of the application's nodes, as
	 * [LiveNode.deadline] is, because the application is sending a signal while any of
	 * its nodes is. Absent if its nodes give no way to tell when their
	 * heartbeats expire.
	 */
	deadline?: number;

	/**
	 * The events recorded per minute, if the engine supports it, and the
	 * application's event streams, if the engine reports them.
	 */
	events?: { perMinute?: number; streams?: Streams };

	/** The messages that are waiting, if the engine supports it. */
	queues?: { messages: number; failing: number; queues?: number };
}

/**
 * Streams is some event streams: how many there are, and how many events they
 * hold together.
 */
export interface Streams {
	count: number;
	events: number;
}

/**
 * ClusterSummary is one cluster in the list of the clusters that the
 * Observatory knows.
 */
export interface ClusterSummary {
	/** The ID of the cluster, which is a UUID. */
	id: string;

	application: Application;

	/** The site that the cluster is deployed to, if it has one. */
	site?: Site;

	/**
	 * Whether any node of the cluster is reporting. A cluster that is not has been
	 * seen before, and is down.
	 */
	reporting: boolean;
}

/**
 * ClusterData is everything that the cluster view shows.
 */
export interface ClusterData {
	application: Application;

	/** The site that the cluster is deployed to, if it has one. */
	site?: Site;

	/** The software that the cluster's nodes run, if the document says. */
	software?: Software;

	overview: OverviewData;

	/**
	 * True if no node of the cluster is reporting. What the overview shows is then
	 * what it showed when a node last reported, and is not to be trusted.
	 */
	down?: boolean;
}

/**
 * ChartPoint is one value of a chart, and the time that the value was
 * observed.
 */
export interface ChartPoint {
	/**
	 * The time of the observation, in milliseconds before the moment that the
	 * server produced the chart, so it is never positive.
	 */
	at: number;

	/** The value, in the unit that the chart shows. Never negative. */
	value: number;
}

/**
 * Chart is the history that a sparkline draws.
 */
export interface Chart {
	/**
	 * The time at the right-hand edge of the chart, on the same scale as the
	 * points. The server gives 0, which is the moment that it produced the
	 * chart. The page adds the time that has passed since it received the chart,
	 * so that the chart scrolls between updates.
	 */
	end: number;

	/** The values to draw, in the order that they were observed. */
	points: ChartPoint[];
}

/**
 * SpreadPart is one thing in a spread, such as an event stream among the
 * cluster's event streams.
 */
export interface SpreadPart {
	/** The identity of the thing, from which a short form is shown. */
	id: string;

	/** How much of the spread is in this thing. */
	size: number;
}

/**
 * LiveNode is a node that the cluster has live, and the workloads that it owns.
 */
export interface LiveNode {
	id: string;

	/**
	 * The number of workloads that the node owns. Absent for a node that doesn't
	 * report its workloads or hasn't yet, and for one that isn't connected.
	 */
	workloads?: number;

	/**
	 * The times at which the node's recent heartbeats arrived at the
	 * Observatory, in milliseconds before the moment that the server produced
	 * this, oldest first. Empty for a node that is not connected to the
	 * Observatory.
	 */
	heartbeats: number[];

	/**
	 * The time by which the node's next heartbeat is due, in milliseconds after
	 * the moment that the server produced this. Absent if the node gives no way
	 * to tell when its heartbeats expire.
	 */
	deadline?: number;
}

/**
 * Counted is what the throughput of the queues tile counts.
 */
export type Counted =
	| "handled"
	| "removed"
	| "commands handled"
	| "deadlines handled";

/**
 * OverviewData is everything that the cluster view's three tiles and handler
 * cards show.
 */
export interface OverviewData {
	/**
	 * The events tile. Absent if the nodes support neither the length of event
	 * streams nor the events recorded. Each part of it is absent if no node
	 * supports the metric that it is made from, and the tile leaves it out.
	 */
	events?: {
		/**
		 * The events recorded per minute. Absent if no node supports it. Its
		 * `perMinute` is absent while the Observatory can't give it yet, and is
		 * shown rounded.
		 */
		rate?: { perMinute?: number };

		/** The length of each of the cluster's event streams, in events. */
		streams?: SpreadPart[];

		/**
		 * True if the engine appends every event to one event stream, as every
		 * node says, so that the one stream in `streams` is the only one there is.
		 */
		oneStream?: boolean;

		/**
		 * The share of the cluster's nodes, from 0 to 1, that report what the tile
		 * is made from, if only some of them do, such as while a deploy is under
		 * way. Its numbers are then the sums of the nodes that do. Absent if every
		 * node reports all of it.
		 */
		coverage?: number;

		/** The history of events recorded per minute, which goes with `rate`. */
		history?: Chart;
	};

	/**
	 * The queues tile. Absent if the nodes support neither the messages in queues
	 * nor their removal. Each part of it is absent if no node supports the metric
	 * that it is made from, and the tile leaves it out.
	 */
	queues?: {
		/** The share of the nodes that report what the tile is made from. */
		coverage?: number;

		/** The number of messages in each of the cluster's queues. */
		queues?: SpreadPart[];

		/**
		 * True if the engine keeps every message in one queue, as every node says,
		 * so that the one queue in `queues` is the only one there is.
		 */
		oneQueue?: boolean;

		/** The number of messages whose delivery is failing. */
		failing: number;

		/**
		 * The messages removed from the queues per minute. Absent if no node
		 * supports it. Its `perMinute` is absent while the Observatory can't give
		 * it yet.
		 */
		throughput?: {
			perMinute?: number;

			/**
			 * What it counts: the messages that handlers have handled, those that are
			 * removed from the queues, or only the commands, or only the deadlines,
			 * that handlers have handled.
			 */
			of: Counted;
		};

		/** The history of the messages removed per minute, which goes with `throughput`. */
		history?: Chart;
	};

	/**
	 * The nodes of an engine that clusters. Absent for an engine that doesn't,
	 * which has `engine` instead.
	 */
	cluster?: {
		/** The nodes that are live, with the workloads that each owns. */
		nodes: LiveNode[];

		/**
		 * True if any node says that it reports the workloads that it owns. An
		 * engine whose nodes don't report them is shown as one that doesn't divide
		 * its work into workloads.
		 */
		reportsWorkloads?: boolean;
	};

	/**
	 * The process of an engine that doesn't cluster, which always runs as a single
	 * process. Absent for an engine that clusters, which has `cluster` instead.
	 */
	engine?: {
		/** The engine's process, if it is live. */
		node?: LiveNode;
	};

	handlers: HandlerData[];
}

/**
 * Software is the software that the nodes of a cluster that report run, as
 * their preambles give it.
 */
export interface Software {
	/**
	 * The name of the engine's software, if every node that reports gives the
	 * same one. Absent if two give different names.
	 */
	engineName?: string;

	/**
	 * The lowest and the highest of the versions of the engine's software that
	 * the nodes give, by the precedence of Semantic Versioning, which are the same
	 * if every node gives the same one. Absent if no node gives one, or if the
	 * nodes give different engine names.
	 */
	engineVersions?: { lowest: string; highest: string };

	/**
	 * The version of the application, if every node that gives one gives the
	 * same. Absent if no node gives one, or if two give different ones.
	 */
	applicationVersion?: string;

	/** True if two nodes give different versions of the application. */
	applicationVersionsDiffer?: boolean;
}

export type HandlerKind =
	| "aggregate"
	| "process"
	| "integration"
	| "projection";

/**
 * HandlerData is what one handler's card shows.
 */
export interface HandlerData {
	/** Identifies the handler, and is unique within the application. */
	key: string;

	name: string;
	kind: HandlerKind;

	/** True if the handler is disabled. */
	disabled?: boolean;

	/**
	 * The share of the cluster's nodes that report what the card is made from, if
	 * only some of them do, as it is for the events tile.
	 */
	coverage?: number;

	/** True if the handler asks the engine to minimize concurrency. */
	minimizesConcurrency?: boolean;

	/** The facts about the handler. */
	summary: HandlerSummary;

	/**
	 * The kind of message that `history` counts, which the card shows in the
	 * color of its chart, as events if it is absent.
	 */
	charted?: "events" | "commands";

	/**
	 * The history of what the handler works with, per minute: the events that an
	 * aggregate records, that a process or a projection handles, or that an
	 * integration records, or else the commands that it handles. Absent if the
	 * nodes don't report it.
	 */
	history?: Chart;

	/**
	 * How the work of an integration or a projection is spread over the nodes
	 * that handled its messages, ordered by node ID so that the segments of a bar
	 * of them keep their places. Absent for other handlers, and for one whose
	 * nodes don't report what they handled, and then the card has no such bar.
	 */
	nodes?: HandlerNode[];
}

/**
 * HandlerNode is the work that one node did for a handler.
 */
export interface HandlerNode {
	/** The ID of the node. */
	id: string;

	/**
	 * How many messages per second the node handled for the handler, as an
	 * average that is smoothed over a while. Only its share of all the nodes'
	 * rates matters to a bar, so the unit is of no importance there.
	 */
	rate: number;
}

/**
 * HandlerSummary is the facts about a handler, which the facts that a card shows
 * for each kind of handler are chosen from.
 */
export interface HandlerSummary {
	/** The number of messages that are failing. Zero if it isn't reported. */
	failing: number;

	/**
	 * The number of aggregate instances. Only an aggregate has them, and it is
	 * absent if the engine doesn't report them.
	 */
	instances?: number;

	/**
	 * The number of instances that recorded an event recently, with the popover
	 * that explains it. Only an aggregate has them, and the card shows them only
	 * when this is given.
	 */
	activeInstances?: { count: number; title: string };

	/**
	 * The number of commands or deadlines that the handler has queued. Absent
	 * if the engine doesn't report it.
	 */
	queuedMessages?: number;

	/**
	 * The number of events that the handler has yet to handle. Absent if the
	 * engine doesn't report it.
	 */
	unhandledEvents?: number;

	/** True if a process handler schedules deadlines. */
	schedulesDeadlines?: boolean;

	/**
	 * How the handler's instances are spread across the event streams, for an
	 * aggregate, or across the deadline queues, for a process that schedules
	 * deadlines. Absent if no node supports the metric that it is made from, and
	 * then the card has neither the bar nor, for a process, the number in
	 * progress.
	 */
	bindings?: Binding[];
}

/**
 * Binding is the instances of a handler that are bound to one event stream or
 * deadline queue.
 */
export interface Binding {
	/** The identity of the stream or queue, or undefined if there is none yet. */
	id: string | undefined;

	/** The number of instances bound to it. */
	instances: number;
}

/**
 * The state document that the Observatory keeps a cluster's page up to date
 * with, as the page reads it. It describes the cluster's data, and nothing about
 * how a page shows it: every collection is an object keyed by ID, and the page
 * decides the order and the presentation.
 *
 * A rate is in the unit x/s, such as events per second, and a rate that is
 * absent is one that the Observatory can't give yet. The page decides how to
 * show a rate.
 */
export interface ClusterDocument {
	application: Application;

	/**
	 * The cluster, if the engine runs as one. Absent for an engine that doesn't,
	 * which has only itself in `nodes`.
	 */
	cluster?: {
		/** True if any node says that it reports the workloads that it owns. */
		reportsWorkloads?: boolean;
	};

	/**
	 * The cluster's members, by node ID, or, for an engine that doesn't run as a
	 * cluster, the engine itself while it is reporting.
	 */
	nodes: Record<string, { workloads?: number }>;

	/**
	 * The length of each event stream, by ID. Absent if no node supports it.
	 */
	eventStreams?: Record<string, { length: number }>;

	/** True if every node says that its engine appends every event to one stream. */
	oneStream?: boolean;

	/**
	 * The number of messages in each queue, by ID. Absent if no node supports it.
	 */
	queues?: Record<string, { messages: number }>;

	/** True if every node says that its engine keeps every message in one queue. */
	oneQueue?: boolean;

	/** The number of messages whose delivery is failing, across the queues. */
	failing?: number;

	rates?: {
		/**
		 * The events recorded per second. Absent if no node supports it, and
		 * empty while the Observatory can't give it yet.
		 */
		events?: { rate?: number };

		/**
		 * The messages that the queues get through per second, likewise, and what
		 * they are, in `of`.
		 */
		throughput?: { rate?: number; of?: string };
	};

	/** The cluster's handlers, by key. */
	handlers: Record<string, HandlerDocument>;
}

/**
 * HandlerDocument is what the document says about one handler.
 */
export interface HandlerDocument {
	name: string;
	kind: HandlerKind;
	disabled?: boolean;
	minimizesConcurrency?: boolean;
	failing?: number;
	instances?: number;
	queued?: number;
	unhandledEvents?: number;
	schedulesDeadlines?: boolean;

	/** The kind of message that the handler's time series counts. */
	charted?: "events" | "commands";

	/** The instances bound to each event stream or queue, by its ID. */
	bindings?: Record<string, { instances: number }>;

	/**
	 * The instances of a process that are in progress and bound to no queue, if
	 * there are any.
	 */
	unbound?: number;

	/**
	 * What each node handled for an integration or a projection, by node ID,
	 * as a rate in x/s that is smoothed over a while. Absent for other kinds of
	 * handler, and when the nodes don't report what they handled.
	 */
	nodes?: Record<string, { rate: number }>;
}
