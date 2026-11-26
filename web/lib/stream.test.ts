import { expect, test } from "vitest";
import {
	apply,
	chartWindow,
	mergePatch,
	parseEvent,
	recentBeats,
	type Snapshot,
	type StreamEvent,
	selectCluster,
	type WatchAction,
	type WatchState,
	watchReducer,
} from "./stream.ts";

const empty: Snapshot = {
	document: {},
	series: new Map(),
	beats: new Map(),
	expiries: new Map(),
};

const changed = (patch: Record<string, unknown>): StreamEvent => ({
	kind: "changed",
	patch,
});

/** Applies the events, each at the time that goes with it. */
function applied(...events: [StreamEvent, number][]): Snapshot {
	return events.reduce((s, [e, now]) => apply(s, e, now), empty);
}

const message = (name: string, body: unknown, now = 0): WatchAction => ({
	type: "message",
	name,
	data: typeof body === "string" ? body : JSON.stringify(body),
	now,
});

/** Returns the keys of the handlers that a state's snapshot has. */
function handlerKeys(state: WatchState): string[] {
	const document = state.snapshot?.document as
		| { handlers?: Record<string, unknown> }
		| undefined;
	return Object.keys(document?.handlers ?? {});
}

/** Runs the actions, one after another. */
function run(...actions: WatchAction[]): WatchState {
	return actions.reduce(watchReducer, { status: "loading", at: 0 });
}

const app = message("changed", {
	application: { name: "statements", key: "k" },
});

test("parseEvent reads each kind of message", () => {
	expect(parseEvent("changed", '{"rates":{"events":1}}')).toEqual({
		kind: "changed",
		patch: { rates: { events: 1 } },
	});
	expect(
		parseEvent("recorded", '{"series":"events","points":[[100,2.5]]}'),
	).toEqual({ kind: "recorded", series: "events", points: [[100, 2.5]] });
	expect(parseEvent("heartbeat", '{"node":"n","msBefore":30}')).toEqual({
		kind: "heartbeat",
		node: "n",
		msBefore: 30,
	});
	expect(parseEvent("synced", "{}")).toEqual({ kind: "synced" });
});

test("parseEvent rejects what the stream doesn't send", () => {
	for (const [name, data] of [
		["changed", "not JSON"],
		["changed", "[]"],
		["changed", "3"],
		["recorded", '{"series":"a","points":[[1]]}'],
		["recorded", '{"series":"a","points":[[1,"x"]]}'],
		["recorded", '{"series":"a"}'],
		["recorded", '{"points":[]}'],
		["heartbeat", '{"node":4,"msBefore":0}'],
		["heartbeat", '{"node":"n"}'],
		["unknown", "{}"],
	] as const) {
		expect(parseEvent(name, data), `${name} ${data}`).toBeUndefined();
	}
});

// The cases of RFC 7396, and what the page relies on.

test("a field of a patch replaces the field of the same name", () => {
	expect(mergePatch({ a: 1, b: 2 }, { a: 3 })).toEqual({ a: 3, b: 2 });
});

test("a field that is null is removed, and one that isn't there stays absent", () => {
	expect(mergePatch({ a: 1, b: 2 }, { a: null, c: null })).toEqual({ b: 2 });
});

test("objects are merged where they are nested, and created where they aren't there", () => {
	expect(mergePatch({ q: { x: 1, y: 2 } }, { q: { y: 5, z: 6 } })).toEqual({
		q: { x: 1, y: 5, z: 6 },
	});
	expect(mergePatch({}, { q: { x: 1 } })).toEqual({ q: { x: 1 } });
});

test("a nested null removes an entry, and leaves an empty object that nothing is left in", () => {
	expect(mergePatch({ q: { x: 1 } }, { q: { x: null } })).toEqual({ q: {} });
});

test("a null in an object that is new is not kept", () => {
	expect(mergePatch({}, { q: { x: null, y: 1 } })).toEqual({ q: { y: 1 } });
});

test("an array replaces what it changes, as a whole", () => {
	expect(mergePatch({ a: [1, 2, 3] }, { a: [4] })).toEqual({ a: [4] });
	expect(mergePatch({ a: { x: 1 } }, { a: [1] })).toEqual({ a: [1] });
});

test("a value that isn't an object replaces an object", () => {
	expect(mergePatch({ a: { x: 1 } }, { a: 7 })).toEqual({ a: 7 });
	expect(mergePatch({ a: 7 }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
});

test("a patch of an object changes what is not an object into one", () => {
	expect(mergePatch(5, { a: 1 })).toEqual({ a: 1 });
	expect(mergePatch([1, 2], { a: 1 })).toEqual({ a: 1 });
	expect(mergePatch(undefined, { a: 1 })).toEqual({ a: 1 });
});

test("a field with the name of an object's own property is only a field", () => {
	const patch = JSON.parse('{"__proto__":{"polluted":1}}');
	const merged = mergePatch({}, patch) as Record<string, unknown>;

	expect(Object.hasOwn(merged, "__proto__")).toBe(true);
	expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
});

test("mergePatch doesn't change its arguments", () => {
	const target = { a: { x: 1 }, b: 2 };
	const patch = { a: { x: null, y: 2 }, b: null };
	mergePatch(target, patch);

	expect(target).toEqual({ a: { x: 1 }, b: 2 });
	expect(patch).toEqual({ a: { x: null, y: 2 }, b: null });
});

test("a change merges into the document", () => {
	const s = applied(
		[changed({ queues: { a: { messages: 1 }, b: { messages: 2 } } }), 0],
		[changed({ queues: { a: { messages: 5 }, b: null } }), 1],
	);

	expect(s.document).toEqual({ queues: { a: { messages: 5 } } });
});

test("the points of a handler's series go when the handler leaves the document", () => {
	const s = applied(
		[changed({ handlers: { a: { name: "a" }, b: { name: "b" } } }), 0],
		[{ kind: "recorded", series: "handlers/a", points: [[0, 1]] }, 0],
		[{ kind: "recorded", series: "handlers/b", points: [[0, 1]] }, 0],
		[{ kind: "recorded", series: "events", points: [[0, 1]] }, 0],
		[changed({ handlers: { a: null } }), 1],
	);

	expect([...s.series.keys()].sort()).toEqual(["events", "handlers/b"]);
});

test("recorded points are added to a series, placed on the page's clock by how long before they arrived", () => {
	const s = applied(
		[
			{
				kind: "recorded",
				series: "events",
				points: [
					[2000, 1],
					[1000, 2],
				],
			},
			10_000,
		],
		[{ kind: "recorded", series: "events", points: [[0, 3]] }, 11_000],
	);

	expect(s.series.get("events")).toEqual([
		{ at: 8000, value: 1 },
		{ at: 9000, value: 2 },
		{ at: 11_000, value: 3 },
	]);
});

test("the first points of a series, even none, create it", () => {
	const s = applied([
		{ kind: "recorded", series: "handlers/a", points: [] },
		0,
	]);

	expect(s.series.get("handlers/a")).toEqual([]);
});

test("a series keeps only the points in its window", () => {
	const s = applied(
		[{ kind: "recorded", series: "events", points: [[0, 1]] }, 0],
		[{ kind: "recorded", series: "events", points: [[0, 2]] }, chartWindow],
		[{ kind: "recorded", series: "events", points: [[0, 3]] }, chartWindow + 1],
	);

	expect(s.series.get("events")).toEqual([
		{ at: chartWindow, value: 2 },
		{ at: chartWindow + 1, value: 3 },
	]);
});

test("a heartbeat is kept as the time that it arrived, and only the latest few are", () => {
	let s = empty;
	for (let i = 0; i < recentBeats + 3; i++) {
		s = apply(s, { kind: "heartbeat", node: "n", msBefore: 0 }, i * 1000);
	}

	const kept = s.beats.get("n") ?? [];
	expect(kept).toHaveLength(recentBeats);
	expect(kept.at(-1)).toBe((recentBeats + 2) * 1000);
	expect(kept[0]).toBe(3000);
});

test("a heartbeat is placed by how long before the message it arrived", () => {
	const s = applied(
		[{ kind: "heartbeat", node: "a", msBefore: 3000 }, 10_000],
		[{ kind: "heartbeat", node: "a", msBefore: 1000 }, 10_000],
		[{ kind: "heartbeat", node: "b", msBefore: 0 }, 10_000],
	);

	expect(s.beats.get("a")).toEqual([7000, 9000]);
	expect(s.beats.get("b")).toEqual([10_000]);
});

test("a heartbeat that the clocks put after the reference has an age of nothing", () => {
	const s = applied(
		[
			changed({
				application: { name: "a", key: "k" },
				cluster: { reportsWorkloads: true },
				nodes: { n: { workloads: 1 } },
			}),
			0,
		],
		[{ kind: "heartbeat", node: "n", msBefore: -50 }, 1000],
	);

	expect(
		selectCluster(s, 1000)?.overview.cluster?.nodes[0]?.heartbeats,
	).toEqual([0]);
});

test("a node with no workloads in the document is one that doesn't report them", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			cluster: {},
			nodes: { n: {} },
		}),
		0,
	]);

	expect(selectCluster(s, 0)?.overview.cluster).toEqual({
		nodes: [{ id: "n", workloads: undefined, heartbeats: [] }],
	});
});

test("a cluster whose document says that its nodes report their workloads says so", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			cluster: { reportsWorkloads: true },
			nodes: {},
		}),
		0,
	]);

	expect(selectCluster(s, 0)?.overview.cluster?.reportsWorkloads).toBe(true);
});

test("an engine that doesn't run as a cluster has the engine tile, with the engine while the document lists it", () => {
	const s = applied(
		[
			changed({
				application: { name: "a", key: "k" },
				nodes: { e: {} },
			}),
			0,
		],
		[{ kind: "heartbeat", node: "e", msBefore: 0 }, 1000],
	);

	const live = selectCluster(s, 1000)?.overview;
	expect(live?.cluster).toBeUndefined();
	expect(live?.engine).toEqual({
		node: { id: "e", workloads: undefined, heartbeats: [0] },
	});

	const offline = applied([
		changed({ application: { name: "a", key: "k" }, nodes: {} }),
		0,
	]);
	expect(selectCluster(offline, 0)?.overview.engine).toEqual({});
});

test("the tiles say that there is one event stream and one queue when the document says so", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			eventStreams: { s: { length: 3 } },
			oneStream: true,
			queues: { q: { messages: 1 } },
			oneQueue: true,
		}),
		0,
	]);

	const overview = selectCluster(s, 0)?.overview;
	expect(overview?.events?.oneStream).toBe(true);
	expect(overview?.queues?.oneQueue).toBe(true);
});

test("a tile or a card that only some of the nodes report has their coverage", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			eventStreams: {},
			rates: { events: {} },
			coverage: { events: 0.5 },
			handlers: {},
		}),
		0,
	]);

	expect(selectCluster(s, 0)?.overview.events?.coverage).toBe(0.5);
});

test("the cluster's site and the software that its nodes run are read from the document", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k", site: "eu-west" },
			site: { name: "eu-west", key: "s" },
			software: {
				engineName: "runkit",
				engineVersions: { lowest: "0.3.1", highest: "0.4.0" },
				applicationVersionsDiffer: true,
			},
			handlers: {},
		}),
		0,
	]);

	const data = selectCluster(s, 0);
	expect(data?.site).toEqual({ name: "eu-west", key: "s" });
	expect(data?.software).toEqual({
		engineName: "runkit",
		engineVersions: { lowest: "0.3.1", highest: "0.4.0" },
		applicationVersionsDiffer: true,
	});
});

test("a part of the software that isn't well formed is left out", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			software: { engineName: 3, engineVersions: { lowest: "1.0.0" } },
			handlers: {},
		}),
		0,
	]);

	expect(selectCluster(s, 0)?.software).toEqual({});
});

test("apply doesn't change the snapshot that it is given", () => {
	const before = applied([changed({ rates: { events: 1 } }), 0]);
	apply(before, changed({ rates: { events: null } }), 1);
	apply(before, { kind: "heartbeat", node: "n", msBefore: 0 }, 1);
	apply(before, { kind: "recorded", series: "s", points: [[0, 1]] }, 1);

	expect(before.document).toEqual({ rates: { events: 1 } });
	expect(before.beats.size).toBe(0);
	expect(before.series.size).toBe(0);
});

test("nothing is shown until the first burst ends", () => {
	const s = run(
		{ type: "connected" },
		app,
		message("changed", { rates: { events: 1 } }),
	);

	expect(s.status).toBe("loading");
	expect(s.snapshot).toBeUndefined();
});

test("the page is ready when the burst ends", () => {
	const s = run({ type: "connected" }, app, message("synced", {}, 5));

	expect(s.status).toBe("ready");
	expect(s.at).toBe(5);
	expect(s.snapshot?.document).toEqual({
		application: { name: "statements", key: "k" },
	});
});

test("a message after the burst changes what is shown, and when", () => {
	const s = run(
		{ type: "connected" },
		app,
		message("synced", {}, 5),
		message("changed", { eventStreams: {} }, 9),
	);

	expect(s.snapshot?.document).toMatchObject({ eventStreams: {} });
	expect(s.at).toBe(9);
	expect(s.status).toBe("ready");
});

test("a burst after the stream broke replaces everything when it ends, and not before", () => {
	const first = run(
		{ type: "connected" },
		app,
		message("changed", { handlers: { old: { name: "old" } } }),
		message("synced", {}, 5),
		{ type: "broken" },
	);
	expect(first.status).toBe("stale");

	const during = [
		{ type: "connected" } as WatchAction,
		app,
		message("changed", { handlers: { new: { name: "new" } } }, 20),
	].reduce(watchReducer, first);

	// The page still shows the old handlers, as stale.
	expect(during.status).toBe("stale");
	expect(handlerKeys(during)).toEqual(["old"]);

	const after = watchReducer(during, message("synced", {}, 21));

	expect(after.status).toBe("ready");
	expect(handlerKeys(after)).toEqual(["new"]);
	expect(after.at).toBe(21);
});

test("a burst that has no application doesn't end", () => {
	const s = run({ type: "connected" }, message("synced", {}));

	expect(s.status).toBe("failed");
	expect(s.snapshot).toBeUndefined();
});

test("a message that can't be understood makes the page stale, or failed if it has nothing", () => {
	expect(
		run({ type: "connected" }, message("changed", "not JSON")).status,
	).toBe("failed");

	const shown = run({ type: "connected" }, app, message("synced", {}, 1));
	expect(watchReducer(shown, message("changed", "not JSON")).status).toBe(
		"stale",
	);
	expect(watchReducer(shown, message("bogus", {})).status).toBe("stale");
});

test("the page is unknown, and starts again when it is reset", () => {
	const shown = run({ type: "connected" }, app, message("synced", {}, 1));

	expect(watchReducer(shown, { type: "unknown" }).status).toBe("unknown");
	expect(watchReducer(shown, { type: "reset" })).toEqual({
		status: "loading",
		at: 0,
	});
});

test("a stream that breaks before the first burst ends has failed", () => {
	expect(run({ type: "broken" }).status).toBe("failed");
});

/** A snapshot with everything that the cluster view draws. */
function full(): Snapshot {
	return applied(
		[
			changed({
				application: { name: "statements", key: "k" },
				cluster: { reportsWorkloads: true },
				nodes: { n2: { workloads: 1 }, n1: { workloads: 2 } },
				eventStreams: { s1: { length: 5 }, s2: { length: 9 } },
				queues: { q2: { messages: 1 }, q1: { messages: 3 } },
				failing: 1,
				rates: {
					events: { rate: 2 },
					throughput: { rate: 0.5, of: "removed" },
				},
				handlers: {
					a: {
						name: "alpha",
						kind: "aggregate",
						disabled: true,
						failing: 0,
						charted: "events",
						bindings: { x: { instances: 1 }, y: { instances: 4 } },
					},
					b: {
						name: "beta",
						kind: "integration",
						minimizesConcurrency: true,
						failing: 2,
						queued: 7,
					},
					c: { name: "aaa", kind: "projection", unhandledEvents: 3 },
					d: { name: "zeta", kind: "aggregate", instances: 9 },
				},
			}),
			0,
		],
		[
			{
				kind: "recorded",
				series: "events",
				points: [
					[2000, 1],
					[1000, 2],
				],
			},
			10_000,
		],
		[{ kind: "recorded", series: "throughput", points: [[0, 0.5]] }, 10_000],
		[{ kind: "recorded", series: "handlers/a", points: [[500, 7]] }, 10_000],
		[{ kind: "heartbeat", node: "n1", msBefore: 2000 }, 10_000],
		[{ kind: "heartbeat", node: "n1", msBefore: 500 }, 10_000],
	);
}

test("a cluster is down if the document says so, and is not otherwise", () => {
	expect(selectCluster(full(), 10_000)?.down).toBeUndefined();

	const down = applied([
		changed({ application: { name: "statements", key: "k" }, down: true }),
		10_000,
	]);
	expect(selectCluster(down, 10_000)?.down).toBe(true);
});

test("the cluster view is selected from a snapshot, with times measured from the reference", () => {
	const data = selectCluster(full(), 10_000);

	expect(data?.application).toEqual({ name: "statements", key: "k" });

	const { overview } = data ?? { overview: undefined };
	expect(overview?.events).toEqual({
		rate: { perMinute: 120 },
		// The event streams are largest first.
		streams: [
			{ id: "s2", size: 9 },
			{ id: "s1", size: 5 },
		],
		// The history is of events per minute, like the rate, and is sent per second.
		history: {
			end: 0,
			points: [
				{ at: -2000, value: 60 },
				{ at: -1000, value: 120 },
			],
		},
	});
	expect(overview?.queues).toEqual({
		// The queues are in the order of their IDs.
		queues: [
			{ id: "q1", size: 3 },
			{ id: "q2", size: 1 },
		],
		failing: 1,
		throughput: { perMinute: 30, of: "removed" },
		// The history is of messages per minute, like the rate, and is sent per second.
		history: { end: 0, points: [{ at: 0, value: 30 }] },
	});
	expect(overview?.cluster?.nodes).toEqual([
		{ id: "n1", workloads: 2, heartbeats: [2000, 500] },
		{ id: "n2", workloads: 1, heartbeats: [] },
	]);
});

test("the cards go by kind and then by name, and the instances of a handler are shown largest first", () => {
	const handlers = selectCluster(full(), 10_000)?.overview.handlers ?? [];

	expect(handlers.map((h) => h.name)).toEqual(["alpha", "zeta", "beta", "aaa"]);
	expect(handlers[0]).toMatchObject({
		key: "a",
		disabled: true,
		summary: {
			failing: 0,
			bindings: [
				{ id: "y", instances: 4 },
				{ id: "x", instances: 1 },
			],
		},
		history: { end: 0, points: [{ at: -500, value: 7 }] },
	});
	expect(handlers[2]).toEqual({
		key: "b",
		name: "beta",
		kind: "integration",
		minimizesConcurrency: true,
		summary: { failing: 2, queuedMessages: 7 },
	});
	expect(handlers[3]?.summary).toEqual({
		failing: 0,
		unhandledEvents: 3,
	});
	expect(handlers[1]?.summary.instances).toBe(9);
});

test("a card has a chart only once its series has arrived", () => {
	const handlers = selectCluster(full(), 10_000)?.overview.handlers ?? [];

	expect(handlers.find((h) => h.key === "b")?.history).toBeUndefined();
	expect(handlers.find((h) => h.key === "a")?.history).toBeDefined();
});

test("a card says that its chart counts commands, and has a chart only while the document says what it counts", () => {
	const s = applied(
		[
			changed({
				application: { name: "app", key: "k" },
				handlers: {
					a: { name: "a", kind: "integration", charted: "commands" },
					b: { name: "b", kind: "aggregate", charted: "events" },
					c: { name: "c", kind: "projection" },
				},
			}),
			0,
		],
		[{ kind: "recorded", series: "handlers/a", points: [[0, 1]] }, 0],
		[{ kind: "recorded", series: "handlers/b", points: [[0, 1]] }, 0],
		// The points of a series that the nodes have stopped supporting stay.
		[{ kind: "recorded", series: "handlers/c", points: [[0, 1]] }, 0],
	);

	const handlers = selectCluster(s, 0)?.overview.handlers ?? [];
	const byKey = Object.fromEntries(handlers.map((h) => [h.key, h]));
	expect(byKey.a?.charted).toBe("commands");
	expect(byKey.a?.history).toBeDefined();
	expect(byKey.b?.charted).toBeUndefined();
	expect(byKey.b?.history).toBeDefined();
	expect(byKey.c?.history).toBeUndefined();
});

test("a rate that is absent gives no figure, and an absent collection gives no tile", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			cluster: {},
			eventStreams: {},
		}),
		0,
	]);

	const { overview } = selectCluster(s, 0) ?? {};
	expect(overview?.events?.rate).toBeUndefined();
	expect(overview?.queues).toBeUndefined();
	expect(overview?.cluster?.nodes).toEqual([]);
	expect(overview?.handlers).toEqual([]);
});

test("a rate that a change removes gives no figure again", () => {
	const s = applied(
		[
			changed({
				application: { name: "a", key: "k" },
				eventStreams: {},
				rates: { events: { rate: 3 } },
			}),
			0,
		],
		[changed({ rates: { events: { rate: null } } }), 1],
	);

	// The nodes still support the rate, so the tile still has it, with no number.
	expect(selectCluster(s, 1)?.overview.events?.rate).toEqual({});
});

test("a rate that isn't known only because a node is being measured says so", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			eventStreams: {},
			rates: { events: { measuring: true } },
		}),
		0,
	]);

	expect(selectCluster(s, 0)?.overview.events?.rate).toEqual({
		measuring: true,
	});
});

test("a part of the document that isn't well formed is left out and the others are not", () => {
	const s = applied([
		changed({
			application: { name: "a", key: "k" },
			eventStreams: 7,
			queues: {},
			failing: 0,
			handlers: { a: { name: "a" }, b: { name: "b", kind: "process" } },
		}),
		0,
	]);

	const { overview } = selectCluster(s, 0) ?? {};
	expect(overview?.events).toBeUndefined();
	expect(overview?.queues).toBeDefined();
	expect(overview?.handlers.map((h) => h.key)).toEqual(["b"]);
});

test("there is no cluster view without an application", () => {
	expect(selectCluster(empty, 0)).toBeUndefined();
});

/** Selects the cards of a document that has only these handlers. */
function cardsOf(handlers: Record<string, unknown>) {
	const s = applied([
		changed({ application: { name: "a", key: "k" }, handlers }),
		0,
	]);
	return selectCluster(s, 0)?.overview.handlers ?? [];
}

test("an integration and a projection have the nodes that handled their messages, in the order of the nodes' IDs", () => {
	const cards = cardsOf({
		i: {
			name: "mailer",
			kind: "integration",
			nodes: { n2: { rate: 0.5 }, n1: { rate: 1.5 } },
		},
		p: {
			name: "balances",
			kind: "projection",
			nodes: { n3: { rate: 2 } },
		},
	});

	expect(cards.find((c) => c.key === "i")?.nodes).toEqual([
		{ id: "n1", rate: 1.5 },
		{ id: "n2", rate: 0.5 },
	]);
	expect(cards.find((c) => c.key === "p")?.nodes).toEqual([
		{ id: "n3", rate: 2 },
	]);
});

test("a handler whose document has no nodes has none, and one whose nodes are empty has an empty list", () => {
	const cards = cardsOf({
		a: { name: "a", kind: "integration" },
		b: { name: "b", kind: "integration", nodes: {} },
	});

	expect(cards.find((c) => c.key === "a")).not.toHaveProperty("nodes");
	expect(cards.find((c) => c.key === "b")?.nodes).toEqual([]);
});

test("an aggregate and a process have no nodes, whatever the document says", () => {
	const cards = cardsOf({
		a: { name: "a", kind: "aggregate", nodes: { n1: { rate: 1 } } },
		p: { name: "p", kind: "process", nodes: { n1: { rate: 1 } } },
	});

	expect(cards).toHaveLength(2);
	for (const card of cards) {
		expect(card).not.toHaveProperty("nodes");
	}
});

test("an entry of the nodes that isn't well formed is left out, and the others are not", () => {
	const cards = cardsOf({
		i: {
			name: "i",
			kind: "integration",
			nodes: {
				n1: { rate: 1 },
				n2: { rate: "fast" },
				n3: 7,
				n4: {},
				n5: { rate: 2 },
			},
		},
	});

	expect(cards[0]?.nodes).toEqual([
		{ id: "n1", rate: 1 },
		{ id: "n5", rate: 2 },
	]);
});

test("nodes that aren't well formed leave out the bar and nothing else of the card", () => {
	const cards = cardsOf({
		i: {
			name: "i",
			kind: "integration",
			queued: 4,
			nodes: "everyone",
		},
	});

	expect(cards).toHaveLength(1);
	expect(cards[0]).not.toHaveProperty("nodes");
	expect(cards[0]?.summary.queuedMessages).toBe(4);
});

test("a rate that a change removes from a node, and a node that it removes, leave the others", () => {
	const s = applied(
		[
			changed({
				application: { name: "a", key: "k" },
				handlers: {
					i: {
						name: "i",
						kind: "integration",
						nodes: { n1: { rate: 1 }, n2: { rate: 2 } },
					},
				},
			}),
			0,
		],
		[changed({ handlers: { i: { nodes: { n1: null, n2: { rate: 3 } } } } }), 1],
	);

	expect(selectCluster(s, 1)?.overview.handlers[0]?.nodes).toEqual([
		{ id: "n2", rate: 3 },
	]);
});

test("the instances of a process that are bound to no queue are a segment of their own, after the queues", () => {
	const snapshot = applied([
		changed({
			application: { name: "statements", key: "k" },
			handlers: {
				p: {
					name: "schedule",
					kind: "process",
					schedulesDeadlines: true,
					bindings: { q1: { instances: 2 }, q2: { instances: 5 } },
					unbound: 3,
				},
				q: {
					name: "other",
					kind: "process",
					bindings: { q1: { instances: 1 } },
				},
			},
		}),
		0,
	]);

	const cards = selectCluster(snapshot, 0)?.overview.handlers ?? [];
	const scheduled = cards.find((c) => c.name === "schedule");
	const other = cards.find((c) => c.name === "other");

	expect(scheduled?.summary.bindings).toEqual([
		{ id: "q2", instances: 5 },
		{ id: "q1", instances: 2 },
		{ id: undefined, instances: 3 },
	]);
	expect(other?.summary.bindings).toEqual([{ id: "q1", instances: 1 }]);
});

test("a node's deadline is when its latest heartbeat expires, after the moment that the page reads the snapshot", () => {
	const s = applied(
		[
			changed({
				application: { name: "a", key: "k" },
				cluster: {},
				nodes: { n: {} },
			}),
			0,
		],
		[{ kind: "heartbeat", node: "n", msBefore: 0, expiry: 15_000 }, 1000],
	);

	// The heartbeat arrived at 1 s and expires 15 s later, at 16 s, which is
	// 12 s after the page reads the snapshot at 4 s.
	const [node] = selectCluster(s, 4000)?.overview.cluster?.nodes ?? [];
	expect(node?.deadline).toBe(12_000);
});

test("a node whose latest heartbeat gives no way to calculate when it expires has no deadline", () => {
	const s = applied(
		[
			changed({
				application: { name: "a", key: "k" },
				cluster: {},
				nodes: { n: {} },
			}),
			0,
		],
		[{ kind: "heartbeat", node: "n", msBefore: 0, expiry: 15_000 }, 1000],
		[{ kind: "heartbeat", node: "n", msBefore: 0 }, 2000],
	);

	const [node] = selectCluster(s, 4000)?.overview.cluster?.nodes ?? [];
	expect(node?.deadline).toBeUndefined();
});

test("a heartbeat event gives the expiry that the stream sends with it", () => {
	expect(
		parseEvent("heartbeat", '{"node":"n","msBefore":0,"expiry":15000}'),
	).toEqual({ kind: "heartbeat", node: "n", msBefore: 0, expiry: 15_000 });
	expect(parseEvent("heartbeat", '{"node":"n","msBefore":0}')).toEqual({
		kind: "heartbeat",
		node: "n",
		msBefore: 0,
	});
});
