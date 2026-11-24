import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { stubBrowser } from "../test-support.ts";
import { Choices, Part, Review, State, Tile } from "./review.tsx";

beforeEach(stubBrowser);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/**
 * stubDecisions makes the dev server's decisions start as `initial`, and keep
 * each decision that the page sends, and returns them as they are.
 */
function stubDecisions(initial: unknown[] = []) {
	const decisions = [...initial];
	const fetch = vi.fn((_url: string, init?: RequestInit) => {
		if (init?.method === "POST") {
			decisions.push({ ...JSON.parse(String(init.body)), at: "now" });
		}
		return Promise.resolve({ json: () => Promise.resolve([...decisions]) });
	});
	vi.stubGlobal("fetch", fetch);
	return decisions;
}

/**
 * A page of two tiles: the first, AA, with a part to decide, a part that is
 * decided, and a part with alternatives; the second, BB, with one part.
 */
function Page() {
	return (
		<Review>
			<Tile code="AA" title="First" note="The first tile.">
				<Part
					step={0}
					title="The whole"
					recommendation="Approve the whole."
					notDeciding="The words."
				>
					<State label="As it is">whole</State>
				</Part>
				<Part step={1} title="Settled" decided>
					<State label="As it is">settled</State>
				</Part>
				<Part step={2} title="The words" notDeciding="The whole.">
					<State label="One wording" recommendation="Approve.">
						one
					</State>
					<Choices
						of="A"
						title="the wording"
						choices={[
							["Another", "another"],
							["A third", "third"],
						]}
					/>
				</Part>
			</Tile>
			<Tile code="BB" title="Second" note="The second tile.">
				<Part
					step={0}
					title="Only part"
					recommendation="Approve."
					notDeciding="Nothing else."
				>
					<State label="As it is">second</State>
				</Part>
			</Tile>
		</Review>
	);
}

test("only the first part that isn't settled is open, and the rest are named as still to come", async () => {
	stubDecisions();
	render(<Page />);

	expect(screen.getByRole("button", { name: "Copy AA 0" })).toBeDefined();
	expect(screen.queryByRole("button", { name: "Copy AA 2" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Copy BB" })).toBeNull();
	expect(screen.getByText(/^Still to come in this tile/).textContent).toContain(
		"AA 2, The words",
	);
	expect(screen.getByText(/^Still to come, each/).textContent).toContain(
		"BB, Second",
	);
});

test("a tile's next part is shown once the one before it is decided, and the next tile once the tile is", async () => {
	stubDecisions([
		{ id: "AA 0", decision: "accepted" },
		{ id: "AA 2A", decision: "accepted" },
	]);
	render(<Page />);

	expect(await screen.findByRole("button", { name: "Copy BB" })).toBeDefined();
	expect(screen.getByRole("button", { name: "Copy AA 2" })).toBeDefined();
	expect(screen.queryByText(/^Still to come/)).toBeNull();
});

test("an open part says what it isn't deciding", () => {
	stubDecisions();
	render(<Page />);

	expect(screen.getByText("Not decided here:").parentElement?.textContent).toBe(
		"Not decided here: The words.",
	);
});

test("accepting a recommendation sends it to the dev server, and says that it is accepted", async () => {
	const decisions = stubDecisions();
	render(<Page />);

	fireEvent.click(
		screen.getByRole("button", { name: "Accept the recommendation for AA 0" }),
	);

	expect(decisions).toMatchObject([{ id: "AA 0", decision: "accepted" }]);
	expect(
		screen.queryByRole("button", {
			name: "Accept the recommendation for AA 0",
		}),
	).toBeNull();
	expect(await screen.findAllByText("Accepted")).not.toHaveLength(0);
});

test("an acceptance can be undone, which puts the thing under review again", async () => {
	const decisions = stubDecisions();
	render(<Page />);

	fireEvent.click(
		screen.getByRole("button", { name: "Accept the recommendation for AA 0" }),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "Undo the acceptance of AA 0" }),
	);

	expect(decisions).toMatchObject([
		{ id: "AA 0", decision: "accepted" },
		{ id: "AA 0", decision: "withdrawn" },
	]);
	expect(
		await screen.findByRole("button", {
			name: "Accept the recommendation for AA 0",
		}),
	).toBeDefined();
});

test("using an alternative in place of a state makes the one decision, so the other alternatives can no longer be used", async () => {
	const decisions = stubDecisions([{ id: "AA 0", decision: "accepted" }]);
	render(<Page />);

	const alternative = (
		await screen.findByRole("button", { name: "Copy AA 2A1" })
	).closest("figure") as HTMLElement;
	fireEvent.click(
		within(alternative).getByRole("button", { name: "Use this instead" }),
	);

	expect(decisions.at(-1)).toMatchObject({
		id: "AA 2A1",
		decision: "accepted",
	});
	expect(screen.getByText("Used in place of AA 2A")).toBeDefined();
	expect(
		screen.queryAllByRole("button", { name: "Use this instead" }),
	).toHaveLength(0);
});

test("a part that is fully decided is collapsed once the decisions are read, and can be opened again", async () => {
	stubDecisions();
	render(<Page />);

	const decided = screen
		.getByRole("button", { name: "Copy AA 1" })
		.closest("details") as HTMLDetailsElement;
	const open = screen
		.getByRole("button", { name: "Copy AA 0" })
		.closest("details") as HTMLDetailsElement;

	await vi.waitFor(() => expect(decided.open).toBe(false));
	expect(open.open).toBe(true);

	fireEvent.click(decided.querySelector("summary") as HTMLElement);
	expect(decided.open).toBe(true);
});

test("clicking the ID of a state copies it", async () => {
	stubDecisions();
	const writeText = vi.fn(() => Promise.resolve());
	vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
	render(<Page />);

	fireEvent.click(screen.getByRole("button", { name: "Copy AA 0A" }));

	expect(writeText).toHaveBeenCalledWith("AA 0A");
	expect(
		await screen.findByRole("button", { name: "Copied AA 0A" }),
	).toBeDefined();
});

test("replaying the animations draws the states again, with the same states", () => {
	stubDecisions();
	render(<Page />);
	const before = screen.getAllByRole("figure").length;

	fireEvent.click(screen.getByRole("button", { name: "Replay animations" }));

	expect(screen.getAllByRole("figure")).toHaveLength(before);
});
