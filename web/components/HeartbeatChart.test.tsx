import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const lines: { levels: readonly number[]; weights: readonly number[] }[] = [];

vi.mock("../lib/heartbeat.ts", () => ({
	heartbeatLine: (
		levels: readonly number[],
		_width: number,
		_height: number,
		_ratio: number,
		weights: readonly number[],
	) => {
		lines.push({ levels, weights });
		return [];
	},
}));

import { HeartbeatChart } from "./HeartbeatChart.tsx";

let frames: FrameRequestCallback[] = [];
let now = 0;

beforeEach(() => {
	lines.length = 0;
	frames = [];
	now = 0;
	vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) =>
		frames.push(f),
	);
	vi.stubGlobal("cancelAnimationFrame", () => {});
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.stubGlobal("matchMedia", () => ({
		addEventListener() {},
		removeEventListener() {},
	}));
	vi.spyOn(performance, "now").mockImplementation(() => now);
	HTMLCanvasElement.prototype.getContext = (() => ({
		clearRect() {},
	})) as never;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** Runs the next animation frame, a number of milliseconds later. */
function advance(ms: number) {
	now += ms;
	const run = frames;
	frames = [];
	for (const f of run) {
		f(now);
	}
}

const last = () => lines.at(-1) as (typeof lines)[number];

test("the nodes that the chart is first given have all of their shares", () => {
	render(
		<HeartbeatChart
			sections={[
				{ id: "a", level: 1 },
				{ id: "b", level: 0.5 },
			]}
		/>,
	);

	expect(last().levels).toEqual([1, 0.5]);
	expect(last().weights).toEqual([1, 1]);
});

test("a node that leaves keeps its place and its level while its share shrinks away", () => {
	const { rerender } = render(
		<HeartbeatChart
			sections={[
				{ id: "a", level: 1 },
				{ id: "b", level: 0.5 },
				{ id: "c", level: 0.2 },
			]}
		/>,
	);

	rerender(
		<HeartbeatChart
			sections={[
				{ id: "a", level: 1 },
				{ id: "c", level: 0.2 },
			]}
		/>,
	);

	// It has not gone yet.
	expect(last().levels).toEqual([1, 0.5, 0.2]);
	expect(last().weights).toEqual([1, 1, 1]);

	advance(250);
	expect(last().levels).toEqual([1, 0.5, 0.2]);
	expect(last().weights[1]).toBeCloseTo(0.5, 1);

	advance(300);
	expect(last().levels).toEqual([1, 0.2]);
	expect(last().weights).toEqual([1, 1]);
});

test("a node that joins grows from nothing", () => {
	const { rerender } = render(
		<HeartbeatChart sections={[{ id: "a", level: 1 }]} />,
	);

	rerender(
		<HeartbeatChart
			sections={[
				{ id: "a", level: 1 },
				{ id: "b", level: 0 },
			]}
		/>,
	);

	expect(last().weights).toEqual([1, 0]);

	advance(250);
	expect(last().weights[1]).toBeCloseTo(0.5, 1);

	advance(300);
	expect(last().weights).toEqual([1, 1]);
});
