import { expect, test } from "vitest";
import { drainBeats, heartbeatLevel, riseTime } from "./levels.ts";

test("a node that has sent no heartbeat is empty", () => {
	expect(heartbeatLevel([], 5000)).toBe(0);
});

test("a level rises from empty to full after the first heartbeat", () => {
	expect(heartbeatLevel([1000], 1000)).toBe(0);
	expect(heartbeatLevel([1000], 1000 + riseTime / 2)).toBeCloseTo(0.5);
	expect(heartbeatLevel([1000], 1000 + riseTime)).toBe(1);
});

test("a level stays full until a second heartbeat shows the usual interval", () => {
	expect(heartbeatLevel([1000], 60_000)).toBe(1);
});

test("a level drains to empty over three of the usual intervals", () => {
	const beats = [0, 1000, 2000];
	const drained = 2000 + riseTime + drainBeats * 1000;

	expect(heartbeatLevel(beats, 2000 + riseTime)).toBe(1);
	expect(heartbeatLevel(beats, 2000 + riseTime + 1500)).toBeCloseTo(0.5);
	expect(heartbeatLevel(beats, drained)).toBe(0);
	expect(heartbeatLevel(beats, drained + 10_000)).toBe(0);
});

test("a heartbeat that arrives while the level is draining raises it from where it was", () => {
	// 1000 ms intervals, then a heartbeat arrives half way through the drain.
	const before = [0, 1000, 2000];
	const arrives = 2000 + riseTime + 1500;
	const from = heartbeatLevel(before, arrives);

	const level = heartbeatLevel([...before, arrives], arrives + riseTime / 2);

	expect(level).toBeCloseTo(from + (1 - from) / 2);
});

test("the usual interval is the median, so one late heartbeat does not slow the drain", () => {
	// Intervals of 1000, 1000 and 9000: the median is 1000.
	const beats = [0, 1000, 2000, 11_000];
	const now = 11_000 + riseTime + 1500;

	expect(heartbeatLevel(beats, now)).toBeCloseTo(0.5);
});

test("only the recent heartbeats set the usual interval", () => {
	// Ten heartbeats 1000 ms apart, after an old one 100 s earlier.
	const beats = [-100_000, ...Array.from({ length: 10 }, (_, i) => i * 1000)];
	const now = 9000 + riseTime + 1500;

	expect(heartbeatLevel(beats, now)).toBeCloseTo(0.5);
});
