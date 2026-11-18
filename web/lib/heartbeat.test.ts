import { expect, test } from "vitest";
import { heartbeatLine } from "./heartbeat.ts";

test("there is no line without nodes", () => {
	expect(heartbeatLine([], 400, 48, 1)).toEqual([]);
});

test("the line runs from edge to edge, a point every two pixels", () => {
	const points = heartbeatLine([1, 0.5], 400, 48, 1);

	expect(points[0]?.[0]).toBe(0);
	expect(points.at(-1)?.[0]).toBe(400);
	expect(points).toHaveLength(201);
});

test("the line is at a node's level in the middle of its share", () => {
	// Three nodes share 300 pixels, so their middles are at 50, 150 and 250.
	const points = heartbeatLine([1, 0, 0.5], 300, 100, 1);
	const at = (x: number) => points.find(([px]) => px === x)?.[1];

	// An empty level sits 2 pixels above the bottom, and a full one is 60% of
	// the height above that.
	expect(at(50)).toBeCloseTo(98 - 60);
	expect(at(150)).toBeCloseTo(98);
	expect(at(250)).toBeCloseTo(98 - 30);
});

test("the line eases from one node's level to the next", () => {
	const points = heartbeatLine([1, 0], 200, 100, 1);
	const at = (x: number) => points.find(([px]) => px === x)?.[1] as number;

	// Halfway between the two middles, the line is halfway between the levels.
	expect(at(100)).toBeCloseTo(98 - 30);
	// It is flat before the first middle and after the last.
	expect(at(0)).toBeCloseTo(at(50));
	expect(at(200)).toBeCloseTo(at(150));
});

test("on a denser screen the line has more points but the same shape", () => {
	const sparse = heartbeatLine([1, 0.2], 200, 50, 1);
	const dense = heartbeatLine([1, 0.2], 400, 100, 2);

	expect(dense).toHaveLength(sparse.length);
	for (const [i, [x, y]] of dense.entries()) {
		expect(x).toBe((sparse[i]?.[0] as number) * 2);
		expect(y).toBeCloseTo((sparse[i]?.[1] as number) * 2);
	}
});
