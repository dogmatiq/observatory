import type {
	Binding,
	HandlerKind,
	HandlerNode,
	LiveNode,
	SpreadPart,
} from "../model.ts";
import { countOf, formatCompact, shortId } from "./format.ts";

/**
 * maxSegments is the largest number of segments that a bar shows. Anything
 * smaller than the largest few is merged into one last segment.
 */
export const maxSegments = 6;

/**
 * BarSegment is one part of a stacked bar.
 */
export interface BarSegment {
	/** The size of the segment, relative to the others. */
	value: number;

	/** Describes the segment, and is its popover, unless it has an `id`. */
	title: string;

	/**
	 * The title without the ID that ends it, for a segment of one thing that has
	 * an ID, such as a queue. Its popover is this followed by the ID.
	 */
	lead?: string;

	/** The full ID of the thing that the segment is of. */
	id?: string;

	/** What the ID is of, such as "queue", for the button that copies it. */
	of?: string;

	/**
	 * What the segment is of, for a popover that is a card about it. A segment
	 * that has this is drawn as a card, and its `lead` and `id` are not used.
	 */
	about?: SegmentAbout;

	/** True for the last segment, which merges all the smaller ones. */
	isOther?: boolean;
}

/**
 * SegmentAbout is what a card in the popover of a segment says about the thing
 * that the segment is of. A node that doesn't report its workloads, while others
 * do, has nothing to say but which node it is, and why.
 */
export type SegmentAbout =
	| SpreadAbout
	| ApplicationAbout
	| {
			thing: "node";
			id: string;

			/**
			 * A node that doesn't report its workloads while other nodes of its
			 * cluster do, which it may do while partway through a deploy.
			 */
			unreported: true;

			amount?: never;
			share?: never;
			total?: never;
	  };

/**
 * SpreadAbout is what a card says about a thing that has a share of what a bar
 * spreads: the events on a stream, the messages in a queue, or the workloads that
 * a node owns.
 */
export type SpreadAbout = {
	thing: "event-stream" | "queue" | "node";
	id: string;

	/**
	 * The number of events on the stream, or messages in the queue, or workloads
	 * that the node owns.
	 */
	amount: number;

	/** The share of all of them that are in this thing, from 0 to 1. */
	share: number;

	/**
	 * What the bar is of: all the events, messages or workloads, in all the streams,
	 * queues or nodes.
	 */
	total: { amount: number; things: number };
};

/**
 * ApplicationAbout is what a card says about an application that has a share of
 * what a bar of a site's applications spreads: the events that the application
 * records per minute, or the messages that wait in its queues.
 */
export type ApplicationAbout = {
	thing: "application";
	of: "events" | "messages";
	application: { name: string; key: string };

	/** How many of what the bar spreads the application has. */
	amount: number;

	/** The share of all of them that the application has, from 0 to 1. */
	share: number;

	total?: never;
	id?: never;
};

/**
 * ofThing returns the title, lead and ID of a segment that is of one thing, such
 * as a queue, which has an ID. The title ends with the first part of the ID. `of`
 * says what the thing is.
 */
function ofThing(lead: string, id: string, of: string) {
	return { title: `${lead} ${shortId(id)}`, lead, id, of };
}

/**
 * limitSegments returns the given segments, in the same order, unless there are
 * more than {@link maxSegments} of them. Then it returns the first few, and a
 * last segment that merges the others. The `describeOther` function returns the
 * title of that segment, given the total of the merged ones and how many there
 * are.
 */
export function limitSegments(
	segments: BarSegment[],
	describeOther: (total: number, count: number) => string,
): BarSegment[] {
	if (segments.length <= maxSegments) {
		return segments;
	}

	const kept = segments.slice(0, maxSegments - 1);
	const rest = segments.slice(maxSegments - 1);
	const total = rest.reduce((sum, s) => sum + s.value, 0);

	return [
		...kept,
		{ value: total, title: describeOther(total, rest.length), isOther: true },
	];
}

/**
 * BarRect is the position of one segment on a bar that is 100 units wide.
 */
export interface BarRect {
	x: number;
	width: number;
}

/**
 * The gap between two segments, in the bar's units, which are percentages of
 * its width.
 */
const gap = 0.6;

/**
 * layoutSegments returns where each segment goes on a bar that is 100 units
 * wide. A segment's width is proportional to its value, less a gap to the next
 * segment that has a width, so the last one that has a width has no gap after it,
 * and reaches the end of the bar. A segment that has no width is left out of the
 * result, which is indexed as the segments are, with `undefined` for each.
 */
export function layoutSegments(
	segments: BarSegment[],
): (BarRect | undefined)[] {
	const total = segments.reduce((sum, s) => sum + s.value, 0);
	if (total === 0) {
		// An empty bar is still drawn, as an empty track, so that it does not move
		// the page when it fills.
		return segments.map(() => undefined);
	}

	const last = segments.findLastIndex((s) => s.value > 0);
	let x = 0;

	return segments.map((s, i) => {
		const width = (s.value / total) * 100;
		const drawn = i < last ? width - gap : width;
		const rect = drawn > 0 ? { x, width: drawn } : undefined;
		x += width;
		return rect;
	});
}

/**
 * streamSegments returns the segments of a bar of the sizes of event streams,
 * largest first.
 */
export function streamSegments(streams: SpreadPart[]): BarSegment[] {
	const largestFirst = [...streams].sort((a, b) => b.size - a.size);
	const events = streams.reduce((sum, s) => sum + s.size, 0);

	return limitSegments(
		largestFirst.map((s) => ({
			value: s.size,
			...ofThing(
				`${formatCompact(s.size)} events on event stream`,
				s.id,
				"event stream",
			),
			about: {
				thing: "event-stream",
				id: s.id,
				amount: s.size,
				share: events === 0 ? 0 : s.size / events,
				total: { amount: events, things: streams.length },
			},
		})),
		(total, count) =>
			`${formatCompact(total)} events on ${count} other event streams`,
	);
}

/**
 * queueSegments returns the segments of a bar of the number of messages in each
 * queue.
 */
export function queueSegments(queues: SpreadPart[]): BarSegment[] {
	const messages = queues.reduce((sum, q) => sum + q.size, 0);

	return limitSegments(
		queues.map((q) => ({
			value: q.size,
			...ofThing(
				`${countOf(q.size, "message", "messages")} in queue`,
				q.id,
				"queue",
			),
			about: {
				thing: "queue" as const,
				id: q.id,
				amount: q.size,
				share: messages === 0 ? 0 : q.size / messages,
				total: { amount: messages, things: queues.length },
			},
		})),
		(total, count) =>
			`${countOf(total, "message", "messages")} in ${count} other queues`,
	);
}

/**
 * applicationSegments returns the segments of a bar of how much of something each
 * of a site's applications has, largest first, given the amount that each has.
 * An application that has none has no segment.
 */
export function applicationSegments(
	applications: {
		application: { name: string; key: string };
		amount: number;
	}[],
	of: ApplicationAbout["of"],
): BarSegment[] {
	const total = applications.reduce((sum, a) => sum + a.amount, 0);
	const [singular, plural] = applicationAmounts[of];

	return limitSegments(
		applications
			.filter((a) => a.amount > 0)
			.sort((a, b) => b.amount - a.amount)
			.map((a) => ({
				value: a.amount,
				title: `${countOf(a.amount, singular, plural)} in ${a.application.name}`,
				about: {
					thing: "application" as const,
					of,
					application: a.application,
					amount: a.amount,
					share: total === 0 ? 0 : a.amount / total,
				},
			})),
		(rest, count) =>
			`${countOf(rest, singular, plural)} in ${count} other applications`,
	);
}

/**
 * What a bar of a site's applications counts, in the singular and the plural.
 */
export const applicationAmounts: Record<
	ApplicationAbout["of"],
	readonly [string, string]
> = {
	events: ["event per minute", "events per minute"],
	messages: ["message waiting", "messages waiting"],
};

/**
 * bindingSegments returns the segments of a bar of how a handler's instances are
 * spread across the things that they are bound to. The nouns name one such
 * thing, such as "event stream", and many.
 */
export function bindingSegments(
	bindings: Binding[],
	singular: string,
	plural: string,
): BarSegment[] {
	return limitSegments(
		bindings.map((b) => ({
			value: b.instances,
			...(b.id === undefined
				? {
						title: `${countOf(b.instances, "instance", "instances")} with no ${singular} yet`,
					}
				: ofThing(
						`${countOf(b.instances, "instance", "instances")} on ${singular}`,
						b.id,
						singular,
					)),
		})),
		(total, count) =>
			`${countOf(total, "instance", "instances")} on ${count} other ${plural}`,
	);
}

/**
 * shadeOpacities is how opaque each segment of a bar is, by its position, so
 * that the segments are told apart by shade. The first is the darkest.
 */
export const shadeOpacities = [1, 0.8, 0.64, 0.5, 0.38, 0.28];

/**
 * NodeSegment is one live node's part of the bar of workloads.
 */
export interface NodeSegment {
	/** Describes the segment, as [BarSegment.title] does. */
	title: string;

	/** The title without the ID that ends it, as [BarSegment.lead] is. */
	lead: string;

	/** The full ID of the node. */
	id: string;

	/** What the segment is of, as [BarSegment.about] is. */
	about?: SegmentAbout;

	/** How opaque the segment is, which gives its shade. */
	opacity: number;

	/**
	 * The segment's width as a percentage of the bar, or undefined for a node
	 * that owns no workloads, whose segment is a small square.
	 */
	percent: number | undefined;

	/**
	 * True for a node whose share isn't known, because it doesn't report it while
	 * others do, whose segment is a faint square.
	 */
	faint?: boolean;
}

/**
 * nodeOpacity returns how opaque the segment at `index` of a bar of `count`
 * segments is. The shades step down from the darkest to the lightest, with one
 * step for each segment, so the last segment is always the lightest. Up to
 * {@link shadeOpacities} segments they are the steps of the other bars. With
 * more, the steps are spread evenly over the same range.
 */
function nodeOpacity(index: number, count: number): number {
	const first = shadeOpacities[0] as number;
	const last = shadeOpacities[shadeOpacities.length - 1] as number;

	if (count <= shadeOpacities.length) {
		return shadeOpacities[index] as number;
	}

	return Number((first + ((last - first) * index) / (count - 1)).toFixed(3));
}

/**
 * nodeSegments returns the segments of a bar with one segment for each live
 * node, whose width is the node's share of the workloads. It is for an engine
 * that divides its work into workloads: the bar of one that doesn't would show
 * only how many nodes there are, which the tile's headline says.
 *
 * A node that doesn't report its workloads while other nodes do is supported and
 * not working: what it owns isn't known, and its segment is a faint square.
 */
export function nodeSegments(nodes: LiveNode[]): NodeSegment[] {
	const total = nodes.reduce((sum, n) => sum + (n.workloads ?? 0), 0);

	return nodes.map((n, i) => {
		const opacity = nodeOpacity(i, nodes.length);

		if (n.workloads === undefined) {
			return {
				...ofThing("node", n.id, "node"),
				about: { thing: "node" as const, id: n.id, unreported: true as const },
				opacity,
				percent: undefined,
				faint: true,
			};
		}

		return {
			...ofThing(
				`${countOf(n.workloads, "workload", "workloads")} owned by node`,
				n.id,
				"node",
			),
			about: {
				thing: "node" as const,
				id: n.id,
				amount: n.workloads,
				share: total === 0 ? 0 : n.workloads / total,
				total: { amount: total, things: nodes.length },
			},
			opacity,
			percent: n.workloads > 0 ? (n.workloads / total) * 100 : undefined,
		};
	});
}

/**
 * handlerNodeSegments returns the segments of a bar of how the work of an
 * integration or a projection is spread over the nodes that handled its
 * messages, one for each node that handled any, in the order given. A node's
 * width is its share of the rate of all the nodes. The result is empty if no
 * node handled any.
 *
 * The shades step down in the same way as those of the bar of nodes.
 */
export function handlerNodeSegments(
	nodes: HandlerNode[],
	kind: HandlerKind,
): NodeSegment[] {
	const busy = nodes.filter((n) => n.rate > 0);
	const total = busy.reduce((sum, n) => sum + n.rate, 0);
	const noun = kind === "integration" ? "commands" : "events";

	return busy.map((n, i) => ({
		...ofThing(
			`${formatCompact(Math.round(n.rate * 60))} ${noun}/min on node`,
			n.id,
			"node",
		),
		opacity: nodeOpacity(i, busy.length),
		percent: (n.rate / total) * 100,
	}));
}
