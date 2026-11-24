import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { stubBrowser } from "../test-support.ts";
import { ReviewPage } from "./ReviewPage.tsx";

beforeEach(stubBrowser);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("every state drawn on the page has an ID that no other has, of its tile, its part and its place", () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => Promise.resolve({ json: () => Promise.resolve([]) })),
	);
	render(<ReviewPage />);

	const ids = screen
		.getAllByRole("figure")
		.map((f) => f.querySelector("figcaption .font-mono")?.textContent);

	expect(ids.length).toBeGreaterThan(0);
	expect(
		ids.every((id) => id !== undefined && /^[A-Z]{2} \d[A-Z]\d*$/.test(id)),
	).toBe(true);
	expect(new Set(ids).size).toBe(ids.length);
});
