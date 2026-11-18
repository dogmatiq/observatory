import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { stubBrowser } from "../test-support.ts";
import { LiveData, useElapsed, useScrolled } from "./live.tsx";

let frames: FrameRequestCallback[];

beforeEach(() => {
	stubBrowser();
	frames = [];
	vi.useFakeTimers();
	vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
		frames.push(f);
		return frames.length;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function Elapsed() {
	return (
		<>
			<p>elapsed {useElapsed()}</p>
			<p>scrolled {useScrolled()}</p>
		</>
	);
}

/** Records the time that each of its renders is given. */
function Probe({ seen }: { seen: number[] }) {
	seen.push(useElapsed());
	return null;
}

/** A clock that the test sets. */
function clockAt(start: number) {
	let now = start;
	return {
		clock: { now: () => now },
		set: (t: number) => {
			now = t;
		},
	};
}

/** Runs the animation frame that is waiting, if there is one. */
function drawFrame() {
	const f = frames.pop();
	act(() => f?.(0));
}

test("outside LiveData no time has passed", () => {
	render(<Elapsed />);

	expect(screen.getByText("elapsed 0")).toBeDefined();
});

test("it gives the time since the data arrived, and moves on with each frame", () => {
	const { clock, set } = clockAt(5000);
	render(
		<LiveData receivedAt={4000} clock={clock}>
			<Elapsed />
		</LiveData>,
	);

	expect(screen.getByText("elapsed 1000")).toBeDefined();

	set(5250);
	drawFrame();

	expect(screen.getByText("scrolled 1250")).toBeDefined();
});

test("it starts again from zero when new data arrives", () => {
	const { clock, set } = clockAt(5000);
	const page = (receivedAt: number) => (
		<LiveData receivedAt={receivedAt} clock={clock}>
			<Elapsed />
		</LiveData>
	);
	const { rerender } = render(page(4000));

	set(6000);
	rerender(page(6000));

	expect(screen.getByText("elapsed 0")).toBeDefined();
});

test("the render that shows new data never has the time since the data before it", () => {
	const { clock, set } = clockAt(5000);
	const seen: number[] = [];
	const page = (receivedAt: number) => (
		<LiveData receivedAt={receivedAt} clock={clock}>
			<Probe seen={seen} />
		</LiveData>
	);
	const { rerender } = render(page(4000));
	expect(seen.at(-1)).toBe(1000);

	set(6000);
	seen.length = 0;
	rerender(page(6000));

	expect(seen).not.toHaveLength(0);
	expect(new Set(seen)).toEqual(new Set([0]));
});

test("a viewer who prefers reduced motion gets an update once a second", () => {
	vi.stubGlobal(
		"matchMedia",
		(query: string) =>
			({
				matches: query.includes("prefers-reduced-motion"),
				media: query,
				addEventListener() {},
				removeEventListener() {},
			}) as unknown as MediaQueryList,
	);

	const { clock, set } = clockAt(0);
	render(
		<LiveData receivedAt={0} clock={clock}>
			<Elapsed />
		</LiveData>,
	);

	expect(frames).toHaveLength(0);

	set(1000);
	act(() => vi.advanceTimersByTime(1000));

	expect(screen.getByText("elapsed 1000")).toBeDefined();
	expect(screen.getByText("scrolled 0")).toBeDefined();
});
