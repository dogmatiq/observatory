import { expect, test } from "vitest";
import { moonName, moonPhase } from "./moon.ts";

test("the new moon of 6 January 2000 and the full moon two weeks after it have those phases", () => {
	const newMoon = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)));
	expect(moonName(newMoon)).toBe("new moon");

	const full = moonPhase(new Date(Date.UTC(2000, 0, 21, 4, 40)));
	expect(moonName(full)).toBe("full moon");
});

test("the phase waxes and then wanes", () => {
	const names = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map(moonName);
	expect(names).toEqual([
		"waxing crescent",
		"first quarter",
		"waxing gibbous",
		"full moon",
		"waning gibbous",
		"last quarter",
		"waning crescent",
	]);
});

test("a time before the first new moon has a phase in range", () => {
	const phase = moonPhase(new Date(Date.UTC(1969, 6, 20, 20, 17)));
	expect(phase).toBeGreaterThanOrEqual(0);
	expect(phase).toBeLessThan(1);
});
