import { expect, test } from "vitest";
import { heartbeatAge, latenessOf } from "./lateness.ts";

// A node whose latest heartbeat arrived 1 s before the data, which its engine
// sends every 3 s, and which expires 15 s after it arrived.
const node = { heartbeats: [4000, 1000], deadline: 14_000, interval: 3000 };

test("a heartbeat isn't late until the interval has passed since the latest one", () => {
	expect(latenessOf(node, 0)).toBeUndefined();
	expect(latenessOf(node, 2000)).toBeUndefined();
});

test("a late heartbeat's lateness grows from 0 when it was due to 1 when the latest one expires", () => {
	expect(latenessOf(node, 2000 + 6000)).toBeCloseTo(0.5);
	expect(latenessOf(node, 2000 + 11_999)).toBeCloseTo(1, 3);
});

test("a heartbeat isn't late once the latest one has expired", () => {
	expect(latenessOf(node, 14_000)).toBeUndefined();
});

test("a node that doesn't give an interval or a deadline is never late", () => {
	expect(latenessOf({ ...node, interval: undefined }, 8000)).toBeUndefined();
	expect(latenessOf({ ...node, deadline: undefined }, 8000)).toBeUndefined();
	expect(latenessOf({ heartbeats: [], interval: 3000 }, 8000)).toBeUndefined();
});

test("the age of the latest heartbeat is just now, then in seconds ago", () => {
	expect(heartbeatAge(node, 0)).toBe("heartbeat just now");
	expect(heartbeatAge(node, 1000)).toBe("heartbeat 2 s ago");
});

test("the age of a late heartbeat says how late it is, by at least a second", () => {
	expect(heartbeatAge(node, 2100)).toBe("heartbeat 1 s late");
	expect(heartbeatAge(node, 2000 + 3000)).toBe("heartbeat 3 s late");
});

test("a node with no heartbeats has no age", () => {
	expect(heartbeatAge({ heartbeats: [] }, 0)).toBeUndefined();
});
