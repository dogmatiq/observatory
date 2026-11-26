import type {
	Binding,
	HandlerKind,
	HandlerNode,
	LiveNode,
	SpreadPart,
} from "../model.ts";
import {
	countOf,
	formatCompact,
	formatPercent,
	nounFor,
	scaleRate,
	shortId,
	shortPer,
} from "./format.ts";
import type { Readout } from "./readout.tsx";

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

	/** Describes the segment in words, to assistive technology. */
	title: string;

	/**
	 * What the card's readout says while the segment is pointed at: the thing
	 * that it is of, over its amount, and its share of the bar if the bar has
	 * shares.
	 */
	readout: Readout;

	/** True for the last segment, which merges all the smaller ones. */
	isOther?: boolean;
}

/**
 * segmentReadout returns the readout of a segment: the `subject` that it is of,
 * over its `amount`, in the singular or the plural unit, and its `share` of the
 * bar, from 0 to 1, if the bar has shares. A thing that has none has no share of
 * the bar.
 */
function segmentReadout(
	subject: string,
	amount: number,
	[singular, plural]: readonly [string, string],
	share?: number,
): Readout {
	return {
		subject,
		figure: formatCompact(amount),
		unit: nounFor(amount, singular, plural),
		...(share !== undefined && amount > 0 && { share: formatPercent(share) }),
	};
}

/**
 * limitSegments returns the given segments, in the same order, unless there are
 * more than {@link maxSegments} of them. Then it returns the first few, and a
 * last segment that merges the others. The `describeOther` function returns the
 * title and the readout of that segment, given the total of the merged ones and
 * how many there are.
 */
export function limitSegments(
	segments: BarSegment[],
	describeOther: (
		total: number,
		count: number,
	) => { title: string; readout: Readout },
): BarSegment[] {
	if (segments.length <= maxSegments) {
		return segments;
	}

	const kept = segments.slice(0, maxSegments - 1);
	const rest = segments.slice(maxSegments - 1);
	const total = rest.reduce((sum, s) => sum + s.value, 0);

	return [
		...kept,
		{ value: total, ...describeOther(total, rest.length), isOther: true },
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
	const unit = ["event", "events"] as const;

	return limitSegments(
		largestFirst.map((s) => ({
			value: s.size,
			title: `${countOf(s.size, ...unit)} on event stream ${shortId(s.id)}`,
			readout: segmentReadout(
				`event stream ${shortId(s.id)}`,
				s.size,
				unit,
				events === 0 ? 0 : s.size / events,
			),
		})),
		(total, count) => ({
			title: `${countOf(total, ...unit)} on ${count} other event streams`,
			readout: segmentReadout(`${count} other event streams`, total, unit),
		}),
	);
}

/**
 * queueSegments returns the segments of a bar of the number of messages in each
 * queue.
 */
export function queueSegments(queues: SpreadPart[]): BarSegment[] {
	const messages = queues.reduce((sum, q) => sum + q.size, 0);
	const unit = ["message", "messages"] as const;

	return limitSegments(
		queues.map((q) => ({
			value: q.size,
			title: `${countOf(q.size, ...unit)} in queue ${shortId(q.id)}`,
			readout: segmentReadout(
				`queue ${shortId(q.id)}`,
				q.size,
				unit,
				messages === 0 ? 0 : q.size / messages,
			),
		})),
		(total, count) => ({
			title: `${countOf(total, ...unit)} in ${count} other queues`,
			readout: segmentReadout(`${count} other queues`, total, unit),
		}),
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
	of: "events" | "messages",
): BarSegment[] {
	const total = applications.reduce((sum, a) => sum + a.amount, 0);
	const [singular, plural] = applicationAmounts[of];
	const unit = applicationUnits[of];

	return limitSegments(
		applications
			.filter((a) => a.amount > 0)
			.sort((a, b) => b.amount - a.amount)
			.map((a) => ({
				value: a.amount,
				title: `${countOf(a.amount, singular, plural)} in ${a.application.name}`,
				readout: segmentReadout(
					`application ${a.application.name}`,
					a.amount,
					unit,
					total === 0 ? 0 : a.amount / total,
				),
			})),
		(rest, count) => ({
			title: `${countOf(rest, singular, plural)} in ${count} other applications`,
			readout: segmentReadout(`${count} other applications`, rest, unit),
		}),
	);
}

/**
 * What a bar of a site's applications counts, in the singular and the plural,
 * in words.
 */
const applicationAmounts = {
	events: ["event per minute", "events per minute"],
	messages: ["message waiting", "messages waiting"],
} as const;

/**
 * What a bar of a site's applications counts, in the singular and the plural,
 * as the unit of a readout, which is short.
 */
const applicationUnits = {
	events: ["event/min", "events/min"],
	messages: ["message", "messages"],
} as const;

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
	const unit = ["instance", "instances"] as const;

	return limitSegments(
		bindings.map((b) => ({
			value: b.instances,
			...(b.id === undefined
				? {
						title: `${countOf(b.instances, ...unit)} with no ${singular} yet`,
						readout: segmentReadout(`no ${singular} yet`, b.instances, unit),
					}
				: {
						title: `${countOf(b.instances, ...unit)} bound to ${singular} ${shortId(b.id)}`,
						readout: segmentReadout(
							`${singular} ${shortId(b.id)}`,
							b.instances,
							unit,
						),
					}),
		})),
		(total, count) => ({
			title: `${countOf(total, ...unit)} bound to ${count} other ${plural}`,
			readout: segmentReadout(`${count} other ${plural}`, total, unit),
		}),
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
	/** Describes the segment in words, as [BarSegment.title] does. */
	title: string;

	/** What the card's readout says while the segment is pointed at. */
	readout: Readout;

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
	const unit = ["workload", "workloads"] as const;

	return nodes.map((n, i) => {
		const opacity = nodeOpacity(i, nodes.length);
		const node = `node ${shortId(n.id)}`;

		if (n.workloads === undefined) {
			return {
				title: `${node}, whose workloads are unknown`,
				readout: { subject: node, label: "workloads", figure: "unknown" },
				opacity,
				percent: undefined,
				faint: true,
			};
		}

		return {
			title: `${countOf(n.workloads, ...unit)} owned by ${node}`,
			readout: segmentReadout(
				node,
				n.workloads,
				unit,
				total === 0 ? 0 : n.workloads / total,
			),
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

	return busy.map((n, i) => {
		const node = `node ${shortId(n.id)}`;
		const { amount, per } = scaleRate(n.rate * 60);
		return {
			title: `${formatCompact(amount)} ${noun}${shortPer[per]} on ${node}`,
			readout: {
				subject: node,
				figure: formatCompact(amount),
				unit: `${noun}${shortPer[per]}`,
				share: formatPercent(n.rate / total),
			},
			opacity: nodeOpacity(i, busy.length),
			percent: (n.rate / total) * 100,
		};
	});
}
