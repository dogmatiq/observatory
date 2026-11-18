import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { HandlerData, HandlerSummary } from "../model.ts";
import { HandlerCard } from "./HandlerCard.tsx";

afterEach(cleanup);

const quiet: HandlerSummary = {
	failing: 0,
	queuedMessages: 0,
	unhandledEvents: 0,
	bindings: [],
};

function card(
	kind: HandlerData["kind"],
	summary: Partial<HandlerSummary> = {},
	rest: Partial<HandlerData> = {},
) {
	return render(
		<HandlerCard
			handler={{
				key: "k",
				name: "the-handler",
				kind,
				summary: { ...quiet, ...summary },
				...rest,
			}}
		/>,
	);
}

/** The numbers on the card, each as its label and its value. */
function stats(container: HTMLElement) {
	return Object.fromEntries(
		[...container.querySelectorAll("span.text-xs")].map((label) => [
			label.textContent,
			label.previousElementSibling?.textContent,
		]),
	);
}

test("an aggregate shows its instances and command backlog", () => {
	const { container } = card("aggregate", {
		instances: 1200,
		queuedMessages: 3,
		bindings: [{ id: "abcdefgh1", instances: 1200 }],
	});

	expect(stats(container)).toEqual({
		instances: "1.2K",
		"command backlog": "3",
	});
});

test("an aggregate with one instance says so in the singular", () => {
	const { container } = card("aggregate", { instances: 1 });

	expect(stats(container)).toHaveProperty("instance", "1");
});

test("an aggregate shows its active instances only when it is given them", () => {
	const { container } = card("aggregate", {
		instances: 5,
		activeInstances: { count: 2, title: "Recently active" },
	});

	expect(stats(container)).toHaveProperty("active", "2");
	expect(screen.getByTitle("Recently active")).toBeDefined();
});

test("a process shows the instances in progress, its event backlog and its deadlines", () => {
	const { container } = card("process", {
		schedulesDeadlines: true,
		unhandledEvents: 7,
		queuedMessages: 1,
		bindings: [
			{ id: "aaaaaaaa", instances: 4 },
			{ id: "bbbbbbbb", instances: 6 },
		],
	});

	expect(stats(container)).toEqual({
		"in progress": "10",
		"event backlog": "7",
		deadline: "1",
	});
});

test("a process that schedules no deadlines has no deadlines or bar", () => {
	const { container } = card("process", {
		bindings: [{ id: "aaaaaaaa", instances: 4 }],
	});

	expect(Object.keys(stats(container))).toEqual([
		"in progress",
		"event backlog",
	]);
	expect(container.querySelector("svg[role=img]")).toBeNull();
});

test("an integration shows its command backlog", () => {
	const { container } = card("integration", { queuedMessages: 12 });

	expect(stats(container)).toEqual({ "command backlog": "12" });
});

test("a projection shows its event backlog", () => {
	const { container } = card("projection", { unhandledEvents: 12_000 });

	expect(stats(container)).toEqual({ "event backlog": "12.0K" });
});

test("failing messages are counted, and the card is named by its handler", () => {
	card("integration", { failing: 1, queuedMessages: 1 });

	const article = screen.getByRole("article", { name: "the-handler" });
	expect(within(article).getByText("1 message failing")).toBeDefined();
});

test("a card with no failing messages does not say so", () => {
	card("integration");

	expect(screen.queryByText(/failing/)).toBeNull();
});

test("the handler's kind and whether it is disabled are shown", () => {
	card("projection", {}, { disabled: true });

	expect(screen.getByText("projection, disabled")).toBeDefined();
});

test("a handler that minimizes concurrency says so in a tooltip", () => {
	card("integration", {}, { minimizesConcurrency: true });

	expect(screen.getByTitle(/^Minimize concurrency:/)).toBeDefined();
});

test("a card is not a link unless it is given one", () => {
	card("projection");
	expect(screen.queryByRole("link")).toBeNull();

	cleanup();

	render(
		<HandlerCard
			handler={{
				key: "k",
				name: "the-handler",
				kind: "projection",
				summary: quiet,
			}}
			href="/handlers/k"
		/>,
	);
	expect(screen.getByRole("link").getAttribute("href")).toBe("/handlers/k");
});

test("the numbers that the engine doesn't report are left out", () => {
	const aggregate = card(
		"aggregate",
		{ queuedMessages: undefined },
		{ summary: { failing: 0, bindings: [] } },
	);
	expect(stats(aggregate.container)).toEqual({});

	cleanup();

	const process = card(
		"process",
		{},
		{ summary: { failing: 0, schedulesDeadlines: true, bindings: [] } },
	);
	expect(stats(process.container)).toEqual({ "in progress": "0" });

	cleanup();

	const projection = card(
		"projection",
		{},
		{ summary: { failing: 0, bindings: [] } },
	);
	expect(stats(projection.container)).toEqual({});
});
