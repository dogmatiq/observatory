import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { SegmentAbout } from "../lib/segments.ts";
import { SegmentCard } from "./SegmentCard.tsx";

afterEach(cleanup);

const about: SegmentAbout = {
	thing: "event-stream",
	id: "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10",
	amount: 7612,
	share: 0.6234,
	total: { amount: 12_210, things: 2 },
};

test("the card says what the thing is, which one it is, how much of the bar it is, and what the bar shows", () => {
	const { container } = render(<SegmentCard about={about} />);
	const text = container.textContent;

	expect(text).toContain("Event stream");
	expect(text).toContain("8b0081fd");
	expect(text).toContain("7.6K events");
	expect(text).toContain("62%");
	expect(text).toContain(
		"The bar shows the distribution of the application's 12.2K events across its 2 streams.",
	);
	expect(text).toContain("An even distribution is better.");
	expect(text).not.toContain("A log of events");
});

test("the card counts one event in the singular, and says that its lone stream is the whole bar", () => {
	const { container } = render(
		<SegmentCard
			about={{
				...about,
				amount: 1,
				share: 1,
				total: { amount: 1, things: 1 },
			}}
		/>,
	);
	const text = container.textContent;

	expect(text).toContain("1 event");
	expect(text).not.toContain("1 events");
	expect(text).toContain(
		"The bar shows the distribution of the application's events across its streams, but there is only 1 event so this segment is the whole bar.",
	);
	expect(text).not.toContain("even distribution");
});

test("the card says that one event on several streams is the whole bar, and doesn't say that an even distribution is better", () => {
	const { container } = render(
		<SegmentCard
			about={{
				...about,
				amount: 1,
				share: 1,
				total: { amount: 1, things: 2 },
			}}
		/>,
	);

	expect(container.textContent).toContain(
		"The bar shows the distribution of the application's events across its streams, but there is only 1 event so this segment is the whole bar.",
	);
	expect(container.textContent).not.toContain("even distribution");
});

test("the card of a queue counts messages, and says that a backlog spread over queues is better", () => {
	const { container } = render(
		<SegmentCard
			about={{
				thing: "queue",
				id: "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93",
				amount: 12,
				share: 0.6,
				total: { amount: 20, things: 3 },
			}}
		/>,
	);
	const text = container.textContent;

	expect(text).toContain("Queue");
	expect(text).toContain("113cbdc3");
	expect(text).toContain("12 messages");
	expect(text).toContain(
		"The bar shows the distribution of the application's 20 messages across its 3 queues.",
	);
	expect(text).toContain("An even distribution is better");
});

test("the card of a queue with one message, or one queue, says that it is the whole bar", () => {
	const about = {
		thing: "queue",
		id: "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93",
		amount: 1,
		share: 1,
	} as const;

	const one = render(
		<SegmentCard about={{ ...about, total: { amount: 1, things: 3 } }} />,
	);
	expect(one.container.textContent).toContain(
		"but there is only 1 message so this segment is the whole bar.",
	);
	one.unmount();

	const lone = render(
		<SegmentCard
			about={{ ...about, amount: 5, total: { amount: 5, things: 1 } }}
		/>,
	);
	expect(lone.container.textContent).toContain(
		"The application only has one queue, so this segment is the whole bar.",
	);
});
