import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { application } from "../fixtures/overview.ts";
import type { HandlerData, HandlerSummary } from "../model.ts";
import { tipOf } from "../test-support.ts";
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
			application={application}
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

test("an aggregate shows its instances and commands", () => {
	const { container } = card("aggregate", {
		instances: 1200,
		queuedMessages: 3,
		bindings: [{ id: "abcdefgh1", instances: 1200 }],
	});

	expect(stats(container)).toEqual({
		instances: "1.2K",
		commands: "3",
	});
});

test("the numbers of messages are on the right, with their labels, and the numbers of instances stay on the left", () => {
	const { container } = card("process", {
		schedulesDeadlines: true,
		bindings: [{ id: "aaaaaaaa", instances: 4 }],
	});

	const right = container.querySelector("div.ml-auto");
	expect(stats(right as HTMLElement)).toEqual({ events: "0", deadlines: "0" });
	for (const label of ["events", "deadlines"]) {
		expect(
			within(right as HTMLElement).getByText(label).parentElement?.className,
		).toContain("items-end");
	}
	expect(within(right as HTMLElement).queryByText("in progress")).toBeNull();
});

test("an aggregate with one instance says so in the singular", () => {
	const { container } = card("aggregate", { instances: 1 });

	expect(stats(container)).toHaveProperty("instance", "1");
});

test("an aggregate shows its active instances only when it is given them", async () => {
	const { container } = card("aggregate", {
		instances: 5,
		activeInstances: { count: 2, title: "Recently active" },
	});

	expect(stats(container)).toHaveProperty("active", "2");
	expect(await tipOf(screen.getByText("active"))).toBe("Recently active");
});

test("a process shows the instances in progress, its events and its deadlines", () => {
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
		events: "7",
		deadlines: "1",
	});
});

test("a message kind on its own is the ones that are pending, and its popover says so", async () => {
	card("process", {
		schedulesDeadlines: true,
		unhandledEvents: 1,
		queuedMessages: 2,
	});

	expect(await tipOf(screen.getByText("events"))).toBe("events pending");
	expect(await tipOf(screen.getByText("deadlines"))).toBe("deadlines pending");
});

test("a process that schedules no deadlines has no deadlines or bar", () => {
	const { container } = card("process", {
		bindings: [{ id: "aaaaaaaa", instances: 4 }],
	});

	expect(Object.keys(stats(container))).toEqual(["in progress", "events"]);
	expect(container.querySelector("svg[role=img]")).toBeNull();
});

test("an integration shows its commands", () => {
	const { container } = card("integration", { queuedMessages: 12 });

	expect(stats(container)).toEqual({ commands: "12" });
});

test("a projection shows its events", () => {
	const { container } = card("projection", { unhandledEvents: 12_000 });

	expect(stats(container)).toEqual({ events: "12.0K" });
});

test("failing messages are counted after the others that wait, and the card is named by its handler", () => {
	const { container } = card("integration", { failing: 1, queuedMessages: 4 });

	const article = screen.getByRole("article", { name: "the-handler" });
	expect(within(article).getByText("+1")).toBeDefined();
	expect(within(article).getByText(/1 message failing/)).toBeDefined();
	expect(stats(container)).toEqual({
		commands: "3+1 and 1 message failing",
	});
});

test("the number that waits is not coloured because some of it is failing, and only the failing count is", () => {
	card("integration", { failing: 1, queuedMessages: 4 });

	// The count is in a box that is red, inside the one that holds it beside the
	// number that waits, which is not.
	const failing = screen.getByText("+1").parentElement?.parentElement;
	expect(failing?.className).toContain("text-failing");
	expect(failing?.parentElement?.parentElement?.className).not.toContain(
		"text-failing",
	);
});

test("when all that waits is failing, the number that doesn't is zero and recedes", () => {
	const { container } = card("integration", { failing: 2, queuedMessages: 2 });

	expect(stats(container)).toEqual({
		commands: "0+2 and 2 messages failing",
	});
	expect(
		container.querySelector("span.font-medium.text-faint")?.textContent,
	).toContain("0");
});

test("a number that falls to zero recedes once it has got there, and not while it ramps down", () => {
	vi.useFakeTimers();
	const handler = (instances: number): HandlerData => ({
		key: "k",
		name: "the-handler",
		kind: "process",
		summary: {
			...quiet,
			bindings: [{ id: "aaaaaaaa", instances }],
		},
	});
	const { container, rerender } = render(
		<HandlerCard application={application} handler={handler(30)} />,
	);
	const faint = () => container.querySelector("span.text-faint");

	// Nothing of the stats is faint but the other numbers that are zero.
	expect(container.textContent).toContain("30");

	rerender(<HandlerCard application={application} handler={handler(0)} />);
	act(() => {
		vi.advanceTimersByTime(80);
	});
	expect(container.textContent).not.toContain("30");
	expect(container.textContent).toMatch(/\d+in progress/);
	const progress = [...container.querySelectorAll("span.text-xs")].find(
		(e) => e.textContent === "in progress",
	)?.previousElementSibling;
	expect(progress?.className).not.toContain("text-faint");

	act(() => {
		vi.advanceTimersByTime(1000);
	});
	expect(progress?.textContent).toBe("0");
	expect(progress?.className).toContain("text-faint");
	expect(faint()).not.toBeNull();
	vi.useRealTimers();
});

test("a card with no failing messages does not say so", () => {
	card("integration");

	expect(screen.queryByText(/failing/)).toBeNull();
});

test("the handler's kind and whether it is disabled are shown", () => {
	card("projection", {}, { disabled: true });

	expect(screen.getByText("projection, disabled")).toBeDefined();
});

test("a handler that minimizes concurrency says so in a popover", async () => {
	card("integration", {}, { minimizesConcurrency: true });

	const icon = screen.getByText("integration").querySelector("svg");
	expect(await tipOf(icon?.parentElement as Element)).toMatch(
		/^Minimize concurrency:/,
	);
});

test("a card is not a link unless it is given one", () => {
	card("projection");
	expect(screen.queryByRole("link")).toBeNull();

	cleanup();

	render(
		<HandlerCard
			application={application}
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

test("the bar of nodes is at the bottom of the card", () => {
	const { container } = card("integration", { failing: 2 }, { nodes });

	const bottom = container.querySelector(".mt-auto");
	expect(nodeBar(bottom as HTMLElement)).toHaveLength(2);
});

test("failing messages don't add a line, so that they don't change the height of the card", () => {
	const { container } = card("integration", { failing: 2, queuedMessages: 2 });

	expect(container.querySelector(".mt-auto")).toBeNull();
});

test("every card keeps the room along the bottom, whether it has a bar or not, so that the bars of the cards in a row sit in one place", () => {
	const cases: [HandlerData["kind"], Partial<HandlerSummary>][] = [
		["integration", {}],
		["aggregate", { bindings: [] }],
		["process", { schedulesDeadlines: true, bindings: [] }],
		["aggregate", { bindings: undefined }],
	];
	for (const [kind, summary] of cases) {
		const { container } = card(kind, summary);
		expect(container.firstElementChild?.className).toContain("pb-15");
		cleanup();
	}
});

test("a card with no chart has a sky in its place, which has the moon if no sky of the page has been drawn longer", () => {
	const { container } = card("integration");

	expect(container.querySelector("[data-moon]")).not.toBeNull();
});

test("a card with a chart has no sky", () => {
	const chart = { end: 0, points: [{ at: 0, value: 1 }] };
	const { container } = card(
		"integration",
		{},
		{ history: chart, charted: "commands" },
	);

	expect(container.querySelector("[data-moon]")).toBeNull();
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

test("a chart has the color of the messages that it counts", () => {
	const chart = { end: 0, points: [{ at: 0, value: 1 }] };

	const commands = card(
		"integration",
		{},
		{ history: chart, charted: "commands" },
	).container;
	expect(commands.querySelector("svg.h-10")?.getAttribute("class")).toContain(
		"--color-queues",
	);

	cleanup();

	const events = card(
		"integration",
		{},
		{ history: chart, charted: "events" },
	).container;
	expect(events.querySelector("svg.h-10")?.getAttribute("class")).toContain(
		"--color-streams",
	);
});

test("the punctuation of a handler's name is muted, and the words are not, and a popover has the whole name", async () => {
	render(
		<HandlerCard
			application={application}
			handler={{
				key: "k",
				name: "statement-schedule.v2",
				kind: "process",
				summary: quiet,
			}}
		/>,
	);

	const card = screen.getByRole("article", { name: "statement-schedule.v2" });
	const name = document.getElementById(
		card.getAttribute("aria-labelledby") as string,
	) as HTMLElement;
	expect(name.textContent).toBe("statement-schedule.v2");
	expect(await tipOf(name)).toBe("statement-schedule.v2");

	const muted = [...name.querySelectorAll(".text-faint")].map(
		(e) => e.textContent,
	);
	expect(muted).toEqual(["-", "."]);
});
