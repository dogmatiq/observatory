import { cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, test } from "vitest";
import { countedWords, eventRateWords } from "./Overview.tsx";
import { RateCard } from "./RateCard.tsx";

afterEach(cleanup);

const card = (state: "known" | "lost" | "unavailable") => (
	<RateCard
		subsystem="streams"
		icon="event"
		kind="Event rate"
		description="The rate at which the application is recording new events"
		state={state}
	/>
);

test("a known rate says what it is of and what it is averaged over, and nothing else", () => {
	const { container } = render(card("known"));

	expect(container.textContent).toBe(
		"Event rateThe rate at which the application is recording new events, averaged over the last minute.",
	);
});

test("a rate that is lost says why, and that the figure is the last value, in a status", () => {
	const { container } = render(card("lost"));

	expect(container.textContent).toBe(
		"Event rateThe rate at which the application is recording new events, averaged over the last minute.No new samples are arriving, so this average is out of date.",
	);
});

test("a rate that isn't available says why, in a status", () => {
	const { container } = render(card("unavailable"));

	expect(container.textContent).toBe(
		"Event rateThe rate at which the application is recording new events, averaged over the last minute.There aren't enough samples yet, so the average can't be calculated.",
	);
});

test("the state of a rate adds a status to the sentences of its card, and never changes them", () => {
	const lost = "No new samples are arriving, so this average is out of date.";
	const unavailable =
		"There aren't enough samples yet, so the average can't be calculated.";

	const rates: Omit<ComponentProps<typeof RateCard>, "state">[] = [
		{ subsystem: "streams", icon: "event", ...eventRateWords },
		...Object.values(countedWords).map(
			(words) =>
				({
					subsystem: "queues",
					icon: "message",
					kind: words.kind,
					description: words.description,
					note: words.note,
				}) as const,
		),
	];

	for (const rate of rates) {
		const text = (state: "known" | "lost" | "unavailable") => {
			const { container, unmount } = render(
				<RateCard {...rate} state={state} />,
			);
			const t = container.textContent;
			unmount();
			return t;
		};

		const known = text("known");
		expect(text("lost"), rate.kind).toBe(known + lost);
		expect(text("unavailable"), rate.kind).toBe(known + unavailable);
	}
});
