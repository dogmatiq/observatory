import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Presence, presenceTime } from "./Presence.tsx";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const wrapper = () => screen.getByText("part").closest(".grid");

test("a part that is there when it first draws is open, with nothing to animate", () => {
	render(<Presence>part</Presence>);

	expect(wrapper()?.className).toContain("opacity-100");
});

test("nothing is drawn while there is nothing", () => {
	const { container } = render(<Presence>{undefined}</Presence>);

	expect(container.textContent).toBe("");
});

test("a part that goes is kept while it shrinks away, and then removed", () => {
	const { rerender } = render(<Presence>part</Presence>);

	rerender(<Presence>{undefined}</Presence>);
	expect(screen.getByText("part")).toBeDefined();
	expect(wrapper()?.className).toContain("opacity-0");

	act(() => {
		vi.advanceTimersByTime(presenceTime + 1);
	});
	expect(screen.queryByText("part")).toBeNull();
});

test("a part that begins is drawn closed and then opens, so that it grows in", () => {
	const { rerender } = render(<Presence>{undefined}</Presence>);

	rerender(<Presence>part</Presence>);

	// It is opened by an effect, which has run once the render has finished.
	expect(wrapper()?.className).toContain("opacity-100");
});

test("a part that comes back while it is shrinking away stays", () => {
	const { rerender } = render(<Presence>part</Presence>);

	rerender(<Presence>{undefined}</Presence>);
	act(() => {
		vi.advanceTimersByTime(presenceTime / 2);
	});
	rerender(<Presence>part</Presence>);
	act(() => {
		vi.advanceTimersByTime(presenceTime * 2);
	});

	expect(screen.getByText("part")).toBeDefined();
	expect(wrapper()?.className).toContain("opacity-100");
});
