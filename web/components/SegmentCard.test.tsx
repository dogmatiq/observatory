import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SegmentCard } from "./SegmentCard.tsx";

afterEach(cleanup);

const id = "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93";

test("the card of an event stream says what it is, which one, and how much of the bar it is", () => {
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
});

test("the card of a queue says how much of the bar it is", () => {
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
});

test("a card has no paragraphs, because its card's explainer says what the bar shows", () => {
	for (const thing of ["event-stream", "queue", "node"] as const) {
		const { container } = render(
			<SegmentCard
				about={{
					thing,
					id,
					amount: 3,
					share: 0.6,
					total: { amount: 5, things: 3 },
				}}
			/>,
		);
		expect(container.querySelectorAll("p")).toHaveLength(0);
		cleanup();
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

test("the card of a node gives its workloads and its share", () => {
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
});

test("the card of a node that doesn't report its workloads, while others do, says so as a status", () => {
	const { container } = render(
		<SegmentCard about={{ thing: "node", id, unreported: true }} />,
	);

	expect(container.textContent).toContain(
		"This node's workloads are unknown, but other nodes in the cluster report their workloads.",
	);
	expect(container.textContent).not.toContain("%");
});
