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
}

/**
 * ClusterSummary is one cluster in the list of the clusters that the
 * Observatory knows.
 */
export interface ClusterSummary {
	/** The ID of the cluster, which is a UUID. */
	id: string;

	application: Application;

	/** The name of the site that the cluster is deployed to, if it has one. */
	site?: string;
}

/**
 * ClusterData is everything that the cluster view shows.
 */
export interface ClusterData {
	application: Application;
	overview: OverviewData;
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

	/** The number of workloads that the node owns. */
	workloads: number;

	/**
	 * The times at which the node's recent heartbeats arrived at the
	 * Observatory, in milliseconds before the moment that the server produced
	 * this, oldest first. Empty for a node that is not connected to the
	 * Observatory.
	 */
	heartbeats: number[];
}

/**
 * OverviewData is everything that the cluster view's three tiles and handler
 * cards show.
 */
export interface OverviewData {
	/**
	 * The events tile. Absent if the engine doesn't report the length of event
	 * streams.
	 */
	events?: {
		/**
		 * The events recorded per minute, which is shown rounded. Absent while the
		 * Observatory can't give it yet, or if the engine doesn't report it.
		 */
		perMinute?: number;

		/** The length of each of the cluster's event streams, in events. */
		streams: SpreadPart[];

		/** The history of events recorded per minute. */
		history: Chart;
	};

	/**
	 * The queues tile. Absent if the engine doesn't report the messages in
	 * queues.
	 */
	queues?: {
		/** The number of messages in each of the cluster's queues. */
		queues: SpreadPart[];

		/** The number of messages whose delivery is failing. */
		failing: number;

		/**
		 * The messages removed from the queues per minute. Absent while the
		 * Observatory can't give it yet, or if the engine doesn't report it.
		 */
		removedPerMinute?: number;

		/** The history of the number of messages in the queues. */
		history: Chart;
	};

	cluster: {
		/** The nodes that are live, with the workloads that each owns. */
		nodes: LiveNode[];
	};

	handlers: HandlerData[];
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

	/** True if the handler asks the engine to minimize concurrency. */
	minimizesConcurrency?: boolean;

	/** The facts about the handler. */
	summary: HandlerSummary;

	/** The history of events recorded or handled per minute, if it has one. */
	history?: Chart;
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
	 * The number of instances that recorded an event recently, with the tooltip
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
	 * deadlines.
	 */
	bindings: Binding[];
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

	/** The cluster's members, by node ID. */
	nodes: Record<string, { workloads: number }>;

	/**
	 * The length of each event stream, by ID. Absent if the engine doesn't report
	 * event streams, which hides the events tile.
	 */
	eventStreams?: Record<string, { length: number }>;

	/**
	 * The number of messages in each queue, by ID. Absent if the engine doesn't
	 * report them, which hides the queues tile.
	 */
	queues?: Record<string, { messages: number }>;

	/** The number of messages whose delivery is failing, across the queues. */
	failing?: number;

	rates?: {
		/** The events recorded per second. */
		events?: number;

		/** The messages removed from the queues per second. */
		removed?: number;
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

	/** The instances bound to each event stream or queue, by its ID. */
	bindings?: Record<string, { instances: number }>;
}
