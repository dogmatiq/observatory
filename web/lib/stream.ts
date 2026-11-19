import type {
	Application,
	Binding,
	Chart,
	ClusterData,
	HandlerData,
	HandlerKind,
	HandlerNode,
	LiveNode,
	OverviewData,
	SpreadPart,
} from "../model.ts";

/**
 * How long the page keeps the points of a chart, in milliseconds. The charts
 * show the last minute, and the extra seconds let them scroll without a gap at
 * the left-hand edge.
 */
export const chartWindow = 70_000;

/**
 * How many of a node's recent heartbeats the page keeps. They give the node's
 * usual interval between heartbeats.
 */
export const recentBeats = 9;

/**
 * RatePoint is the value of a chart's number at a moment, as the page keeps it.
 */
export interface RatePoint {
	/** The time of the point, on the clock that the page was given. */
	at: number;

	/** The value, in the unit of the chart's number. */
	value: number;
}

/**
 * Snapshot is everything that the stream has told the page about a cluster, in
 * the form that the page keeps it. The times are on the page's clock, so a
 * snapshot doesn't change as time passes.
 */
export interface Snapshot {
	/**
	 * The state document, which is what the stream's patches have built. It is
	 * never changed in place, and what the page doesn't trust until it reads it.
	 */
	document: unknown;

	/** The points of each time series, by the series' name. */
	series: ReadonlyMap<string, readonly RatePoint[]>;

	/** When each node's recent heartbeats arrived, by node ID, oldest first. */
	beats: ReadonlyMap<string, readonly number[]>;
}

const emptySnapshot: Snapshot = {
	document: {},
	series: new Map(),
	beats: new Map(),
};

/**
 * StreamEvent is one message of the stream.
 */
export type StreamEvent =
	/** The document is changed by this merge patch. */
	| { kind: "changed"; patch: Record<string, unknown> }
	/** These points are added to the time series. */
	| {
			kind: "recorded";
			series: string;
			points: [msBefore: number, value: number][];
	  }
	/** A heartbeat from the node arrived, this long before the message. */
	| { kind: "heartbeat"; node: string; msBefore: number }
	/** The burst of messages that begins each connection is complete. */
	| { kind: "synced" };

/** The names of the messages that the stream sends. */
export const messageNames = [
	"changed",
	"recorded",
	"heartbeat",
	"synced",
] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const isNumber = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);

/**
 * parseEvent returns the event that a message of the stream is, given its name
 * and its data. It returns undefined if the message isn't one that the stream
 * sends, or isn't well formed.
 */
export function parseEvent(
	name: string,
	data: string,
): StreamEvent | undefined {
	let body: unknown;
	try {
		body = JSON.parse(data);
	} catch {
		return undefined;
	}

	if (!isObject(body)) {
		return undefined;
	}

	switch (name) {
		case "changed":
			return { kind: "changed", patch: body };

		case "recorded": {
			const { series, points } = body;
			if (
				typeof series === "string" &&
				Array.isArray(points) &&
				points.every(
					(p) => Array.isArray(p) && p.length === 2 && p.every(isNumber),
				)
			) {
				return {
					kind: "recorded",
					series,
					points: points as [number, number][],
				};
			}
			return undefined;
		}

		case "heartbeat":
			if (typeof body.node === "string" && isNumber(body.msBefore)) {
				return { kind: "heartbeat", node: body.node, msBefore: body.msBefore };
			}
			return undefined;

		case "synced":
			return { kind: "synced" };

		default:
			return undefined;
	}
}

/** Returns a copy of `object` with the field set, even if its name is odd. */
function withField(
	object: Record<string, unknown>,
	name: string,
	value: unknown,
): Record<string, unknown> {
	const copy = { ...object };
	Object.defineProperty(copy, name, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
	return copy;
}

/**
 * mergePatch returns the result of changing `target` by `patch`, as RFC 7396
 * says. A patch that is an object changes an object: each of its fields is
 * merged into the field of the same name, a field that is null is removed, and
 * a patch that isn't an object, including an array, replaces what it changes.
 * It doesn't change either of its arguments.
 */
export function mergePatch(target: unknown, patch: unknown): unknown {
	if (!isObject(patch)) {
		return patch;
	}

	let result: Record<string, unknown> = isObject(target) ? target : {};

	for (const [name, value] of Object.entries(patch)) {
		if (value === null) {
			if (Object.hasOwn(result, name)) {
				const { [name]: _removed, ...rest } = result;
				result = rest;
			}
		} else {
			result = withField(result, name, mergePatch(result[name], value));
		}
	}

	return result;
}

/**
 * apply returns the snapshot after an event that arrived at the time `now`. It
 * doesn't change the snapshot that it is given.
 */
export function apply(
	snapshot: Snapshot,
	event: StreamEvent,
	now: number,
): Snapshot {
	switch (event.kind) {
		case "changed": {
			const document = mergePatch(snapshot.document, event.patch);

			// The points of a handler's chart go when the handler does.
			const handlers = isObject(document) ? document.handlers : undefined;
			const series = new Map(snapshot.series);
			for (const name of series.keys()) {
				const key = name.startsWith("handlers/")
					? name.slice("handlers/".length)
					: undefined;
				if (
					key !== undefined &&
					!(isObject(handlers) && Object.hasOwn(handlers, key))
				) {
					series.delete(name);
				}
			}

			return { ...snapshot, document, series };
		}

		case "recorded": {
			const added = event.points.map(([msBefore, value]) => ({
				at: now - msBefore,
				value,
			}));
			const series = new Map(snapshot.series);
			series.set(
				event.series,
				[...(snapshot.series.get(event.series) ?? []), ...added].filter(
					(p) => p.at >= now - chartWindow,
				),
			);
			return { ...snapshot, series };
		}

		case "heartbeat": {
			const beats = new Map(snapshot.beats);
			beats.set(
				event.node,
				[...(snapshot.beats.get(event.node) ?? []), now - event.msBefore].slice(
					-recentBeats,
				),
			);
			return { ...snapshot, beats };
		}

		case "synced":
			return snapshot;
	}
}

/**
 * WatchStatus is what the page can tell about a cluster that it watches.
 */
export type WatchStatus = "loading" | "ready" | "stale" | "failed" | "unknown";

/**
 * WatchState is what the page knows of a cluster, as it watches it.
 */
export interface WatchState {
	status: WatchStatus;

	/**
	 * The latest complete snapshot. It is undefined until the first burst of
	 * messages ends.
	 */
	snapshot?: Snapshot;

	/**
	 * The snapshot that the burst at the start of the current connection is
	 * building, until it ends and replaces `snapshot`. A burst begins with
	 * every connection, so a component that has gone since the last one is not
	 * kept, and a page that is shown meanwhile isn't changed by a half-made
	 * snapshot.
	 */
	building?: Snapshot;

	/** The time of the latest change to `snapshot`, on the page's clock. */
	at: number;
}

export type WatchAction =
	/** Nothing is known about the cluster. */
	| { type: "reset" }
	/** The stream connected, so a burst of messages begins. */
	| { type: "connected" }
	/** A message of the stream arrived. */
	| { type: "message"; name: string; data: string; now: number }
	/** The stream broke, or the Observatory couldn't be read. */
	| { type: "broken" }
	/** The Observatory has no such cluster. */
	| { type: "unknown" };

export const initialWatchState: WatchState = { status: "loading", at: 0 };

/**
 * watchReducer returns what the page knows of a cluster after something
 * happens, which is a message of the stream, or a change in the connection.
 *
 * Until the first burst ends there is nothing to show, and a message that isn't
 * well formed makes the page stale, or failed if there is nothing to keep.
 */
export function watchReducer(
	state: WatchState,
	action: WatchAction,
): WatchState {
	switch (action.type) {
		case "reset":
			return initialWatchState;

		case "unknown":
			return { status: "unknown", at: 0 };

		case "connected":
			return { ...state, building: emptySnapshot };

		case "broken":
			return degrade(state);

		case "message": {
			const event = parseEvent(action.name, action.data);
			if (event === undefined) {
				return degrade(state);
			}

			if (event.kind === "synced") {
				const done = state.building;
				if (
					done === undefined ||
					!isObject(done.document) ||
					!isObject(done.document.application)
				) {
					return degrade(state);
				}
				return { status: "ready", snapshot: done, at: action.now };
			}

			// A message that isn't in a burst changes the snapshot that is shown.
			// One that comes with no burst begun, because the page has seen no
			// connection, begins one.
			if (state.building !== undefined || state.snapshot === undefined) {
				return {
					...state,
					building: apply(state.building ?? emptySnapshot, event, action.now),
				};
			}

			return {
				...state,
				snapshot: apply(state.snapshot, event, action.now),
				at: action.now,
			};
		}
	}
}

/**
 * degrade is the state after something goes wrong: the page keeps what it has,
 * as stale, or has failed if it has nothing.
 */
function degrade(state: WatchState): WatchState {
	return state.snapshot === undefined
		? { ...state, status: "failed" }
		: { ...state, status: "stale" };
}

/**
 * chartOf returns the chart of a series of points, with its time measured from
 * `ref`, which is a time on the page's clock, and each value multiplied by
 * `factor`, such as 60 for a series of rates per second that the chart shows per
 * minute, as the rate beside it is.
 */
function chartOf(
	points: readonly RatePoint[] | undefined,
	ref: number,
	factor = 1,
): Chart {
	return {
		end: 0,
		points: (points ?? []).map((p) => ({
			at: p.at - ref,
			value: p.value * factor,
		})),
	};
}

/** Returns the result of `read`, or undefined if reading throws. */
function attempt<T>(read: () => T): T | undefined {
	try {
		return read();
	} catch {
		return undefined;
	}
}

/** Returns what the throughput counts, which is the messages removed if it isn't said. */
function throughputOf(v: unknown): "handled" | "removed" | "partly handled" {
	return v === "handled" || v === "partly handled" ? v : "removed";
}

/** Returns a field that must be a number. */
function number(v: unknown, what: string): number {
	if (!isNumber(v)) {
		throw new Error(`${what} is not a number`);
	}
	return v;
}

/** Returns a field that may be a number, or is absent. */
function maybeNumber(v: unknown, what: string): number | undefined {
	return v === undefined ? undefined : number(v, what);
}

/** Returns a field that must be an object. */
function object(v: unknown, what: string): Record<string, unknown> {
	if (!isObject(v)) {
		throw new Error(`${what} is not an object`);
	}
	return v;
}

/** Returns the fields of an optional object, or none if it is absent. */
function entries(
	v: unknown,
	what: string,
): [string, Record<string, unknown>][] {
	if (v === undefined) {
		return [];
	}
	return Object.entries(object(v, what)).map(([id, value]) => [
		id,
		object(value, `${what}.${id}`),
	]);
}

const kindOrder: HandlerKind[] = [
	"aggregate",
	"process",
	"integration",
	"projection",
];

const byId = (a: [string, unknown], b: [string, unknown]) =>
	a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;

/**
 * Returns the nodes that handled a handler's messages, in the order of their
 * IDs, or undefined if the document doesn't say. An entry that isn't well formed
 * is skipped.
 */
function nodesOf(v: unknown): HandlerNode[] | undefined {
	if (v === undefined) {
		return undefined;
	}

	return Object.entries(object(v, "nodes"))
		.sort(byId)
		.flatMap(([id, n]): HandlerNode[] =>
			isObject(n) && isNumber(n.rate) ? [{ id, rate: n.rate }] : [],
		);
}

/** Returns what a handler's card draws, from what the document says. */
function cardOf(
	key: string,
	h: Record<string, unknown>,
	chart: Chart | undefined,
): HandlerData {
	const kind = h.kind as HandlerKind;
	if (!kindOrder.includes(kind) || typeof h.name !== "string") {
		throw new Error(`handler ${key} has no name or kind`);
	}

	// A handler whose document has no bindings is one that no node supports them
	// for, which is different from one that has none.
	const bindings: Binding[] | undefined =
		h.bindings === undefined
			? undefined
			: entries(h.bindings, "bindings")
					.map(
						([id, b]): Binding => ({
							id,
							instances: number(b.instances, "instances"),
						}),
					)
					// The instances of a handler are shown largest first.
					.sort(
						(a, b) =>
							b.instances - a.instances ||
							(a.id ?? "").localeCompare(b.id ?? ""),
					);

	// The instances that are bound to no queue are the last segment of the bar,
	// whatever their number, because they are not a queue.
	const unbound = maybeNumber(h.unbound, "unbound");
	if (bindings !== undefined && unbound !== undefined && unbound > 0) {
		bindings.push({ id: undefined, instances: unbound });
	}

	const card: HandlerData = {
		key,
		name: h.name,
		kind,
		summary: {
			failing: maybeNumber(h.failing, "failing") ?? 0,
			queuedMessages: maybeNumber(h.queued, "queued"),
			unhandledEvents: maybeNumber(h.unhandledEvents, "unhandledEvents"),
			instances: maybeNumber(h.instances, "instances"),
			bindings,
		},
	};

	if (h.disabled === true) {
		card.disabled = true;
	}
	if (h.minimizesConcurrency === true) {
		card.minimizesConcurrency = true;
	}
	if (h.schedulesDeadlines === true) {
		card.summary.schedulesDeadlines = true;
	}
	if (chart) {
		card.history = chart;
		// The chart counts events unless the document says commands.
		if (h.charted === "commands") {
			card.charted = "commands";
		}
	}

	// Only an integration or a projection has a bar of the nodes that handled its
	// messages. A part of it that isn't well formed leaves out that bar alone.
	if (kind === "integration" || kind === "projection") {
		const nodes = attempt(() => nodesOf(h.nodes));
		if (nodes !== undefined) {
			card.nodes = nodes;
		}
	}

	// A fact that the document doesn't give is left out, not given as undefined.
	for (const k of ["queuedMessages", "unhandledEvents", "instances"] as const) {
		if (card.summary[k] === undefined) {
			delete card.summary[k];
		}
	}

	return card;
}

/**
 * selectCluster returns what the cluster view draws, from a snapshot. The times
 * in the result are in milliseconds before `ref`, which is a time on the page's
 * clock, usually the time of the latest change to the snapshot.
 *
 * A tile or a card whose part of the document isn't well formed is left out, so
 * that it fails on its own. It returns undefined if the document has no
 * application.
 */
export function selectCluster(
	snapshot: Snapshot,
	ref: number,
): ClusterData | undefined {
	const doc = snapshot.document;
	if (!isObject(doc) || !isObject(doc.application)) {
		return undefined;
	}

	const application = doc.application as unknown as Application;
	const rates = isObject(doc.rates) ? doc.rates : {};

	const overview: OverviewData = { cluster: { nodes: [] }, handlers: [] };

	// A part of a tile that the document doesn't have is one that no node
	// supports, and the tile leaves it out. A rate that the document has, and that
	// has no number, is one that the nodes support and that isn't known yet.
	const rateOf = (
		v: unknown,
		what: string,
	): { perMinute?: number } | undefined => {
		if (v === undefined) {
			return undefined;
		}
		const perSecond = maybeNumber(object(v, what).rate, `${what}.rate`);
		return perSecond === undefined ? {} : { perMinute: perSecond * 60 };
	};

	if (doc.eventStreams !== undefined || rates.events !== undefined) {
		overview.events = attempt(() => {
			const events: NonNullable<OverviewData["events"]> = {};

			if (rates.events !== undefined) {
				events.rate = rateOf(rates.events, "rates.events");
				events.history = chartOf(snapshot.series.get("events"), ref, 60);
			}
			if (doc.eventStreams !== undefined) {
				// The event streams are shown largest first.
				events.streams = entries(doc.eventStreams, "eventStreams")
					.map(
						([id, s]): SpreadPart => ({
							id,
							size: number(s.length, "length"),
						}),
					)
					.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
			}

			return events;
		});
	}

	if (doc.queues !== undefined || rates.throughput !== undefined) {
		overview.queues = attempt(() => {
			const queues: NonNullable<OverviewData["queues"]> = {
				failing: maybeNumber(doc.failing, "failing") ?? 0,
			};

			if (rates.throughput !== undefined) {
				queues.throughput = {
					...rateOf(rates.throughput, "rates.throughput"),
					of: throughputOf(object(rates.throughput, "rates.throughput").of),
				};
				queues.history = chartOf(snapshot.series.get("throughput"), ref, 60);
			}
			if (doc.queues !== undefined) {
				// The queues are shown in the order of their IDs.
				queues.queues = entries(doc.queues, "queues")
					.sort(byId)
					.map(
						([id, q]): SpreadPart => ({
							id,
							size: number(q.messages, "messages"),
						}),
					);
			}

			return queues;
		});
	}

	overview.cluster.nodes =
		attempt(() =>
			entries(doc.nodes, "nodes")
				.sort(byId)
				.map(
					([id, n]): LiveNode => ({
						id,
						workloads: number(n.workloads, "workloads"),
						heartbeats: (snapshot.beats.get(id) ?? []).map((t) =>
							Math.max(0, ref - t),
						),
					}),
				),
		) ?? [];

	const cards = attempt(() => entries(doc.handlers, "handlers")) ?? [];
	for (const [key, h] of cards) {
		const name = `handlers/${key}`;
		const card = attempt(() =>
			cardOf(
				key,
				h,
				// A handler has a chart only while the document says what it counts,
				// because its points stay once the nodes stop supporting the metric.
				h.charted !== undefined && snapshot.series.has(name)
					? chartOf(snapshot.series.get(name), ref)
					: undefined,
			),
		);
		if (card !== undefined) {
			overview.handlers.push(card);
		}
	}

	// The cards go by kind, and then by name.
	overview.handlers.sort(
		(a, b) =>
			kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
			a.name.localeCompare(b.name) ||
			a.key.localeCompare(b.key),
	);

	return { application, overview };
}
