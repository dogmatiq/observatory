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

/** The segments of the bar of nodes on the card, by their titles. */
function nodeBar(container: HTMLElement) {
	return [...container.querySelectorAll("div[role=img]")].map((e) =>
		e.getAttribute("aria-label"),
	);
}

const nodes = [
	{ id: "aaaaaaaa-1", rate: 3 },
	{ id: "bbbbbbbb-2", rate: 1 },
];

test("an integration shows a bar of the nodes that handled its commands", () => {
	const { container } = card("integration", {}, { nodes });

	expect(nodeBar(container)).toEqual([
		"180 commands/min on node aaaaaaaa",
		"60 commands/min on node bbbbbbbb",
	]);
});

test("a projection shows a bar of the nodes that handled its events", () => {
	const { container } = card("projection", {}, { nodes });

	expect(nodeBar(container)).toEqual([
		"180 events/min on node aaaaaaaa",
		"60 events/min on node bbbbbbbb",
	]);
});

test("the bar of nodes is with the failing line, at the bottom of the card", () => {
	const { container } = card("integration", { failing: 2 }, { nodes });

	const bottom = container.querySelector(".mt-auto");
	expect(bottom?.textContent).toContain("2 messages failing");
	expect(nodeBar(bottom as HTMLElement)).toHaveLength(2);
});

test("an integration or a projection whose nodes say nothing has no bar", () => {
	expect(nodeBar(card("integration").container)).toEqual([]);
	expect(card("integration").container.querySelector(".bg-sunk")).toBeNull();
});

test("nodes that all handled nothing give an empty track, that keeps the card's place", () => {
	const { container } = card(
		"projection",
		{},
		{ nodes: [{ id: "aaaaaaaa", rate: 0 }] },
	);

	expect(nodeBar(container)).toEqual([]);
	expect(container.querySelector(".bg-sunk")).not.toBeNull();
});

test("a handler with an empty list of nodes has an empty track too", () => {
	const { container } = card("integration", {}, { nodes: [] });

	expect(nodeBar(container)).toEqual([]);
	expect(container.querySelector(".bg-sunk")).not.toBeNull();
});

test("an aggregate and a process don't draw a bar of nodes", () => {
	for (const kind of ["aggregate", "process"] as const) {
		const { container } = card(kind, { instances: 1 }, { nodes });
		expect(nodeBar(container).join()).not.toContain("on node");
		cleanup();
	}
});
