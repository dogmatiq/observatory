import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

beforeEach(() => {
	// React and the boundary both log a failure that a boundary catches.
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function Broken(): never {
	throw new Error("the nodes did not answer");
}

test("it shows its children while they work", () => {
	render(
		<ErrorBoundary>
			<p>fine</p>
		</ErrorBoundary>,
	);

	expect(screen.getByText("fine")).toBeDefined();
	expect(screen.queryByRole("alert")).toBeNull();
});

test("it shows what failed, in place of the part that failed", () => {
	render(
		<ErrorBoundary>
			<Broken />
		</ErrorBoundary>,
	);

	const alert = screen.getByRole("alert");
	expect(alert.textContent).toBe(
		"Unable to read this. the nodes did not answer",
	);
});

test("a part that fails does not take its siblings with it", () => {
	render(
		<>
			<ErrorBoundary>
				<p>before</p>
			</ErrorBoundary>
			<ErrorBoundary>
				<Broken />
			</ErrorBoundary>
			<ErrorBoundary>
				<p>after</p>
			</ErrorBoundary>
		</>,
	);

	expect(screen.getByText("before")).toBeDefined();
	expect(screen.getByRole("alert")).toBeDefined();
	expect(screen.getByText("after")).toBeDefined();
});

function ThrowsText(): never {
	throw "plain text";
}

test("a value that is not an error is shown as text", () => {
	render(
		<ErrorBoundary>
			<ThrowsText />
		</ErrorBoundary>,
	);

	expect(screen.getByRole("alert").textContent).toContain("plain text");
});
