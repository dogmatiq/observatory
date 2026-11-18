import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Failing } from "./MetricTile.tsx";

afterEach(cleanup);

/** The element that the count's animations are on. */
const animating = (container: HTMLElement) =>
	container.querySelector(".inline-grid");

const failing = () => screen.queryByText(/^\+/);

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

test("a count that stops stays while it shrinks away, and then goes", () => {
	const { container, rerender } = render(<Failing count={2} size="stat" />);

	rerender(<Failing count={0} size="stat" />);

	expect(failing()?.textContent).toBe("+2");
	expect(animating(container)?.className).toContain("failing-out");

	endAnimation(animating(container));
	expect(container.textContent).toBe("");
});

test("a count that begins again while it shrinks away grows again", () => {
	const { container, rerender } = render(<Failing count={2} size="stat" />);

	rerender(<Failing count={0} size="stat" />);
	rerender(<Failing count={5} size="stat" />);

	expect(failing()?.textContent).toBe("+5");
	expect(animating(container)?.className).toContain("failing-in");
});

test("a count that changes while it is shown shows the new count", () => {
	const { rerender } = render(<Failing count={2} size="stat" />);

	rerender(<Failing count={7} size="stat" />);

	expect(failing()?.textContent).toBe("+7");
});
