import { expect, test } from "vitest";
import { overview } from "../fixtures/overview.ts";
import { golden } from "../fixtures/prototype-golden.ts";
import {
	bindingSegments,
	layoutSegments,
	limitSegments,
	nodeSegments,
	queueSegments,
	shadeOpacities,
	streamSegments,
} from "./segments.ts";

/** The segments' geometry, as the prototype wrote it into its attributes. */
function drawn(segments: Parameters<typeof layoutSegments>[0]) {
	return layoutSegments(segments).map((r) =>
		r === undefined
			? undefined
			: { x: r.x.toFixed(3), width: r.width.toFixed(3) },
	);
}

const want = (bar: { x: string; width: string }[]) =>
	bar.map(({ x, width }) => ({ x, width }));

test("the event streams' bar is what the prototype drew", () => {
	expect(drawn(streamSegments(overview.events.streams))).toEqual(
		want(golden.bars.events),
	);
});

test("the queues' bar is what the prototype drew", () => {
	expect(drawn(queueSegments(overview.queues.queues))).toEqual(
		want(golden.bars.queues),
	);
});

test("the handlers' bars are what the prototype drew", () => {
	const [account, schedule] = overview.handlers;
	expect(
		drawn(
			bindingSegments(
				account?.summary.bindings ?? [],
				"event stream",
				"event streams",
			),
		),
	).toEqual(want(golden.bars.account));
	expect(
		drawn(
			bindingSegments(
				schedule?.summary.bindings ?? [],
				"deadline queue",
				"deadline queues",
			),
		),
	).toEqual(want(golden.bars.statementSchedule));
});

test("the segments carry the prototype's tooltips", () => {
	expect(streamSegments(overview.events.streams).map((s) => s.title)).toEqual(
		golden.bars.events.map((r) => r.title),
	);
	expect(queueSegments(overview.queues.queues).map((s) => s.title)).toEqual(
		golden.bars.queues.map((r) => r.title),
	);
});

test("the nodes' bar has the prototype's widths and tooltips", () => {
	const segments = nodeSegments(overview.cluster.nodes);
	expect(segments.map((s) => `${(s.percent ?? 0).toFixed(3)}%`)).toEqual(
		golden.nodeWidths,
	);
	expect(segments.map((s) => s.title)).toEqual([
		"3 workloads owned by node 113cbdc3",
		"1 workload owned by node 4aeaa462",
		"1 workload owned by node f2cc5362",
	]);
});

test("streams are shown largest first", () => {
	const segments = streamSegments([
		{ id: "aaaaaaaa", size: 1 },
		{ id: "bbbbbbbb", size: 3 },
		{ id: "cccccccc", size: 2 },
	]);
	expect(segments.map((s) => s.value)).toEqual([3, 2, 1]);
});

test("a bar of more than six segments merges the smallest into the last", () => {
	const segments = limitSegments(
		[10, 9, 8, 7, 6, 5, 4, 3].map((value) => ({ value, title: "" })),
		(total, count) => `${total} in ${count} others`,
	);

	expect(segments.map((s) => s.value)).toEqual([10, 9, 8, 7, 6, 12]);
	expect(segments.map((s) => s.isOther)).toEqual([
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		true,
	]);
	expect(segments[5]?.title).toBe("12 in 3 others");
});

test("six segments are not merged", () => {
	const six = [1, 2, 3, 4, 5, 6].map((value) => ({ value, title: "" }));
	expect(limitSegments(six, () => "")).toEqual(six);
});

test("an instance that is bound to nothing yet has its own tooltip", () => {
	const [segment] = bindingSegments(
		[{ id: undefined, instances: 2 }],
		"event stream",
		"event streams",
	);
	expect(segment?.title).toBe("2 instances with no event stream yet");
});

test("the merged segment of a queue bar names how many queues it holds", () => {
	const queues = Array.from({ length: 8 }, (_, i) => ({
		id: `${i}`.repeat(8),
		size: 10 - i,
	}));
	const last = queueSegments(queues).at(-1);
	expect(last?.title).toBe("12 messages in 3 other queues");
});

test("an empty bar has no segments to draw", () => {
	expect(layoutSegments([])).toEqual([]);
	expect(layoutSegments([{ value: 0, title: "" }])).toEqual([undefined]);
});

test("the last segment has no gap after it", () => {
	const [a, b] = layoutSegments([
		{ value: 1, title: "" },
		{ value: 1, title: "" },
	]);
	expect(a).toEqual({ x: 0, width: 49.4 });
	expect(b).toEqual({ x: 50, width: 50 });
});

function nodesOf(count: number, emptyLast = false) {
	return Array.from({ length: count }, (_, i) => ({
		id: `${i}`.repeat(8),
		workloads: emptyLast && i === count - 1 ? 0 : 1,
		heartbeats: [],
	}));
}

test("a node that owns no workloads has a square segment", () => {
	const segments = nodeSegments(nodesOf(7, true));
	expect(segments[6]?.percent).toBeUndefined();
	expect(segments[0]?.percent).toBeCloseTo(100 / 6);
});

test("up to six nodes the shades are the steps of the other bars", () => {
	expect(nodeSegments(nodesOf(3)).map((s) => s.opacity)).toEqual([
		1, 0.8, 0.64,
	]);
	expect(nodeSegments(nodesOf(6)).map((s) => s.opacity)).toEqual(
		shadeOpacities,
	);
});

test("with more nodes the shades step down evenly, and the last is the lightest", () => {
	const opacities = nodeSegments(nodesOf(7)).map((s) => s.opacity);

	expect(opacities).toEqual([1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28]);

	const many = nodeSegments(nodesOf(20)).map((s) => s.opacity);
	expect(many[0]).toBe(1);
	expect(many.at(-1)).toBe(0.28);
	expect([...many].sort((a, b) => b - a)).toEqual(many);
});
