import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { stubBrowser } from "../test-support.ts";
import { ReviewPage } from "./ReviewPage.tsx";

beforeEach(stubBrowser);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("replaying the animations draws the states again, with the same states", () => {
	render(<ReviewPage />);
	const before = screen.getAllByRole("figure").length;

	fireEvent.click(screen.getByRole("button", { name: "Replay animations" }));

	expect(screen.getAllByRole("figure")).toHaveLength(before);
});

test("every state drawn on the page has an ID that no other has, of its tile, its part and its place", () => {
	render(<ReviewPage />);

	const ids = screen
		.getAllByRole("figure")
		.map((f) => f.querySelector("figcaption .font-mono")?.textContent);

	// The tiles and their parts have IDs too, which are as full as those of the
	// states, so that each can be named in a review on its own.
	for (const id of ["EV", "EV 4", "CL 0", "CL 4", "EN 2"]) {
		expect(screen.getByRole("button", { name: `Copy ${id}` })).toBeDefined();
	}

	expect(
		ids.every((id) => id !== undefined && /^[A-Z]{2} \d[A-Z]\d*$/.test(id)),
	).toBe(true);
	expect(new Set(ids).size).toBe(ids.length);
	expect(ids).toContain("CL 4A");
	expect(ids).toContain("CL 4C1");
});

test("clicking the ID of a state copies it", async () => {
	const writeText = vi.fn(() => Promise.resolve());
	vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
	render(<ReviewPage />);

	fireEvent.click(screen.getByRole("button", { name: "Copy CL 4A" }));

	expect(writeText).toHaveBeenCalledWith("CL 4A");
	expect(
		await screen.findByRole("button", { name: "Copied CL 4A" }),
	).toBeDefined();
});

test("accepting a recommendation sends it to the dev server, and says that it is accepted", async () => {
	const fetch = vi.fn((_url: string, init?: RequestInit) =>
		Promise.resolve({
			json: () =>
				Promise.resolve(
					init?.method === "POST"
						? [{ ...JSON.parse(String(init.body)), at: "now" }]
						: [],
				),
		}),
	);
	vi.stubGlobal("fetch", fetch);
	render(<ReviewPage />);

	fireEvent.click(
		screen.getByRole("button", { name: "Accept the recommendation for EV 4" }),
	);

	const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
	expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
		id: "EV 4",
		decision: "accepted",
	});
	expect(
		screen.queryByRole("button", {
			name: "Accept the recommendation for EV 4",
		}),
	).toBeNull();
	expect(await screen.findAllByText("Accepted")).not.toHaveLength(0);
});

test("using an alternative in place of a state makes the one decision, so the other alternatives can no longer be used", () => {
	const fetch = vi.fn((_url: string, init?: RequestInit) =>
		Promise.resolve({
			json: () =>
				Promise.resolve(
					init?.method === "POST"
						? [{ ...JSON.parse(String(init.body)), at: "now" }]
						: [],
				),
		}),
	);
	vi.stubGlobal("fetch", fetch);
	render(<ReviewPage />);

	const before = screen.getAllByRole("button", { name: "Use this instead" });
	const alternative = screen
		.getByRole("button", { name: "Copy CL 4C1" })
		.closest("figure");
	fireEvent.click(
		within(alternative as HTMLElement).getByRole("button", {
			name: "Use this instead",
		}),
	);

	const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
	expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
		id: "CL 4C1",
		decision: "accepted",
	});
	expect(screen.getByText("Used in place of CL 4C")).toBeDefined();
	expect(
		screen.getAllByRole("button", { name: "Use this instead" }),
	).toHaveLength(before.length - 2);
});

test("an acceptance can be undone, which puts the thing under review again", async () => {
	let decisions: unknown[] = [];
	const fetch = vi.fn((_url: string, init?: RequestInit) => {
		if (init?.method === "POST") {
			decisions = [...decisions, JSON.parse(String(init.body))];
		}
		return Promise.resolve({ json: () => Promise.resolve(decisions) });
	});
	vi.stubGlobal("fetch", fetch);
	render(<ReviewPage />);

	fireEvent.click(
		screen.getByRole("button", { name: "Accept the recommendation for EV 4" }),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "Undo the acceptance of EV 4" }),
	);

	expect(decisions).toMatchObject([
		{ id: "EV 4", decision: "accepted" },
		{ id: "EV 4", decision: "withdrawn" },
	]);
	expect(
		await screen.findByRole("button", {
			name: "Accept the recommendation for EV 4",
		}),
	).toBeDefined();
});

test("a part that is fully decided is collapsed once the decisions are read, and can be opened again", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => Promise.resolve({ json: () => Promise.resolve([]) })),
	);
	render(<ReviewPage />);

	const decided = screen
		.getByRole("button", { name: "Copy CL 1" })
		.closest("details") as HTMLDetailsElement;
	const open = screen
		.getByRole("button", { name: "Copy CL 2" })
		.closest("details") as HTMLDetailsElement;

	await vi.waitFor(() => expect(decided.open).toBe(false));
	expect(open.open).toBe(true);

	fireEvent.click(decided.querySelector("summary") as HTMLElement);
	expect(decided.open).toBe(true);
});
