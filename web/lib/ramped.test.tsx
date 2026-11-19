import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useRamped } from "./ramped.ts";

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/** Lets the given time pass, and returns what each step of 16 milliseconds showed. */
function pass(result: { current: number | undefined }, ms: number) {
	const seen: (number | undefined)[] = [];
	for (let t = 0; t < ms; t += 16) {
		act(() => {
			vi.advanceTimersByTime(16);
		});
		seen.push(result.current);
	}
	return seen;
}

test("a number that is shown first is shown as it is", () => {
	const { result } = renderHook(() => useRamped(347));

	expect(result.current).toBe(347);
});

test("a number that changes passes through the values in between, and ends on the new one", () => {
	const { result, rerender } = renderHook(({ n }) => useRamped(n), {
		initialProps: { n: 10 },
	});

	rerender({ n: 14 });
	const seen = pass(result, 400);

	// It doesn't skip: every value after the start is shown, in order.
	const distinct = [...new Set(seen)];
	expect(distinct).toEqual([11, 12, 13, 14]);
	expect(result.current).toBe(14);
});

test("a number ramps down as it ramps up", () => {
	const { result, rerender } = renderHook(({ n }) => useRamped(n), {
		initialProps: { n: 20 },
	});

	rerender({ n: 17 });

	expect([...new Set(pass(result, 400))]).toEqual([19, 18, 17]);
});

test("a number that changes by a lot takes no longer than half a second, and ends on the new one", () => {
	const { result, rerender } = renderHook(({ n }) => useRamped(n), {
		initialProps: { n: 0 },
	});

	rerender({ n: 100000 });
	pass(result, 520);

	expect(result.current).toBe(100000);
});

test("a number that changes again on the way ramps on from where it has got to", () => {
	const { result, rerender } = renderHook(({ n }) => useRamped(n), {
		initialProps: { n: 0 },
	});

	rerender({ n: 100 });
	pass(result, 100);
	const midway = result.current as number;
	expect(midway).toBeGreaterThan(0);
	expect(midway).toBeLessThan(100);

	rerender({ n: 0 });
	const seen = pass(result, 520);
	expect(seen[0] as number).toBeLessThanOrEqual(midway + 1);
	expect(result.current).toBe(0);
});

test("a number that has no value shows none, and the next ramps from the last that was shown", () => {
	const { result, rerender } = renderHook(({ n }) => useRamped(n), {
		initialProps: { n: 10 as number | undefined },
	});

	rerender({ n: undefined });
	expect(result.current).toBeUndefined();

	rerender({ n: 12 });
	expect([...new Set(pass(result, 400))]).toEqual([10, 11, 12]);
});

test("a number whose key changes doesn't ramp", () => {
	const { result, rerender } = renderHook(({ n, key }) => useRamped(n, key), {
		initialProps: { n: 347, key: "minute" },
	});

	rerender({ n: 24, key: "hour" });
	act(() => {
		vi.advanceTimersByTime(16);
	});

	expect(result.current).toBe(24);
});

test("a viewer who asks for less motion sees the new number at once", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const { result, rerender } = renderHook(({ n }) => useRamped(n), {
		initialProps: { n: 10 },
	});

	rerender({ n: 50 });
	act(() => {
		vi.advanceTimersByTime(16);
	});

	expect(result.current).toBe(50);
});

test("a number that isn't whole ramps through values that aren't", () => {
	const { result, rerender } = renderHook(({ n }) => useRamped(n), {
		initialProps: { n: 0.5 },
	});

	rerender({ n: 0.6 });
	const seen = pass(result, 400).filter((v) => v !== undefined) as number[];

	expect(seen.some((v) => v > 0.5 && v < 0.6)).toBe(true);
	expect(result.current).toBe(0.6);
});
