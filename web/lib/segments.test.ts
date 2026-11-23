import { expect, test } from "vitest";
import { overview } from "../fixtures/overview.ts";
import { golden } from "../fixtures/prototype-golden.ts";
import {
	bindingSegments,
	handlerNodeSegments,
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

test("the segments carry the prototype's titles", () => {
	expect(streamSegments(overview.events.streams).map((s) => s.title)).toEqual(
		golden.bars.events.map((r) => r.title),
	);
	expect(queueSegments(overview.queues.queues).map((s) => s.title)).toEqual(
		golden.bars.queues.map((r) => r.title),
	);
});

test("the nodes' bar has the prototype's widths and titles", () => {
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

test("each segment of the nodes' bar is about its node, with its share of the workloads", () => {
	const segments = nodeSegments(overview.cluster.nodes);

	expect(segments.map((s) => s.about)).toEqual(
		overview.cluster.nodes.map((n) => ({
			thing: "node",
			id: n.id,
			amount: n.workloads,
			share: (n.workloads ?? 0) / 5,
			total: { amount: 5, things: 3 },
		})),
	);
});

test("a node that owns no workload has no share of the bar, even when none owns any", () => {
	const [segment] = nodeSegments([
		{ id: "aaaaaaaa", workloads: 0, heartbeats: [] },
	]);

	expect(segment?.about).toMatchObject({ share: 0 });
});

test("a node that doesn't report its workloads, while others do, has a share that isn't known, and is a faint square", () => {
	const segments = nodeSegments([
		{ id: "aaaaaaaa", workloads: 2, heartbeats: [] },
		{ id: "bbbbbbbb", heartbeats: [] },
	]);

	expect(segments.map((s) => s.percent)).toEqual([100, undefined]);
	expect(segments[1]?.faint).toBe(true);
	expect(segments[1]?.about).toEqual({
		thing: "node",
		id: "bbbbbbbb",
		unreported: true,
	});
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

test("an instance that is bound to nothing yet has its own title", () => {
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

test("a segment that has no value after the last one that has doesn't take away its end of the bar", () => {
	const [a, b, c] = layoutSegments([
		{ value: 1, title: "" },
		{ value: 1, title: "" },
		{ value: 0, title: "" },
	]);
	expect(a).toEqual({ x: 0, width: 49.4 });
	expect(b).toEqual({ x: 50, width: 50 });
	expect(c).toBeUndefined();
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

test("the bar of the nodes of an integration gives each node its share of the rate, in the order given", () => {
	const segments = handlerNodeSegments(
		[
			{ id: "aaaaaaaa-1", rate: 3 },
			{ id: "bbbbbbbb-2", rate: 1 },
		],
		"integration",
	);

	expect(segments.map((s) => s.percent)).toEqual([75, 25]);
	expect(segments.map((s) => s.title)).toEqual([
		"180 commands/min on node aaaaaaaa",
		"60 commands/min on node bbbbbbbb",
	]);
});

test("the bar of the nodes of a projection counts events", () => {
	const [segment] = handlerNodeSegments(
		[{ id: "cccccccc-3", rate: 25 }],
		"projection",
	);

	expect(segment?.title).toBe("1.5K events/min on node cccccccc");
	expect(segment?.percent).toBe(100);
});

test("a node that handled nothing has no segment, and the others share the bar", () => {
	const segments = handlerNodeSegments(
		[
			{ id: "aaaaaaaa", rate: 0 },
			{ id: "bbbbbbbb", rate: 2 },
			{ id: "cccccccc", rate: -1 },
			{ id: "dddddddd", rate: 2 },
		],
		"integration",
	);

	expect(segments.map((s) => s.title.split(" on node ")[1])).toEqual([
		"bbbbbbbb",
		"dddddddd",
	]);
	expect(segments.map((s) => s.percent)).toEqual([50, 50]);
});

test("a bar of nodes that handled nothing, or of no nodes, has no segments", () => {
	expect(handlerNodeSegments([], "integration")).toEqual([]);
	expect(
		handlerNodeSegments([{ id: "aaaaaaaa", rate: 0 }], "projection"),
	).toEqual([]);
});

test("the segments of the nodes of a handler step down in shade with the number of nodes that handled something", () => {
	const nodes = (n: number) =>
		Array.from({ length: n }, (_, i) => ({ id: `${i}`.repeat(8), rate: 1 }));

	expect(
		handlerNodeSegments(nodes(3), "integration").map((s) => s.opacity),
	).toEqual([1, 0.8, 0.64]);
	expect(
		handlerNodeSegments(nodes(7), "integration").map((s) => s.opacity),
	).toEqual([1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28]);

	// A node that handled nothing doesn't take a step.
	expect(
		handlerNodeSegments(
			[{ id: "aaaaaaaa", rate: 0 }, ...nodes(7)],
			"integration",
		).map((s) => s.opacity),
	).toEqual([1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28]);
});

test("a segment of one thing has the thing's ID, and a title that ends with its first part", () => {
	const id = "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10";
	const [segment] = queueSegments([{ id, size: 4 }]);

	expect(segment).toMatchObject({
		title: "4 messages in queue 8b0081fd",
		lead: "4 messages in queue",
		id,
	});
});

test("a segment of no one thing has no ID", () => {
	const segments = streamSegments(
		Array.from({ length: 8 }, (_, i) => ({
			id: `${i}`.repeat(8),
			size: 8 - i,
		})),
	);

	expect(segments.at(-1)?.id).toBeUndefined();
});

test("a segment of an event stream says how much of the events it holds", () => {
	const segments = streamSegments([
		{ id: "aaaaaaaa-1", size: 1 },
		{ id: "bbbbbbbb-2", size: 3 },
	]);

	expect(segments.map((s) => s.about)).toEqual([
		{
			thing: "event-stream",
			id: "bbbbbbbb-2",
			amount: 3,
			share: 0.75,
			total: { amount: 4, things: 2 },
		},
		{
			thing: "event-stream",
			id: "aaaaaaaa-1",
			amount: 1,
			share: 0.25,
			total: { amount: 4, things: 2 },
		},
	]);
});
