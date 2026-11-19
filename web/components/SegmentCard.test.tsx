import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { SegmentAbout } from "../lib/segments.ts";
import { SegmentCard } from "./SegmentCard.tsx";

afterEach(cleanup);

const about: SegmentAbout = {
	thing: "event-stream",
	id: "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10",
	events: 7612,
	share: 0.6234,
	total: { events: 12_210, streams: 2 },
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
				events: 1,
				share: 1,
				total: { events: 1, streams: 1 },
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
				events: 1,
				share: 1,
				total: { events: 1, streams: 2 },
			}}
		/>,
	);

	expect(container.textContent).toContain(
		"The bar shows the distribution of the application's events across its streams, but there is only 1 event so this segment is the whole bar.",
	);
	expect(container.textContent).not.toContain("even distribution");
});
