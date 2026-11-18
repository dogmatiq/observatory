import { expect, test } from "vitest";
import { heartbeatLevel } from "../lib/levels.ts";
import {
	apply,
	parseEvent,
	type Snapshot,
	selectCluster,
} from "../lib/stream.ts";
import { application, overview } from "./overview.ts";
import { streamOf } from "./stream.ts";

test("the fixture's heartbeats give the levels that the prototype's page was captured with", () => {
	const levels = overview.cluster.nodes.map((n) =>
		heartbeatLevel(
			n.heartbeats.map((ago) => -ago),
			0,
		),
	);

	expect(levels[0]).toBe(1);
	expect(levels[1]).toBeCloseTo(0.62, 10);
	expect(levels[2]).toBeCloseTo(0.3, 10);
});

test("the fixture survives the stream: the page selects from the burst what the burst was made from", () => {
	let snapshot: Snapshot = {
		document: {},
		series: new Map(),
		beats: new Map(),
	};
	for (const [name, data] of streamOf(application, overview)) {
		const event = parseEvent(name, JSON.stringify(data));
		expect(event, name).toBeDefined();
		snapshot = apply(snapshot, event as NonNullable<typeof event>, 10_000);
	}

	// Times that are worked out from others differ from them in the last digits.
	const rounded = (v: unknown) =>
		JSON.parse(JSON.stringify(v), (_, x) =>
			typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x,
		);

	expect(rounded(selectCluster(snapshot, 10_000))).toEqual(
		rounded({ application, overview }),
	);
});
