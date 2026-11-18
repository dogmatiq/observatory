import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NodeBar, StackedBar } from "./StackedBar.tsx";

afterEach(cleanup);

test("an empty bar is an empty track that assistive technology skips", () => {
	const { container } = render(<StackedBar segments={[]} subsystem="queues" />);

	const svg = container.querySelector("svg");
	expect(svg?.getAttribute("aria-hidden")).toBe("true");
	expect(svg?.getAttribute("role")).toBeNull();
	expect(container.querySelectorAll("rect")).toHaveLength(0);
});

test("each segment is a rectangle whose tooltip is its title", () => {
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{ value: 3, title: "three" },
				{ value: 1, title: "one" },
			]}
		/>,
	);

	const rects = [...container.querySelectorAll("rect")];
	expect(rects.map((r) => r.querySelector("title")?.textContent)).toEqual([
		"three",
		"one",
	]);
	expect(
		rects.map((r) => [r.getAttribute("x"), r.getAttribute("width")]),
	).toEqual([
		["0.000", "74.400"],
		["75.000", "25.000"],
	]);
});

test("a segment that has no width is drawn with none, so that it can shrink away", () => {
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{ value: 1000, title: "big" },
				{ value: 1, title: "tiny" },
				{ value: 1000, title: "big" },
			]}
		/>,
	);

	// The tiny segment is narrower than the gap after it.
	const rects = [...container.querySelectorAll("rect")];
	expect(rects).toHaveLength(3);
	expect(rects[1]?.getAttribute("width")).toBe("0.000");
});

test("a segment that has gone is kept with no width while it shrinks away, and then removed", () => {
	vi.useFakeTimers();

	const bar = (n: number) => (
		<StackedBar
			subsystem="streams"
			segments={Array.from({ length: n }, (_, i) => ({
				value: 1,
				title: `${i}`,
			}))}
		/>
	);
	const { container, rerender } = render(bar(3));

	rerender(bar(2));
	const rects = [...container.querySelectorAll("rect")];
	expect(rects).toHaveLength(3);
	expect(rects[2]?.getAttribute("width")).toBe("0.000");
	expect(rects[2]?.querySelector("title")).toBeNull();

	act(() => {
		vi.advanceTimersByTime(700);
	});
	expect(container.querySelectorAll("rect")).toHaveLength(2);

	vi.useRealTimers();
});

test("the bar of nodes keeps a segment that has gone while it shrinks away, and hides it from assistive technology", () => {
	vi.useFakeTimers();

	const segments = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			title: `node ${i}`,
			opacity: 1,
			percent: 100 / n,
		}));
	const { container, rerender } = render(<NodeBar segments={segments(3)} />);

	rerender(<NodeBar segments={segments(2)} />);
	const bars = [...container.querySelectorAll("div.flex > div")];
	expect(bars).toHaveLength(3);
	expect(bars[2]?.getAttribute("aria-hidden")).toBe("true");
	expect(container.querySelectorAll("[role=img]")).toHaveLength(2);

	act(() => {
		vi.advanceTimersByTime(700);
	});
	expect(container.querySelectorAll("div.flex > div")).toHaveLength(2);

	vi.useRealTimers();
});
