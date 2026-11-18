import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { StackedBar } from "./StackedBar.tsx";

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

test("a segment that has no width is not drawn", () => {
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
	expect(container.querySelectorAll("rect")).toHaveLength(2);
});
