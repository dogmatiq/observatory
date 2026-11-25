import type {
	Application,
	Chart,
	ClusterDocument,
	HandlerData,
	HandlerDocument,
	LiveNode,
	OverviewData,
} from "../model.ts";

/**
 * nodesOf returns the nodes that the document lists: the nodes of a cluster, or
 * the engine, if it doesn't run as a cluster and is live.
 */
function nodesOf(overview: OverviewData): LiveNode[] {
	return [
		...(overview.cluster?.nodes ?? []),
		...(overview.engine?.node ? [overview.engine.node] : []),
	];
}

/**
 * documentOf returns the state document of a cluster that shows the given
 * overview, as the Observatory describes it.
 */
function documentOf(
	application: Application,
	overview: OverviewData,
): ClusterDocument {
	const { events, queues } = overview;

	const document: ClusterDocument = {
		application,
		nodes: Object.fromEntries(
			nodesOf(overview).map((n) => [n.id, { workloads: n.workloads }]),
		),
		handlers: Object.fromEntries(
			overview.handlers.map((h) => [h.key, handlerOf(h)]),
		),
	};

	if (overview.cluster) {
		document.cluster = overview.cluster.reportsWorkloads
			? { reportsWorkloads: true }
			: {};
	}

	// A part that the overview doesn't have is left out of the document, which is
	// how the Observatory says that no node supports it.
	if (events) {
		if (events.oneStream) {
			document.oneStream = true;
		}
		if (events.streams) {
			document.eventStreams = Object.fromEntries(
				events.streams.map((s) => [s.id, { length: s.size }]),
			);
		}
		if (events.rate) {
			document.rates = {
				...document.rates,
				events: rateOf(events.rate.perMinute),
			};
		}
	}

	if (queues) {
		if (queues.oneQueue) {
			document.oneQueue = true;
		}
		if (queues.queues) {
			document.queues = Object.fromEntries(
				queues.queues.map((q) => [q.id, { messages: q.size }]),
			);
		}
		document.failing = queues.failing;
		if (queues.throughput) {
			document.rates = {
				...document.rates,
				throughput: {
					...rateOf(queues.throughput.perMinute),
					of: queues.throughput.of,
				},
			};
		}
	}

	return document;
}

/** Returns a rate as the document gives it: empty if it isn't known yet. */
function rateOf(perMinute: number | undefined): { rate?: number } {
	return perMinute === undefined ? {} : { rate: perMinute / 60 };
}

function handlerOf(h: HandlerData): HandlerDocument {
	const { summary } = h;

	return {
		name: h.name,
		kind: h.kind,
		disabled: h.disabled,
		minimizesConcurrency: h.minimizesConcurrency,
		failing: summary.failing,
		instances: summary.instances,
		queued: summary.queuedMessages,
		unhandledEvents: summary.unhandledEvents,
		schedulesDeadlines: summary.schedulesDeadlines,
		charted: h.history ? (h.charted ?? "events") : undefined,
		bindings: summary.bindings
			? Object.fromEntries(
					summary.bindings.map((b) => {
						if (b.id === undefined) {
							throw new Error("a binding in the document has an ID");
						}
						return [b.id, { instances: b.instances }];
					}),
				)
			: undefined,
	};
}

/**
 * streamOf returns the messages that begin a stream of a cluster that shows
 * the given overview, as the Observatory sends them: the name of each message,
 * and its data. It is how a test gives the page the fixture's numbers.
 *
 * The overview's times are in milliseconds before its chart's end, and the
 * burst gives the same.
 */
export function streamOf(
	application: Application,
	overview: OverviewData,
): [name: string, data: unknown][] {
	const messages: [string, unknown][] = [
		["changed", documentOf(application, overview)],
	];

	const recorded = (series: string, chart: Chart | undefined, factor = 1) => {
		if (chart) {
			messages.push([
				"recorded",
				{
					series,
					points: chart.points.map((p) => [chart.end - p.at, p.value / factor]),
				},
			]);
		}
	};

	// The events are sent as a rate per second, and the page shows them per minute.
	recorded("events", overview.events?.history, 60);
	recorded("throughput", overview.queues?.history, 60);
	for (const h of overview.handlers) {
		recorded(`handlers/${h.key}`, h.history);
	}

	// Each heartbeat expires as long after it arrived as the latest does, which
	// is what the server sends, because it keeps only the latest's expiry.
	for (const n of nodesOf(overview)) {
		const last = n.heartbeats.at(-1);
		const expiry =
			last === undefined || n.deadline === undefined
				? undefined
				: n.deadline + last;
		for (const msBefore of n.heartbeats) {
			messages.push([
				"heartbeat",
				{ node: n.id, msBefore, ...(expiry !== undefined && { expiry }) },
			]);
		}
	}

	messages.push(["synced", {}]);
	return messages;
}
