import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Distrusted } from "../lib/distrust.tsx";
import { type Readout, ReadoutContext } from "../lib/readout.tsx";
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

test("a bar is an empty track if the numbers around it are not current", () => {
	const { container } = render(
		<Distrusted value>
			<StackedBar
				segments={[{ title: "A", readout: { figure: "A" }, value: 1 }]}
				subsystem="queues"
			/>
		</Distrusted>,
	);

	expect(segmentsOf(container)).toHaveLength(0);
});

test("each segment is a box as wide as its share of the bar, less a gap", () => {
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{ value: 3, title: "three", readout: { figure: "three" } },
				{ value: 1, title: "one", readout: { figure: "one" } },
			]}
		/>,
	);

	expect(
		segmentsOf(container).map((b) => [b.style.left, b.style.width]),
	).toEqual([
		["0%", "74.4%"],
		["75%", "25%"],
	]);
});

/**
 * pointable renders a bar inside a card that shows readouts, and returns the
 * bar's segments and the readouts that the card was given, in order.
 */
function pointable() {
	const given: (Readout | undefined)[] = [];
	const { container } = render(
		<ReadoutContext.Provider value={(r) => given.push(r)}>
			<StackedBar
				subsystem="queues"
				segments={[
					{
						value: 3,
						title: "12 messages in queue 113cbdc3",
						readout: { subject: "queue 113cbdc3", figure: "12", share: "75%" },
					},
					{
						value: 1,
						title: "4 messages in queue 4aeaa462",
						readout: { subject: "queue 4aeaa462", figure: "4", share: "25%" },
					},
				]}
			/>
		</ReadoutContext.Provider>,
	);
	return { boxes: segmentsOf(container), given };
}

test("pointing at a segment gives the card's readout what the segment says, and leaving it takes it away", () => {
	const { boxes, given } = pointable();

	fireEvent.pointerEnter(boxes[1] as Element, { pointerType: "mouse" });
	expect(given.at(-1)?.subject).toBe("queue 4aeaa462");

	fireEvent.pointerLeave(boxes[1] as Element, { pointerType: "mouse" });
	expect(given.at(-1)).toBeUndefined();
});

test("on a screen that is touched, a tap on a segment points at it, and a tap elsewhere ends it", () => {
	const { boxes, given } = pointable();

	fireEvent.pointerDown(boxes[0] as Element, { pointerType: "touch" });
	fireEvent.pointerLeave(boxes[0] as Element, { pointerType: "touch" });
	expect(given.at(-1)?.subject).toBe("queue 113cbdc3");

	fireEvent.pointerDown(document.body, { pointerType: "touch" });
	expect(given.at(-1)).toBeUndefined();
});

test("a tap on a segment of a bar in a card that is a link doesn't follow the link", () => {
	const { boxes } = pointable();

	fireEvent.pointerDown(boxes[0] as Element, { pointerType: "touch" });

	expect(fireEvent.click(boxes[0] as Element)).toBe(false);
});

test("a segment that has no width is drawn with none, so that it can shrink away", () => {
	const { container } = render(
		<StackedBar
			subsystem="streams"
			segments={[
				{ value: 1000, title: "big", readout: { figure: "big" } },
				{ value: 1, title: "tiny", readout: { figure: "tiny" } },
				{ value: 1000, title: "big", readout: { figure: "big" } },
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
				readout: { figure: `${i}` },
			}))}
		/>
	);
	const { container, rerender } = render(bar(3));

	rerender(bar(2));
	const boxes = segmentsOf(container);
	expect(boxes).toHaveLength(3);
	expect(boxes[2]?.style.width).toBe("0%");

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
			readout: { subject: `node ${i}`, figure: "1" },
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
				{ value: 3, title: "three", readout: { figure: "three" } },
				{ value: 1, title: "one", readout: { figure: "one" } },
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
				{
					title: "first",
					readout: { figure: "first" },
					opacity: 0.5,
					percent: 50,
				},
				{
					title: "second",
					readout: { figure: "second" },
					opacity: 0.5,
					percent: 50,
				},
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
				{ value: 1, title: "one", readout: { figure: "one" } },
				{ value: 1, title: "two", readout: { figure: "two" } },
				{ value: 1, title: "three", readout: { figure: "three" } },
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
