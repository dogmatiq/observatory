import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { stubBrowser } from "../test-support.ts";
import { Covered, Distrusted, dropTime, Trusted } from "./distrust.tsx";

beforeEach(() => {
	stubBrowser();
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

// shown renders a number with the coverage and the currency given, and returns a
// way to change them.
function shown(coverage: number, down = false) {
	const at = (c: number, d: boolean) => (
		<Distrusted value={d}>
			<Covered coverage={c}>
				<Trusted text="42" />
			</Covered>
		</Distrusted>
	);
	const r = render(at(coverage, down));
	return {
		container: r.container,
		to: (c: number, d = false) => r.rerender(at(c, d)),
	};
}

const glitching = (e: Element) => e.querySelector(".glitch") !== null;

test("a number that covers every node is sharp", () => {
	const { container } = shown(1);

	expect(container.innerHTML).toBe("42");
});

test("a number that covers only some nodes is blurred by the share that it leaves out", () => {
	const { container } = shown(0.75);
	const n = container.querySelector<HTMLElement>(".distrust-blur");

	expect(n?.style.getPropertyValue("--distrust")).toBe("0.25");
	expect(n?.textContent).toBe("42");
});

test("a number glitches for a moment each time its trust falls in a step, and not when it rises", () => {
	const { container, to } = shown(1);

	to(0.75);
	expect(glitching(container)).toBe(true);
	act(() => vi.advanceTimersByTime(dropTime));
	expect(glitching(container)).toBe(false);

	to(0.5);
	expect(glitching(container)).toBe(true);
	act(() => vi.advanceTimersByTime(dropTime));

	to(1);
	expect(glitching(container)).toBe(false);
});

test("a number glitches as the cluster goes out of contact, and is then the zero that is not available", () => {
	const { container, to } = shown(1);

	to(1, true);
	expect(glitching(container)).toBe(true);
	act(() => vi.advanceTimersByTime(dropTime));
	expect(glitching(container)).toBe(false);
	expect(
		container.querySelector('[aria-label="not available"]'),
	).not.toBeNull();
});
