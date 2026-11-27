import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { moonQuotes } from "../lib/moon-lore.ts";
import { stubBrowser } from "../test-support.ts";
import { Sky } from "./Sky.tsx";

beforeEach(stubBrowser);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** Some cards, each with a sky, named so that the ones that are drawn can change. */
function Cards({ names }: { names: string[] }) {
	return names.map((name) => (
		<div key={name} data-card={name}>
			<Sky />
		</div>
	));
}

/** The names of the cards whose skies have the moon, in each color mode. */
function withMoon(container: HTMLElement): string[] {
	return [...container.querySelectorAll("[data-card]")]
		.filter((card) => card.querySelector("[data-moon]") !== null)
		.map((card) => card.getAttribute("data-card") as string);
}

test("of the skies on a page only the one that has been drawn longest has the moon", () => {
	const { container } = render(<Cards names={["a", "b", "c"]} />);

	expect(withMoon(container)).toEqual(["a"]);
	// One for the night, and one for the day, of which only one shows.
	expect(container.querySelectorAll("[data-moon]")).toHaveLength(2);
});

test("the moon passes to the next sky when the one that has it goes", () => {
	const { container, rerender } = render(<Cards names={["a", "b", "c"]} />);

	rerender(<Cards names={["b", "c"]} />);
	expect(withMoon(container)).toEqual(["b"]);

	rerender(<Cards names={["c", "d"]} />);
	expect(withMoon(container)).toEqual(["c"]);
});

test("a sky that is drawn later doesn't take the moon from one that is there", () => {
	const { container, rerender } = render(<Cards names={["b", "c"]} />);

	rerender(<Cards names={["a", "b", "c"]} />);
	expect(withMoon(container)).toEqual(["b"]);
});

/** The quote that a card of the moon shows, found by its words. */
const quoteIn = (tip: string) => moonQuotes.find((q) => tip.includes(q.text));

/** What a card of the moon starts with, which depends on its quote. */
const heading = (q: (typeof moonQuotes)[number]) =>
	q.moon ? `${q.moon} the moon` : "Moon";

test("the popover of the moon is a card with the moon's name by its quote's author, the phase, the quote with a link to its text, and a status that says only that there is nothing to chart", async () => {
	const { container } = render(<Cards names={["a"]} />);

	const moon = container.querySelector("[data-moon]") as Element;
	fireEvent.pointerEnter(moon);
	const tooltip = await screen.findByRole("group");
	const tip = tooltip.textContent ?? "";

	const quote = quoteIn(tip);
	expect(quote).toBeDefined();
	expect(tip.startsWith(heading(quote as (typeof moonQuotes)[number]))).toBe(
		true,
	);
	expect(tip).toMatch(
		/(new moon|waxing crescent|first quarter|waxing gibbous|full moon|waning gibbous|last quarter|waning crescent)/i,
	);
	expect(
		tooltip.querySelector(`a[href="${quote?.url}"]`)?.getAttribute("target"),
	).toBe("_blank");
	expect(tip).toContain(
		"There's nothing to chart here, so here's a quote about the moon instead.",
	);
	expect(tip).not.toMatch(/node|sample/i);
});

test("a quote that is translated shows its translator, and one that is in English does not", async () => {
	const { container } = render(<Cards names={["a"]} />);
	const moon = container.querySelector("[data-moon]") as Element;

	let translated = false;
	let english = false;
	for (let i = 0; i < 40 && !(translated && english); i++) {
		fireEvent.pointerEnter(moon);
		const tip = (await screen.findByRole("group")).textContent ?? "";
		const quote = quoteIn(tip);

		if (quote?.translation) {
			translated = true;
			expect(tip).toContain(`Translated by ${quote.translation.by}`);
		} else {
			english = true;
			expect(tip).not.toContain("Translated by");
		}

		fireEvent.pointerLeave(moon);
		await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
	}

	expect(translated && english).toBe(true);
});

test("the quote in the popover is another each time that it opens", async () => {
	const { container } = render(<Cards names={["a"]} />);
	const moon = container.querySelector("[data-moon]") as Element;

	// The card is the same one while the pointer leaves and returns at once, so
	// each time waits for the popover to have gone.
	const seen: (string | undefined)[] = [];
	for (let i = 0; i < 4; i++) {
		fireEvent.pointerEnter(moon);
		seen.push(
			quoteIn((await screen.findByRole("group")).textContent ?? "")?.text,
		);

		fireEvent.pointerLeave(moon);
		await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
	}

	for (let i = 1; i < seen.length; i++) {
		expect(seen[i]).toBeDefined();
		expect(seen[i]).not.toBe(seen[i - 1]);
	}
});
