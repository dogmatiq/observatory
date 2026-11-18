import { expect, test } from "vitest";
import {
	countOf,
	formatCompact,
	formatNumber,
	nounFor,
	shortId,
} from "./format.ts";

test.each([
	[0, "0"],
	[999, "999"],
	[1000, "1,000"],
	[1234567, "1,234,567"],
])("formatNumber(%d) groups the digits", (n, want) => {
	expect(formatNumber(n)).toBe(want);
});

test.each([
	[0, "0"],
	[999, "999"],
	[1000, "1.0K"],
	[1181, "1.2K"],
	[12345, "12.3K"],
	[999949, "999.9K"],
	// A value that would round up to 1000.0K moves to the next unit.
	[999950, "1.0M"],
	[12_300_000, "12.3M"],
	[4_500_000_000, "4.5B"],
	// There is no unit above billions.
	[1_234_000_000_000, "1234.0B"],
	// A value exactly halfway between two tenths rounds to the even one, as the
	// prototype does, where "toFixed" would round both up.
	[1250, "1.2K"],
	[1750, "1.8K"],
	[2250, "2.2K"],
	[1050, "1.1K"],
])("formatCompact(%d) is %s", (n, want) => {
	expect(formatCompact(n)).toBe(want);
});

test("nounFor and countOf choose between the singular and the plural", () => {
	expect(nounFor(1, "event", "events")).toBe("event");
	expect(nounFor(0, "event", "events")).toBe("events");
	expect(countOf(1, "queue", "queues")).toBe("1 queue");
	expect(countOf(0, "queue", "queues")).toBe("0 queues");
	expect(countOf(1500, "queue", "queues")).toBe("1,500 queues");
});

test("shortId keeps the first eight characters", () => {
	expect(shortId("113cbdc3-a2d7-4415-b428-9cdce48b5dc0")).toBe("113cbdc3");
	expect(shortId("abc")).toBe("abc");
});
