import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Failing } from "./MetricTile.tsx";

afterEach(cleanup);

/** The element that the count's animations are on. */
const animating = (container: HTMLElement) =>
	container.querySelector(".inline-grid");

// While the count glitches, its text is drawn more than once, and the first is
// the one that takes up the room.
const failing = () => screen.queryAllByText(/^\+/)[0];

/**
 * Ends the animation of an element. React listens for the prefixed event where
 * the environment has no animation events, as jsdom has none.
 */
function endAnimation(element: Element | null) {
	fireEvent(element as Element, new Event("animationend", { bubbles: true }));
	fireEvent(
		element as Element,
		new Event("webkitAnimationEnd", { bubbles: true }),
	);
}

test("nothing is shown while no message is failing", () => {
	const { container } = render(<Failing count={0} size="stat" />);

	expect(container.textContent).toBe("");
});

test("the count is shown with a plus sign, and in full to a screen reader", () => {
	render(<Failing count={3} size="stat" />);

	expect(failing()?.textContent).toBe("+3");
	expect(screen.getByText(/3 messages failing/)).toBeDefined();
});

test("a count that is in place when the page loads doesn't animate", () => {
	const { container } = render(<Failing count={3} size="stat" />);

	expect(animating(container)?.className).not.toContain("failing-in");
});

test("a count that begins grows from nothing", () => {
	const { container, rerender } = render(<Failing count={0} size="stat" />);

	rerender(<Failing count={2} size="stat" />);

	expect(failing()?.textContent).toBe("+2");
	expect(animating(container)?.className).toContain("failing-in");

	endAnimation(animating(container));
	expect(animating(container)?.className).not.toContain("failing-in");
});

test("a count that begins glitches as it grows, and then is still", () => {
	const { container, rerender } = render(<Failing count={0} size="stat" />);

	rerender(<Failing count={2} size="stat" />);
	expect(container.querySelector(".glitch")).not.toBeNull();

	endAnimation(animating(container));
	expect(container.querySelector(".glitch")).toBeNull();
});

/** Lets the given time pass. */
function wait(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

test("a count that stops ramps down to +0 and stays for a moment, and then shrinks away, and goes", () => {
	vi.useFakeTimers();
	const { container, rerender } = render(<Failing count={2} size="stat" />);

	rerender(<Failing count={0} size="stat" />);
	wait(600);
	expect(failing()?.textContent).toBe("+0");
	expect(animating(container)?.className).not.toContain("failing-out");
	expect(container.textContent).not.toContain("failing");

	wait(200);
	expect(failing()?.textContent).toBe("+0");
	expect(animating(container)?.className).not.toContain("failing-out");

	wait(300);
	expect(animating(container)?.className).toContain("failing-out");

	endAnimation(animating(container));
	expect(container.textContent).toBe("");
	vi.useRealTimers();
});

test("a count that begins again while it stays at +0 stays, and doesn't grow again", () => {
	vi.useFakeTimers();
	const { container, rerender } = render(<Failing count={1} size="stat" />);

	rerender(<Failing count={0} size="stat" />);
	wait(500);
	rerender(<Failing count={1} size="stat" />);
	wait(100);
	expect(failing()?.textContent).toBe("+1");

	// The hold that it had is over, and it doesn't shrink away.
	wait(5000);
	expect(failing()?.textContent).toBe("+1");
	expect(animating(container)?.className).not.toContain("failing-in");
	expect(animating(container)?.className).not.toContain("failing-out");
	vi.useRealTimers();
});

test("a count that begins again while it shrinks away grows again", () => {
	vi.useFakeTimers();
	const { container, rerender } = render(<Failing count={2} size="stat" />);

	rerender(<Failing count={0} size="stat" />);
	wait(2100);
	expect(animating(container)?.className).toContain("failing-out");

	rerender(<Failing count={5} size="stat" />);
	wait(600);

	expect(failing()?.textContent).toBe("+5");
	expect(animating(container)?.className).toContain("failing-in");
	vi.useRealTimers();
});

test("a viewer who asks for less motion sees the count go when its moment is over", () => {
	vi.useFakeTimers();
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const { container, rerender } = render(<Failing count={2} size="stat" />);

	rerender(<Failing count={0} size="stat" />);
	wait(2100);

	expect(container.textContent).toBe("");
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

test("a count that changes while it is shown counts to the new count", async () => {
	const { rerender } = render(<Failing count={2} size="stat" />);

	rerender(<Failing count={7} size="stat" />);

	await waitFor(() => expect(failing()?.textContent).toBe("+7"));
});
