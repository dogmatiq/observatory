import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FakeEventSource, stubEventSource } from "../test-support.ts";
import { retryInterval, unknownInterval, useWatched } from "./watch.ts";

let now = 42;
const clock = { now: () => now };

/** The fake streams that were opened, and not closed by the code under test. */
const open = () => FakeEventSource.live;

/** Sends the burst that begins a connection, naming the application. */
function burst(source: FakeEventSource | undefined, name: string) {
	act(() => {
		source?.open();
		source?.send("changed", { application: { name, key: "k" } });
		source?.send("synced");
	});
}

/** Answers the questions about the cluster, in order, with a status. */
function answers(...statuses: (number | "down")[]) {
	let n = 0;
	const fetch = vi.fn(async () => {
		const r = statuses[Math.min(n++, statuses.length - 1)];
		if (r === "down") {
			throw new TypeError("network");
		}
		return new Response(r === 200 ? '{"ignored":true}' : "", { status: r });
	});
	vi.stubGlobal("fetch", fetch);
	return fetch;
}

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

beforeEach(() => {
	now = 42;
	vi.useFakeTimers();
	stubEventSource();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test("it opens the stream after the current task, and not before", async () => {
	const fetch = answers(200);
	const { result } = renderHook(() => useWatched("c", clock));

	expect(result.current).toEqual({ status: "loading" });
	expect(FakeEventSource.opened).toHaveLength(0);

	await settle();

	expect(FakeEventSource.opened).toHaveLength(1);
	expect(fetch).not.toHaveBeenCalled();
});

test("a page that is started, stopped and started again opens the stream once", async () => {
	answers(200);
	const { unmount } = renderHook(() => useWatched("c", clock));
	unmount();
	renderHook(() => useWatched("c", clock));
	await settle();

	expect(FakeEventSource.opened).toHaveLength(1);
});

test("it shows nothing until the burst ends", async () => {
	answers(200);
	const { result } = renderHook(() => useWatched("c d", clock));
	await settle();

	expect(open().map((s) => s.url)).toEqual(["/api/clusters/c%20d/watch"]);
	expect(result.current).toEqual({ status: "loading" });

	act(() => {
		open()[0]?.open();
		open()[0]?.send("changed", { application: { name: "a", key: "k" } });
	});
	expect(result.current).toEqual({ status: "loading" });

	act(() => open()[0]?.send("synced"));
	expect(result.current).toMatchObject({
		status: "ready",
		data: { application: { name: "a", key: "k" } },
		at: 42,
	});
});

test("each message after the burst changes the data, and its time", async () => {
	answers(200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	burst(open()[0], "a");

	now = 100;
	act(() => open()[0]?.send("changed", { application: { name: "b" } }));

	expect(result.current).toMatchObject({
		status: "ready",
		data: { application: { name: "b" } },
		at: 100,
	});
});

test("the times in the data are measured from the time that it last changed", async () => {
	answers(200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();

	act(() => {
		const s = open()[0];
		s?.open();
		s?.send("changed", {
			application: { name: "a", key: "k" },
			nodes: { n: { workloads: 1 } },
		});
		s?.send("synced");
	});

	now = 1000;
	act(() => open()[0]?.send("heartbeat", { node: "n", msBefore: 0 }));
	now = 1500;
	act(() => open()[0]?.send("heartbeat", { node: "n", msBefore: 0 }));

	expect(
		result.current.status === "ready" &&
			result.current.data.overview.cluster.nodes[0]?.heartbeats,
	).toEqual([500, 0]);
});

test("it never asks about the cluster while the stream is healthy", async () => {
	const fetch = answers(200);
	renderHook(() => useWatched("c", clock));
	await settle();
	burst(open()[0], "a");

	await later(60_000);

	expect(fetch).not.toHaveBeenCalled();
});

test("a cluster that isn't known ends the stream for good, and is shown as unknown", async () => {
	const fetch = answers(404);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();

	// The browser can't read the status of a stream that it fails to open.
	act(() => open()[0]?.fail(true));
	await settle();

	expect(fetch).toHaveBeenCalledTimes(1);
	expect(result.current).toEqual({ status: "unknown" });
	expect(open()).toHaveLength(0);
});

test("a cluster that isn't known is asked about again, and the page comes alive when it becomes known", async () => {
	const fetch = answers(404, 404, 200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	act(() => open()[0]?.fail(true));
	await settle();
	expect(result.current).toEqual({ status: "unknown" });

	// Still not known, five seconds later.
	await later(unknownInterval);
	expect(fetch).toHaveBeenCalledTimes(2);
	expect(result.current).toEqual({ status: "unknown" });
	expect(open()).toHaveLength(0);

	// Known by the next time, so the stream is opened, and the burst is shown.
	await later(unknownInterval);
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(open()).toHaveLength(1);

	burst(open()[0], "a");
	expect(result.current).toMatchObject({
		status: "ready",
		data: { application: { name: "a" } },
	});
});

test("while the browser connects again the data is kept, as stale, until the next burst ends", async () => {
	answers(200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	burst(open()[0], "a");

	act(() => open()[0]?.fail());
	expect(result.current).toMatchObject({
		status: "stale",
		data: { application: { name: "a" } },
	});
	expect(FakeEventSource.opened).toHaveLength(1);

	act(() => {
		open()[0]?.open();
		open()[0]?.send("changed", { application: { name: "b", key: "k" } });
	});
	expect(result.current).toMatchObject({
		status: "stale",
		data: { application: { name: "a" } },
	});

	act(() => open()[0]?.send("synced"));
	expect(result.current).toMatchObject({
		status: "ready",
		data: { application: { name: "b" } },
	});
});

test("a stream that ended for good is replaced after the cluster is asked about again", async () => {
	const fetch = answers(200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	burst(open()[0], "a");

	act(() => open()[0]?.fail(true));
	await settle();

	expect(fetch).toHaveBeenCalledTimes(1);
	expect(result.current.status).toBe("stale");
	expect(open()).toHaveLength(1);
	expect(FakeEventSource.opened).toHaveLength(2);

	burst(open()[0], "b");
	expect(result.current).toMatchObject({
		status: "ready",
		data: { application: { name: "b" } },
	});
});

test("a cluster that is gone altogether when its stream ends for good is unknown", async () => {
	answers(404);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	burst(open()[0], "a");

	act(() => open()[0]?.fail(true));
	await settle();

	expect(result.current).toEqual({ status: "unknown" });
	expect(open()).toHaveLength(0);
});

test("a question that fails is asked again after the interval, and never at the same time as another", async () => {
	const fetch = answers("down", "down", 200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	act(() => open()[0]?.fail(true));
	await settle();

	expect(result.current).toEqual({ status: "failed" });

	await later(retryInterval - 1);
	expect(fetch).toHaveBeenCalledTimes(1);

	await later(1);
	expect(fetch).toHaveBeenCalledTimes(2);

	await later(retryInterval);
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(open()).toHaveLength(1);

	burst(open()[0], "a");
	expect(result.current).toMatchObject({ status: "ready" });
});

test("after a stream ends for good and the question fails, the data is stale until the cluster is watched again", async () => {
	answers("down", 200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	burst(open()[0], "a");

	act(() => open()[0]?.fail(true));
	await settle();
	expect(result.current).toMatchObject({
		status: "stale",
		data: { application: { name: "a" } },
	});

	await later(retryInterval);
	burst(open()[0], "b");
	expect(result.current).toMatchObject({
		status: "ready",
		data: { application: { name: "b" } },
	});
});

test("a message that can't be understood makes the page stale", async () => {
	answers(200);
	const { result } = renderHook(() => useWatched("c", clock));
	await settle();
	burst(open()[0], "a");

	act(() => open()[0]?.send("changed", "not JSON"));

	expect(result.current).toMatchObject({
		status: "stale",
		data: { application: { name: "a" } },
	});
});

test("it closes the stream when the cluster changes, and when the page stops showing it", async () => {
	answers(200);
	const { rerender, unmount } = renderHook(({ id }) => useWatched(id, clock), {
		initialProps: { id: "c1" },
	});
	await settle();
	const first = FakeEventSource.opened[0];

	rerender({ id: "c2" });
	await settle();

	expect(first?.closed).toBe(true);
	expect(open().map((s) => s.url)).toEqual(["/api/clusters/c2/watch"]);

	unmount();
	expect(open()).toHaveLength(0);
});

test("a cluster that changes starts again with nothing shown", async () => {
	answers(200);
	const { result, rerender } = renderHook(({ id }) => useWatched(id, clock), {
		initialProps: { id: "c1" },
	});
	await settle();
	burst(open()[0], "a");

	rerender({ id: "c2" });

	expect(result.current).toEqual({ status: "loading" });
});

test("an answer that arrives after the page stopped showing the cluster does nothing", async () => {
	let finish: (r: Response) => void = () => {};
	vi.stubGlobal(
		"fetch",
		() => new Promise<Response>((resolve) => (finish = resolve)),
	);
	const { unmount } = renderHook(() => useWatched("c", clock));
	await settle();
	act(() => open()[0]?.fail(true));

	unmount();
	finish(new Response("", { status: 200 }));
	await settle();

	// Only the stream that failed was ever opened.
	expect(FakeEventSource.opened).toHaveLength(1);
});
