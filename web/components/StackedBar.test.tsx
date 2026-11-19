import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { tipOf } from "../test-support.ts";
import { NodeBar, StackedBar } from "./StackedBar.tsx";

afterEach(cleanup);

/** The segments of a bar, whether it is a [StackedBar] or a [NodeBar]. */
function segmentsOf(container: HTMLElement) {
	return [...container.querySelectorAll<HTMLElement>("div.h-2 > div")];
}

test("an empty bar is an empty track that assistive technology skips", () => {
	const { container } = render(<StackedBar segments={[]} subsystem="queues" />);

	const track = container.querySelector("div.h-2");
	expect(track?.getAttribute("aria-hidden")).toBe("true");
	expect(track?.getAttribute("role")).toBeNull();
	expect(segmentsOf(container)).toHaveLength(0);
});

test("each segment is a box whose popover is its title", async () => {
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{ value: 3, title: "three" },
				{ value: 1, title: "one" },
			]}
		/>,
	);

	const boxes = segmentsOf(container);
	expect([
		await tipOf(boxes[0] as Element),
		await tipOf(boxes[1] as Element),
	]).toEqual(["three", "one"]);
	expect(boxes.map((b) => [b.style.left, b.style.width])).toEqual([
		["0%", "74.4%"],
		["75%", "25%"],
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
	const boxes = segmentsOf(container);
	expect(boxes).toHaveLength(3);
	expect(boxes[1]?.style.width).toBe("0%");
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
	const boxes = segmentsOf(container);
	expect(boxes).toHaveLength(3);
	expect(boxes[2]?.style.width).toBe("0%");

	// What has gone has nothing to say.
	fireEvent.pointerEnter(boxes[2] as Element);
	act(() => {
		vi.advanceTimersByTime(400);
	});
	expect(screen.queryByRole("tooltip")).toBeNull();

	act(() => {
		vi.advanceTimersByTime(700);
	});
	expect(segmentsOf(container)).toHaveLength(2);

	vi.useRealTimers();
});

test("the bar of nodes keeps a segment that has gone while it shrinks away, and hides it from assistive technology", () => {
	vi.useFakeTimers();

	const segments = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			title: `node ${i}`,
			lead: `node ${i}`,
			id: `${i}`,
			opacity: 1,
			percent: 100 / n,
		}));
	const { container, rerender } = render(<NodeBar segments={segments(3)} />);

	rerender(<NodeBar segments={segments(2)} />);
	const bars = segmentsOf(container);
	expect(bars).toHaveLength(3);
	expect(bars[2]?.getAttribute("aria-hidden")).toBe("true");
	expect(container.querySelectorAll("[role=img]")).toHaveLength(2);

	act(() => {
		vi.advanceTimersByTime(700);
	});
	expect(segmentsOf(container)).toHaveLength(2);

	vi.useRealTimers();
});

test("a segment rises out of the bar while it is pointed at, and only that one", () => {
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{ value: 3, title: "three" },
				{ value: 1, title: "one" },
			]}
		/>,
	);

	const risen = () =>
		segmentsOf(container).map((b) => b.className.includes("-top-px"));
	const boxes = segmentsOf(container);
	expect(risen()).toEqual([false, false]);

	fireEvent.pointerEnter(boxes[1] as Element);
	expect(risen()).toEqual([false, true]);

	fireEvent.pointerLeave(boxes[1] as Element);
	expect(risen()).toEqual([false, false]);
});

test("a segment of the bar of nodes rises out of the bar while it is pointed at", () => {
	const { container } = render(
		<NodeBar
			segments={[
				{ title: "first", lead: "first", id: "1", opacity: 0.5, percent: 50 },
				{ title: "second", lead: "second", id: "2", opacity: 0.5, percent: 50 },
			]}
		/>,
	);

	const boxes = segmentsOf(container);
	fireEvent.pointerEnter(boxes[0] as Element);

	expect(boxes.map((b) => b.className.includes("-my-px"))).toEqual([
		true,
		false,
	]);
	expect(boxes.map((b) => b.style.opacity)).toEqual(["1", "0.5"]);
});

test("only the segments at the ends of a bar have its rounded corners", () => {
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{ value: 1, title: "one" },
				{ value: 1, title: "two" },
				{ value: 1, title: "three" },
			]}
		/>,
	);

	expect(
		segmentsOf(container).map((b) => [
			b.className.includes("rounded-l"),
			b.className.includes("rounded-r"),
		]),
	).toEqual([
		[true, false],
		[false, false],
		[false, true],
	]);
});

test("the popover of a segment of one thing has its ID as an identifier, that can be pointed at", async () => {
	const id = "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10";
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{
					value: 1,
					title: "3 events on event stream 8b0081fd",
					lead: "3 events on event stream",
					id,
				},
				{ value: 1, title: "5 events on 2 other event streams" },
			]}
		/>,
	);

	const boxes = segmentsOf(container);
	fireEvent.pointerEnter(boxes[0] as Element);
	const tip = await screen.findByRole("group");
	expect(tip.textContent).toBe("3 events on event stream 8b0081fd");
	expect(screen.getByRole("button", { name: "Copy ID" })).toBeDefined();
	fireEvent.pointerLeave(boxes[0] as Element);

	// The merged segment is of no one thing, and has nothing to copy.
	fireEvent.pointerEnter(boxes[1] as Element);
	await vi.waitFor(() => {
		expect(screen.getByRole("tooltip").textContent).toBe(
			"5 events on 2 other event streams",
		);
	});
});

test("the popover of a segment that has a card about it is the card", async () => {
	const id = "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10";
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{
					value: 3,
					title: "3 events on event stream 8b0081fd",
					about: {
						thing: "event-stream",
						id,
						amount: 3,
						share: 0.75,
						total: { amount: 4, things: 2 },
					},
				},
			]}
		/>,
	);

	fireEvent.pointerEnter(segmentsOf(container)[0] as Element);
	const card = await screen.findByRole("group");

	expect(card.textContent).toContain("Event stream");
	expect(card.textContent).toContain("75%");
});
