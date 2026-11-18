import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NotFound } from "./api.ts";
import { pollInterval, usePolled } from "./poll.ts";

const clock = { now: () => 42 };

beforeEach(() => {
	vi.useFakeTimers();
	setHidden(false);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function setHidden(hidden: boolean) {
	Object.defineProperty(document, "hidden", {
		configurable: true,
		value: hidden,
	});
	document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets the reads that are waiting finish. */
async function settle() {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(0);
	});
}

async function later(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

test("a page that is started, stopped and started again reads once", async () => {
	const read = vi.fn(async () => "x");

	const { unmount } = renderHook(() => usePolled(read, clock));
	unmount();
	renderHook(() => usePolled(read, clock));
	await settle();

	expect(read).toHaveBeenCalledTimes(1);
});

test("nothing is known before the first read ends", () => {
	const read = vi.fn(() => new Promise<string>(() => {}));
	const { result } = renderHook(() => usePolled(read, clock));

	expect(result.current).toEqual({ status: "loading" });
});

test("it returns what was read, and when", async () => {
	const read = vi.fn(async () => "a");
	const { result } = renderHook(() => usePolled(read, clock));
	await settle();

	expect(result.current).toEqual({ status: "ready", data: "a", at: 42 });
});

test("it reads again after the interval, and not before", async () => {
	let n = 0;
	const read = vi.fn(async () => `read ${++n}`);
	const { result } = renderHook(() => usePolled(read, clock));
	await settle();

	await later(pollInterval - 1);
	expect(read).toHaveBeenCalledTimes(1);

	await later(1);
	expect(read).toHaveBeenCalledTimes(2);
	expect(result.current).toMatchObject({ status: "ready", data: "read 2" });
});

test("a failed read keeps the data of the last good one, as stale", async () => {
	let fail = false;
	const read = vi.fn(async () => {
		if (fail) {
			throw new Error("down");
		}
		return "a";
	});
	const { result } = renderHook(() => usePolled(read, clock));
	await settle();

	fail = true;
	await later(pollInterval);

	expect(result.current).toEqual({ status: "stale", data: "a", at: 42 });

	fail = false;
	await later(pollInterval);

	expect(result.current).toMatchObject({ status: "ready", data: "a" });
});

test("the first read failing leaves nothing to show, and it tries again", async () => {
	let fail = true;
	const read = vi.fn(async () => {
		if (fail) {
			throw new Error("down");
		}
		return "a";
	});
	const { result } = renderHook(() => usePolled(read, clock));
	await settle();

	expect(result.current).toEqual({ status: "failed" });

	fail = false;
	await later(pollInterval);

	expect(result.current).toMatchObject({ status: "ready", data: "a" });
});

test("something that is not known is not read again", async () => {
	const read = vi.fn(async () => {
		throw new NotFound();
	});
	const { result } = renderHook(() => usePolled(read, clock));
	await settle();

	await later(10 * pollInterval);

	expect(result.current).toEqual({ status: "unknown" });
	expect(read).toHaveBeenCalledTimes(1);
});

test("nothing is read while the page is hidden, and it reads at once when shown", async () => {
	const read = vi.fn(async () => "a");
	renderHook(() => usePolled(read, clock));
	await settle();

	setHidden(true);
	await later(10 * pollInterval);
	expect(read).toHaveBeenCalledTimes(1);

	setHidden(false);
	await settle();
	expect(read).toHaveBeenCalledTimes(2);
});

test("a read that ends after the page has gone changes nothing", async () => {
	let finish: (value: string) => void = () => {};
	const read = vi.fn(
		(signal: AbortSignal) =>
			new Promise<string>((resolve, reject) => {
				finish = resolve;
				signal.addEventListener("abort", () => reject(new Error("aborted")));
			}),
	);
	const { result, unmount } = renderHook(() => usePolled(read, clock));
	await settle();

	unmount();
	finish("late");
	await settle();

	expect(result.current).toEqual({ status: "loading" });
	await later(10 * pollInterval);
	expect(read).toHaveBeenCalledTimes(1);
});
