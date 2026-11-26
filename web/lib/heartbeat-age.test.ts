import { expect, test } from "vitest";
import { heartbeatAge } from "./heartbeat-age.ts";

// A node whose latest heartbeat arrived 1 s before the data.
const node = { heartbeats: [4000, 1000] };

test("the age of the latest heartbeat is just now, then in seconds ago", () => {
	expect(heartbeatAge(node, 0)).toBe("heartbeat just now");
	expect(heartbeatAge(node, 1000)).toBe("heartbeat 2 s ago");
	expect(heartbeatAge(node, 20_000)).toBe("heartbeat 21 s ago");
});

test("a node with no heartbeats has no age", () => {
	expect(heartbeatAge({ heartbeats: [] }, 0)).toBeUndefined();
});
