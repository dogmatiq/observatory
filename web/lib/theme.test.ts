import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	applyThemeMode,
	nextThemeMode,
	storedThemeMode,
	type ThemeMode,
} from "./theme.ts";

beforeEach(() => {
	window.localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
	vi.restoreAllMocks();
});

test("the modes cycle through automatic, light and dark", () => {
	const modes: ThemeMode[] = ["auto"];
	for (let i = 0; i < 3; i++) {
		modes.push(nextThemeMode(modes.at(-1) as ThemeMode));
	}
	expect(modes).toEqual(["auto", "light", "dark", "auto"]);
});

test("a viewer who has not chosen gets automatic", () => {
	expect(storedThemeMode()).toBe("auto");
});

test.each(["light", "dark"] as const)(
	"%s is applied and remembered",
	(mode) => {
		applyThemeMode(mode);

		expect(document.documentElement.getAttribute("data-theme")).toBe(mode);
		expect(storedThemeMode()).toBe(mode);
	},
);

test("automatic removes the choice", () => {
	applyThemeMode("dark");
	applyThemeMode("auto");

	expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
	expect(storedThemeMode()).toBe("auto");
});

test("a stored value that is not a mode is ignored", () => {
	window.localStorage.setItem("observatory-theme", "sepia");
	expect(storedThemeMode()).toBe("auto");
});

test("the page still follows the choice when storage is unavailable", () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("blocked");
	});
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("blocked");
	});

	expect(storedThemeMode()).toBe("auto");

	applyThemeMode("dark");
	expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
});
