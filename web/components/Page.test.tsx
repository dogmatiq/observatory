import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { stubBrowser, tipOf } from "../test-support.ts";
import { Page } from "./Page.tsx";

beforeEach(stubBrowser);
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const stopped =
	"Updates have stopped, because the Observatory can't be reached.";

test("a page that has stopped being updated has a red alert flag in its title bar, whose tooltip says why", async () => {
	render(<Page stopped={stopped}>content</Page>);

	const bar = screen.getByRole("banner");
	const flag = bar.querySelector(".text-bad") as HTMLElement;

	expect(flag).not.toBeNull();
	expect(await tipOf(flag)).toContain(stopped);
});

test("a screen reader is told when a page stops being updated", () => {
	render(<Page stopped={stopped}>content</Page>);

	expect(screen.getByRole("status").textContent).toBe(stopped);
});

test("a page that is being updated has no alert flag in its title bar", () => {
	render(<Page>content</Page>);

	expect(screen.getByRole("banner").querySelector(".text-bad")).toBeNull();
});
