import { expect, test } from "vitest";
import { deadlineLevel, expiredLevel, levelOf, riseTime } from "./levels.ts";

test("a level with a deadline is empty with no heartbeat", () => {
	expect(deadlineLevel([], 15_000, 5000)).toBe(0);
});

test("a level with a deadline is full once it has risen, and drains in a straight line to a third exactly at the deadline", () => {
	const deadline = 15_000;

	expect(expiredLevel).toBeCloseTo(1 / 3);
	expect(deadlineLevel([0], deadline, riseTime)).toBe(1);
	expect(deadlineLevel([0], deadline, (riseTime + deadline) / 2)).toBeCloseTo(
		(1 + expiredLevel) / 2,
	);
	expect(deadlineLevel([0], deadline, deadline - 1)).toBeGreaterThan(
		expiredLevel,
	);
	expect(deadlineLevel([0], deadline, deadline)).toBeCloseTo(expiredLevel);
	expect(deadlineLevel([0], deadline, deadline + 10_000)).toBeCloseTo(
		expiredLevel,
	);
});

test("a heartbeat with a deadline rises from the level that the one before it had drained to", () => {
	// Deadlines 15 s after each heartbeat, and a heartbeat half way through the
	// drain of the one before it.
	const arrives = (riseTime + 15_000) / 2;
	const from = deadlineLevel([0], 15_000, arrives);

	const level = deadlineLevel(
		[0, arrives],
		arrives + 15_000,
		arrives + riseTime / 2,
	);

	expect(level).toBeCloseTo(from + (1 - from) / 2);
});

test("a node's level drains to its deadline, from the times of its heartbeats before the data arrived", () => {
	// The latest heartbeat arrived 1 s before the data, and expires 15 s after
	// it arrived, so 14 s after the data arrived.
	const node = { heartbeats: [4000, 1000], deadline: 14_000 };

	expect(levelOf(node, 14_000)).toBeCloseTo(expiredLevel);
	expect(levelOf(node, 0)).toBeGreaterThan(0.9);
});

test("a node whose heartbeats give no way to calculate a deadline stays full", () => {
	expect(levelOf({ heartbeats: [60_000] }, 0)).toBe(1);
	expect(levelOf({ heartbeats: [] }, 600_000)).toBe(1);
});
