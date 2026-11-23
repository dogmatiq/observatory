import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { SegmentAbout } from "../lib/segments.ts";
import { SegmentCard } from "./SegmentCard.tsx";

afterEach(cleanup);

const id = "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93";

/** The paragraphs of a card, which are its words, as opposed to its figures. */
function paragraphs(about: SegmentAbout): (string | null)[] {
	const { container } = render(<SegmentCard about={about} />);
	const words = [...container.querySelectorAll("p")].map((p) => p.textContent);
	cleanup();
	return words;
}

test("the card of an event stream says what it is, which one, how much of the bar it is, what the bar shows, and that an even spread is better", () => {
	const { container } = render(
		<SegmentCard
			about={{
				thing: "event-stream",
				id,
				amount: 7612,
				share: 0.6234,
				total: { amount: 12_210, things: 2 },
			}}
		/>,
	);
	const text = container.textContent;

	expect(text).toContain("Event stream");
	expect(text).toContain("113cbdc3");
	expect(text).toContain("7.6K events");
	expect(text).toContain("62%");
	expect(text).toContain(
		"This bar shows how the application's events are spread across its streams.",
	);
	expect(text).toContain("An even distribution is better.");
});

test("the card of a queue says what the bar shows, and that an even spread is better", () => {
	const { container } = render(
		<SegmentCard
			about={{
				thing: "queue",
				id,
				amount: 12,
				share: 0.6,
				total: { amount: 20, things: 3 },
			}}
		/>,
	);
	const text = container.textContent;

	expect(text).toContain("12 messages");
	expect(text).toContain("60%");
	expect(text).toContain(
		"This bar shows how the application's messages are spread across its queues.",
	);
	expect(text).toContain("An even distribution is better");
});

test("a card's words have no figures in them, and are the same whatever its figures, but for the advice, which is only there when the bar can be spread unevenly", () => {
	for (const thing of ["event-stream", "queue", "node"] as const) {
		const spread = paragraphs({
			thing,
			id,
			amount: 3,
			share: 0.6,
			total: { amount: 5, things: 3 },
		});
		expect(spread.join(" ")).not.toMatch(/\d/);

		// The same words, with other figures.
		expect(
			paragraphs({
				thing,
				id,
				amount: 0,
				share: 0,
				total: { amount: 7, things: 4 },
			}),
		).toEqual(spread);

		// One thing, or one of what is spread, can't be spread unevenly, so there is
		// no advice, which is the last paragraph of a card that has it, and the
		// other words are the same. A node's card has no advice.
		const unadvised = thing === "node" ? spread : spread.slice(0, -1);
		for (const total of [
			{ amount: 5, things: 1 },
			{ amount: 1, things: 3 },
		]) {
			expect(paragraphs({ thing, id, amount: 1, share: 1, total })).toEqual(
				unadvised,
			);
		}
	}
});

test("a thing that has one is singular, and one that has none has no share", () => {
	const one = render(
		<SegmentCard
			about={{
				thing: "event-stream",
				id,
				amount: 1,
				share: 1,
				total: { amount: 1, things: 1 },
			}}
		/>,
	);
	expect(one.container.textContent).toContain("1 event");
	expect(one.container.textContent).not.toContain("1 events");
	one.unmount();

	const none = render(
		<SegmentCard
			about={{
				thing: "node",
				id,
				amount: 0,
				share: 0,
				total: { amount: 5, things: 3 },
			}}
		/>,
	);
	expect(none.container.textContent).toContain("0 workloads");
	expect(none.container.textContent).not.toContain("%");
});

test("the card of a node says what the bar shows, gives its share, and has no advice about the spread", () => {
	const { container } = render(
		<SegmentCard
			about={{
				thing: "node",
				id,
				amount: 3,
				share: 0.6,
				total: { amount: 5, things: 3 },
			}}
		/>,
	);
	const text = container.textContent;

	expect(text).toContain("Node");
	expect(text).toContain("3 workloads");
	expect(text).toContain("60%");
	expect(text).toContain(
		"This bar shows how the cluster's workloads are spread across its nodes.",
	);
	expect(text).toContain(
		"Workloads vary in size, so two nodes with the same number of workloads can have very different amounts of work to do.",
	);
	expect(text).not.toContain("even distribution");
});

test("the card of a node that doesn't report its workloads, while others do, says so as a status", () => {
	const { container } = render(
		<SegmentCard about={{ thing: "node", id, unreported: true }} />,
	);

	expect(container.textContent).toContain(
		"This node's workloads are unknown, but other nodes in the cluster report their workloads. This node may be running a different version of the engine.",
	);
	expect(container.textContent).not.toContain("%");
});
