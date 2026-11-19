import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { overview } from "../fixtures/overview.ts";
import { Distrusted } from "../lib/distrust.tsx";
import { LiveData } from "../lib/live.tsx";
import { type Readout, ReadoutContext } from "../lib/readout.tsx";
import { sparklineWidth } from "../lib/sparkline.ts";
import { stubBrowser } from "../test-support.ts";
import { Sparkline } from "./Sparkline.tsx";

afterEach(cleanup);

test("it is hidden from assistive technology", () => {
	const { container } = render(<Sparkline chart={overview.events.history} />);

	expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
		"true",
	);
});

test("a chart with no points draws nothing", () => {
	const { container } = render(<Sparkline chart={{ end: 0, points: [] }} />);

	expect(container.querySelectorAll("path")).toHaveLength(0);
});

test("a chart that fills the window has an area and a line", () => {
	const { container } = render(<Sparkline chart={overview.events.history} />);

	expect(container.querySelectorAll("path")).toHaveLength(2);
	expect(container.querySelector("linearGradient")).toBeNull();
});

test("a chart with a lead-in fades its paths in with gradients", () => {
	const { container } = render(
		<Sparkline
			chart={{
				end: 0,
				points: [
					{ at: -30_000, value: 1 },
					{ at: 0, value: 2 },
				],
			}}
		/>,
	);

	const gradients = [...container.querySelectorAll("linearGradient")];
	expect(gradients).toHaveLength(2);

	// Each path is filled or stroked by one of the gradients.
	const references = [...container.querySelectorAll("path")].map((p) =>
		[p.getAttribute("fill"), p.getAttribute("stroke")].find((v) =>
			v?.startsWith("url("),
		),
	);
	expect(references).toHaveLength(2);
	expect(references.map((r) => r?.match(/^url\(#(.*)\)$/)?.[1]).sort()).toEqual(
		gradients.map((g) => g.id).sort(),
	);
});

test("two charts with lead-ins do not share gradients", () => {
	const chart = {
		end: 0,
		points: [{ at: -30_000, value: 1 }],
	};
	const { container } = render(
		<>
			<Sparkline chart={chart} />
			<Sparkline chart={chart} />
		</>,
	);

	const ids = [...container.querySelectorAll("linearGradient")].map(
		(g) => g.id,
	);
	expect(new Set(ids).size).toBe(4);
});

describe("between updates", () => {
	const chart = {
		end: 0,
		points: [
			{ at: -30_000, value: 1 },
			{ at: -10_000, value: 2 },
			{ at: 0, value: 3 },
		],
	};

	let frames: FrameRequestCallback[] = [];
	let now = 0;

	beforeEach(() => {
		stubBrowser();
		frames = [];
		now = 0;
		vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
			frames.push(f);
			return frames.length;
		});
		vi.stubGlobal("cancelAnimationFrame", () => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function renderLive() {
		return render(
			<LiveData receivedAt={0} clock={{ now: () => now }}>
				<Sparkline chart={chart} />
			</LiveData>,
		);
	}

	function line(container: HTMLElement) {
		// The line is the second path, after the area.
		return container.querySelectorAll("path")[1]?.getAttribute("d");
	}

	test("the chart scrolls left as time passes", () => {
		const { container } = renderLive();
		const before = line(container);

		now = 6000;
		act(() => frames.pop()?.(0));

		// The newest point was at the right-hand edge, and is now 6 seconds, which
		// is a tenth of the window, to the left of it.
		const x = (d: string | null | undefined) =>
			Number(
				d
					?.match(/L([\d.-]+) /g)
					?.at(-2)
					?.slice(1),
			);
		expect(x(before)).not.toBe(x(line(container)));
		expect(x(before) - x(line(container))).toBeCloseTo(sparklineWidth / 10, 0);
	});

	test("the chart doesn't scroll if the viewer prefers reduced motion", () => {
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

		const { container } = renderLive();
		const before = line(container);

		now = 6000;
		act(() => frames.pop()?.(0));

		expect(line(container)).toBe(before);
	});

	test("the chart doesn't scroll if the numbers around it are not current", () => {
		const { container } = render(
			<Distrusted value>
				<LiveData receivedAt={0} clock={{ now: () => now }}>
					<Sparkline chart={chart} />
				</LiveData>
			</Distrusted>,
		);
		const before = line(container);

		now = 6000;
		act(() => frames.pop()?.(0));

		expect(line(container)).toBe(before);
	});
});

describe("pointing at a chart", () => {
	const chart = {
		end: 0,
		points: [
			{ at: -60_000, value: 10 },
			{ at: 0, value: 70 },
		],
	};
	const write = (value: number) => ({
		figure: String(Math.round(value)),
		unit: "things",
	});

	beforeEach(() => {
		vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue(
			{
				left: 0,
				width: 240,
			} as DOMRect,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	/** Renders a chart, and returns the readouts that it gives to the page. */
	function chartWithReadouts() {
		const readouts: (Readout | undefined)[] = [];
		const { container } = render(
			<ReadoutContext.Provider value={(r) => readouts.push(r)}>
				<Sparkline chart={chart} describe={write} className="h-12" />
			</ReadoutContext.Provider>,
		);
		const layer = container.querySelector("div") as HTMLElement;
		return { layer, last: () => readouts[readouts.length - 1] };
	}

	test("gives the value at that place and how long ago it was, until the pointer leaves", () => {
		const { layer, last } = chartWithReadouts();

		fireEvent.pointerMove(layer, { clientX: 120 });
		expect(last()).toEqual({ figure: "40", unit: "things", age: "30 s ago" });

		fireEvent.pointerMove(layer, { clientX: 240 });
		expect(last()).toEqual({ figure: "70", unit: "things", age: "now" });

		fireEvent.pointerLeave(layer);
		expect(last()).toBeUndefined();
	});

	test("there is no cursor over a chart that has no describe", () => {
		const { container } = render(<Sparkline chart={chart} />);

		expect(container.querySelector("div")).toBeNull();
	});
});
