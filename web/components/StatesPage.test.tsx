import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { stubBrowser } from "../test-support.ts";
import { StatesPage } from "./StatesPage.tsx";

beforeEach(stubBrowser);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("replaying the animations draws the states again, with the same states", () => {
	render(<StatesPage />);
	const before = screen.getAllByRole("figure").length;

	fireEvent.click(screen.getByRole("button", { name: "Replay animations" }));

	expect(screen.getAllByRole("figure")).toHaveLength(before);
});
