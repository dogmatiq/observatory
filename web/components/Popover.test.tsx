import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Popover } from "./Popover.tsx";

beforeEach(() => {
	vi.useFakeTimers();

	// A popover appears at once soon after another has gone, so each test starts
	// long after the last one's.
	vi.advanceTimersByTime(10_000);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

/** Lets the given time pass. */
function wait(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

function target() {
	render(
		<Popover content="the words">
			<button type="button">the target</button>
		</Popover>,
	);
	return screen.getByRole("button");
}

test("a popover appears when the pointer has rested on its element for a moment", () => {
	const button = target();

	fireEvent.pointerEnter(button);
	wait(200);
	expect(screen.queryByRole("tooltip")).toBeNull();

	wait(200);
	expect(screen.getByRole("tooltip").textContent).toBe("the words");
	expect(button.getAttribute("aria-describedby")).toBe(
		screen.getByRole("tooltip").id,
	);
});

test("a popover goes when the pointer leaves, and doesn't appear if it left before", () => {
	const button = target();

	fireEvent.pointerEnter(button);
	wait(100);
	fireEvent.pointerLeave(button);
	wait(1000);
	expect(screen.queryByRole("tooltip")).toBeNull();

	fireEvent.pointerEnter(button);
	wait(400);
	fireEvent.pointerLeave(button);
	wait(300);
	expect(screen.queryByRole("tooltip")).toBeNull();
	expect(button.getAttribute("aria-describedby")).toBeNull();
});

test("a popover appears at once when another has just gone", () => {
	render(
		<>
			<Popover content="first">
				<span>one</span>
			</Popover>
			<Popover content="second">
				<span>two</span>
			</Popover>
		</>,
	);

	fireEvent.pointerEnter(screen.getByText("one"));
	wait(400);
	fireEvent.pointerLeave(screen.getByText("one"));

	fireEvent.pointerEnter(screen.getByText("two"));
	expect(screen.getByRole("tooltip").textContent).toBe("second");
});

test("a popover goes when Escape is pressed, when the element is pressed and when the page scrolls", () => {
	const button = target();

	fireEvent.pointerEnter(button);
	wait(400);
	fireEvent.keyDown(document, { key: "Escape" });
	expect(screen.queryByRole("tooltip")).toBeNull();

	fireEvent.pointerEnter(button);
	wait(400);
	fireEvent.pointerDown(button);
	expect(screen.queryByRole("tooltip")).toBeNull();

	fireEvent.pointerEnter(button);
	wait(400);
	fireEvent.scroll(document.body);
	expect(screen.queryByRole("tooltip")).toBeNull();
});

test("a popover appears when its element has the keyboard's focus, and goes when it loses it", () => {
	const button = target();

	act(() => button.focus());
	expect(screen.getByRole("tooltip").textContent).toBe("the words");

	act(() => button.blur());
	expect(screen.queryByRole("tooltip")).toBeNull();
});

test("a finger doesn't show a popover", () => {
	const button = target();

	fireEvent.pointerEnter(button, { pointerType: "touch" });
	wait(1000);
	expect(screen.queryByRole("tooltip")).toBeNull();
});

test("an element with no content for its popover is left as it is", () => {
	render(
		<Popover>
			<button type="button">alone</button>
		</Popover>,
	);

	const button = screen.getByRole("button");
	fireEvent.pointerEnter(button);
	wait(1000);

	expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the child's own handlers still run", () => {
	const entered = vi.fn();
	render(
		<Popover content="the words">
			<button type="button" onPointerEnter={entered}>
				the target
			</button>
		</Popover>,
	);

	fireEvent.pointerEnter(screen.getByRole("button"));
	expect(entered).toHaveBeenCalledOnce();
});

/**
 * Gives an element a place on the window, as jsdom, which lays nothing out,
 * doesn't.
 */
function placeAt(
	element: Element,
	rect: { left: number; top: number; width: number; height: number },
) {
	element.getBoundingClientRect = () =>
		({
			...rect,
			right: rect.left + rect.width,
			bottom: rect.top + rect.height,
			x: rect.left,
			y: rect.top,
		}) as DOMRect;
}

test("a popover is above its element, centered on the pointer, and inside the window", () => {
	const button = target();
	vi.stubGlobal("innerWidth", 1000);

	// The panel is 100 wide and 30 high, wherever it is.
	vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue({
		width: 100,
		height: 30,
	} as DOMRect);

	placeAt(button, { left: 400, top: 200, width: 200, height: 20 });
	fireEvent.pointerEnter(button, { clientX: 450 });
	wait(400);
	let panel = screen.getByRole("tooltip");
	expect([panel.style.left, panel.style.top]).toEqual(["400px", "162px"]);

	fireEvent.pointerLeave(button);
	wait(300);
	placeAt(button, { left: 0, top: 200, width: 200, height: 20 });
	fireEvent.pointerEnter(button, { clientX: 10 });
	panel = screen.getByRole("tooltip");
	expect(panel.style.left).toBe("8px");

	fireEvent.pointerLeave(button);
	wait(300);
	placeAt(button, { left: 950, top: 200, width: 50, height: 20 });
	fireEvent.pointerEnter(button, { clientX: 990 });
	panel = screen.getByRole("tooltip");
	expect(panel.style.left).toBe("892px");

	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("a popover is below its element when there is no room above", () => {
	const button = target();

	vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue({
		width: 100,
		height: 30,
	} as DOMRect);

	placeAt(button, { left: 400, top: 10, width: 200, height: 20 });
	fireEvent.pointerEnter(button, { clientX: 500 });
	wait(400);

	expect(screen.getByRole("tooltip").style.top).toBe("38px");

	vi.restoreAllMocks();
});

test("the pointer can cross to a popover that is interactive, which stays while it is on it", () => {
	render(
		<Popover content={<button type="button">copy</button>} interactive>
			<span>the target</span>
		</Popover>,
	);

	const target = screen.getByText("the target");
	fireEvent.pointerEnter(target);
	wait(400);

	fireEvent.pointerLeave(target);
	wait(100);
	fireEvent.pointerEnter(screen.getByRole("group"));
	wait(1000);
	expect(screen.getByRole("group")).toBeDefined();

	fireEvent.pointerLeave(screen.getByRole("group"));
	wait(300);
	expect(screen.queryByRole("group")).toBeNull();
});

test("a popover goes a moment after the pointer leaves its element, and not before", () => {
	render(
		<Popover content="words">
			<span>the target</span>
		</Popover>,
	);

	const target = screen.getByText("the target");
	fireEvent.pointerEnter(target);
	wait(400);
	fireEvent.pointerLeave(target);

	wait(100);
	expect(screen.queryByRole("tooltip")).not.toBeNull();
	wait(200);
	expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the pointer can cross to a popover of text, which stays while it is on it", () => {
	const button = target();
	fireEvent.pointerEnter(button);
	wait(400);

	fireEvent.pointerLeave(button);
	wait(100);
	fireEvent.pointerEnter(screen.getByRole("tooltip"));
	wait(1000);
	expect(screen.getByRole("tooltip")).toBeDefined();

	fireEvent.pointerLeave(screen.getByRole("tooltip"));
	wait(300);
	expect(screen.queryByRole("tooltip")).toBeNull();
});

test("only one popover is open at a time", () => {
	render(
		<>
			<Popover content="first" interactive>
				<span>one</span>
			</Popover>
			<Popover content="second">
				<span>two</span>
			</Popover>
		</>,
	);

	fireEvent.pointerEnter(screen.getByText("one"));
	wait(400);
	fireEvent.pointerLeave(screen.getByText("one"));
	fireEvent.pointerEnter(screen.getByText("two"));

	expect(screen.queryByRole("group")).toBeNull();
	expect(screen.getByRole("tooltip").textContent).toBe("second");
});
