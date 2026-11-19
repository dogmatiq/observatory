import { afterEach, expect, test, vi } from "vitest";
import { moonQuotes, pickOther } from "./moon-lore.ts";

afterEach(() => {
	vi.restoreAllMocks();
});

const bundledLetters =
	/^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]$/u;

/** The letters in some text that the bundled typefaces have no letters for. */
function unbundled(text: string): string[] {
	return [...text].filter((c) => /\p{L}/u.test(c) && !bundledLetters.test(c));
}

test("every quote and every author's word for the moon is in a script that the bundled typefaces have letters for", () => {
	for (const q of moonQuotes) {
		expect(unbundled(q.text), q.text).toEqual([]);
		expect(unbundled(q.moon ?? ""), q.text).toEqual([]);
	}
});

test("a quote that is not in English gives the word that its author used for the moon, which is in it, and an English quote gives none", () => {
	for (const q of moonQuotes) {
		if (q.language === "English") {
			expect(q.moon, q.text).toBeUndefined();
		} else {
			expect(q.moon, q.text).toBeTruthy();
			expect(q.text.toLowerCase(), q.text).toContain(
				(q.moon ?? "").toLowerCase(),
			);
		}
	}
});

test("every quote says who said it, and where, with a link to the text, and has a translation if it is not in English", () => {
	const seen = new Set<string>();

	for (const q of moonQuotes) {
		expect(q.text).not.toBe("");
		expect(q.by).not.toBe("");
		expect(q.work).not.toBe("");
		expect(q.url).toMatch(/^https:\/\//);
		expect(seen.has(q.text), q.text).toBe(false);
		seen.add(q.text);

		if (q.language === "English") {
			expect(q.translation).toBeUndefined();
		} else {
			expect(q.translation?.text, q.text).toBeTruthy();
			expect(q.translation?.by, q.text).toBeTruthy();
			// A translation is a published one, with its translator named.
			expect(q.translation?.by, q.text).not.toMatch(/claude|literal/i);
		}
	}
});

/** Something that can be picked, with the weight that it may have. */
type Item = { name: string; weight?: number };

test("picking again never gives the one that was given, unless there is only one", () => {
	const items: Item[] = [{ name: "a" }, { name: "b" }, { name: "c" }];

	for (const random of [0, 0.5, 0.999999]) {
		vi.spyOn(Math, "random").mockReturnValue(random);
		for (const item of items) {
			expect(pickOther(items, item)).not.toBe(item);
		}

		const [only] = items as [Item];
		expect(pickOther([only], only)).toBe(only);
	}
});

test("an item is picked in proportion to its weight", () => {
	const heavy: Item = { name: "heavy" };
	const light: Item = { name: "light", weight: 0.25 };
	const items = [heavy, light];

	let lights = 0;
	const steps = 1000;
	for (let i = 0; i < steps; i++) {
		vi.spyOn(Math, "random").mockReturnValue(i / steps);
		if (pickOther(items, undefined) === light) {
			lights++;
		}
	}

	// A quarter against one is a fifth of the picks.
	expect(lights / steps).toBeCloseTo(0.2, 2);
});

test("the quotes of one speaker that have a share of one quote between them add up to one", () => {
	const shares = new Map<string, number>();
	for (const q of moonQuotes) {
		if (q.weight !== undefined) {
			shares.set(q.by, (shares.get(q.by) ?? 0) + q.weight);
		}
	}

	expect(shares.size).toBeGreaterThan(0);
	for (const [by, share] of shares) {
		expect(share, by).toBeCloseTo(1, 10);
	}
});
