import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { HandlerData, HandlerSummary } from "../model.ts";
import { tipOf } from "../test-support.ts";
import { HandlerDigest } from "./HandlerDigest.tsx";

afterEach(cleanup);

const quiet: HandlerSummary = {
	failing: 0,
	queuedMessages: 0,
	unhandledEvents: 0,
	bindings: [],
};

function digest(
	kind: HandlerData["kind"],
	summary: Partial<HandlerSummary> = {},
	rest: Partial<HandlerData> = {},
) {
	return render(
		<HandlerDigest
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

/** The numbers on the digest, each as its label and its value. */
function stats(container: HTMLElement) {
	return Object.fromEntries(
		// The readout beside the kind icon is for the pointer only, and is hidden.
		[...container.querySelectorAll("span.text-xs:not([aria-hidden])")].map(
			(label) => [label.textContent, label.previousElementSibling?.textContent],
		),
	);
}

test("an aggregate shows its instances and commands", () => {
	const { container } = digest("aggregate", {
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
	const { container } = digest("process", {
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
	const { container } = digest("aggregate", { instances: 1 });

	expect(stats(container)).toHaveProperty("instance", "1");
});

test("an aggregate shows its active instances only when it is given them", () => {
	const { container } = digest("aggregate", {
		instances: 5,
		activeInstances: { count: 2, title: "Recently active" },
	});

	expect(stats(container)).toHaveProperty("active", "2");
});

test("a process shows the instances in progress, its events and its deadlines", () => {
	const { container } = digest("process", {
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

test("a process counts its ready deadlines with its failing ones beside them, not taken out of them", () => {
	const { container } = digest("process", {
		queuedMessages: 3,
		failing: 2,
		schedulesDeadlines: true,
	});

	expect(stats(container).deadlines).toMatch(/^3\+2/);
});

test("an integration counts the commands that aren't failing, and then those that are", () => {
	const { container } = digest("integration", {
		queuedMessages: 3,
		failing: 2,
	});

	expect(stats(container).commands).toMatch(/^1\+2/);
});

test("a process that schedules no deadlines has no deadlines or bar", () => {
	const { container } = digest("process", {
		bindings: [{ id: "aaaaaaaa", instances: 4 }],
	});

	expect(Object.keys(stats(container))).toEqual(["in progress", "events"]);
	expect(container.querySelector("svg[role=img]")).toBeNull();
});

test("an integration shows its commands", () => {
	const { container } = digest("integration", { queuedMessages: 12 });

	expect(stats(container)).toEqual({ commands: "12" });
});

test("a projection shows its events", () => {
	const { container } = digest("projection", { unhandledEvents: 12_000 });

	expect(stats(container)).toEqual({ events: "12.0K" });
});

test("failing messages are counted after the others that wait, and the digest is named by its handler", () => {
	const { container } = digest("integration", {
		failing: 1,
		queuedMessages: 4,
	});

	const article = screen.getByRole("article", { name: "the-handler" });
	expect(within(article).getByText("+1")).toBeDefined();
	expect(within(article).getByText(/1 message failing/)).toBeDefined();
	expect(stats(container)).toEqual({
		commands: "3+1 and 1 message failing",
	});
});

test("the number that waits is not coloured because some of it is failing, and only the failing count is", () => {
	digest("integration", { failing: 1, queuedMessages: 4 });

	// The count is in a box that is red, inside the one that holds it beside the
	// number that waits, which is not.
	const failing = screen.getByText("+1").parentElement?.parentElement;
	expect(failing?.className).toContain("text-failing");
	expect(failing?.parentElement?.parentElement?.className).not.toContain(
		"text-failing",
	);
});

test("when all that waits is failing, the number that doesn't is zero and recedes", () => {
	const { container } = digest("integration", {
		failing: 2,
		queuedMessages: 2,
	});

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
		<HandlerDigest handler={handler(30)} />,
	);
	const faint = () => container.querySelector("span.text-faint");

	// Nothing of the stats is faint but the other numbers that are zero.
	expect(container.textContent).toContain("30");

	rerender(<HandlerDigest handler={handler(0)} />);
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

test("a digest with no failing messages does not say so", () => {
	digest("integration");

	expect(screen.queryByText(/failing/)).toBeNull();
});

test("the handler's kind and whether it is disabled are shown", () => {
	digest("projection", {}, { disabled: true });

	expect(screen.getByText("projection, disabled")).toBeDefined();
});

test("a handler that minimizes concurrency says so in a popover", async () => {
	digest("integration", {}, { minimizesConcurrency: true });

	const icon = screen.getByText("integration").querySelector("svg");
	expect(await tipOf(icon?.parentElement as Element)).toMatch(
		/^Minimize concurrency:/,
	);
});

test("a digest is not a link unless it is given one", () => {
	digest("projection");
	expect(screen.queryByRole("link")).toBeNull();

	cleanup();

	render(
		<HandlerDigest
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
	const aggregate = digest(
		"aggregate",
		{ queuedMessages: undefined },
		{ summary: { failing: 0, bindings: [] } },
	);
	expect(stats(aggregate.container)).toEqual({});

	cleanup();

	const process = digest(
		"process",
		{},
		{ summary: { failing: 0, schedulesDeadlines: true, bindings: [] } },
	);
	expect(stats(process.container)).toEqual({ "in progress": "0" });

	cleanup();

	const projection = digest(
		"projection",
		{},
		{ summary: { failing: 0, bindings: [] } },
	);
	expect(stats(projection.container)).toEqual({});
});

/** The segments of the bar of nodes on the digest, by their titles. */
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
	const { container } = digest("integration", {}, { nodes });

	expect(nodeBar(container)).toEqual([
		"180 commands/min on node aaaaaaaa",
		"60 commands/min on node bbbbbbbb",
	]);
});

test("a projection shows a bar of the nodes that handled its events", () => {
	const { container } = digest("projection", {}, { nodes });

	expect(nodeBar(container)).toEqual([
		"180 events/min on node aaaaaaaa",
		"60 events/min on node bbbbbbbb",
	]);
});

test("the bar of nodes is at the bottom of the digest", () => {
	const { container } = digest("integration", { failing: 2 }, { nodes });

	const bottom = container.querySelector(".mt-auto");
	expect(nodeBar(bottom as HTMLElement)).toHaveLength(2);
});

test("failing messages don't add a line, so that they don't change the height of the digest", () => {
	const { container } = digest("integration", {
		failing: 2,
		queuedMessages: 2,
	});

	expect(container.querySelector(".mt-auto")).toBeNull();
});

test("every digest keeps the room along the bottom, whether it has a bar or not, so that the bars of the digests in a row sit in one place", () => {
	const cases: [HandlerData["kind"], Partial<HandlerSummary>][] = [
		["integration", {}],
		["aggregate", { bindings: [] }],
		["process", { schedulesDeadlines: true, bindings: [] }],
		["aggregate", { bindings: undefined }],
	];
	for (const [kind, summary] of cases) {
		const { container } = digest(kind, summary);
		expect(container.firstElementChild?.className).toContain("pb-15");
		cleanup();
	}
});

test("a digest with no chart has a sky in its place, which has the moon if no sky of the page has been drawn longer", () => {
	const { container } = digest("integration");

	expect(container.querySelector("[data-moon]")).not.toBeNull();
});

test("a digest with a chart has no sky", () => {
	const chart = { end: 0, points: [{ at: 0, value: 1 }] };
	const { container } = digest(
		"integration",
		{},
		{ history: chart, charted: "commands" },
	);

	expect(container.querySelector("[data-moon]")).toBeNull();
});

test("an integration or a projection whose nodes say nothing has no bar", () => {
	expect(nodeBar(digest("integration").container)).toEqual([]);
	expect(digest("integration").container.querySelector(".bg-sunk")).toBeNull();
});

test("nodes that all handled nothing give an empty track, that keeps the digest's place", () => {
	const { container } = digest(
		"projection",
		{},
		{ nodes: [{ id: "aaaaaaaa", rate: 0 }] },
	);

	expect(nodeBar(container)).toEqual([]);
	expect(container.querySelector(".bg-sunk")).not.toBeNull();
});

test("a handler with an empty list of nodes has an empty track too", () => {
	const { container } = digest("integration", {}, { nodes: [] });

	expect(nodeBar(container)).toEqual([]);
	expect(container.querySelector(".bg-sunk")).not.toBeNull();
});

test("an aggregate and a process don't draw a bar of nodes", () => {
	for (const kind of ["aggregate", "process"] as const) {
		const { container } = digest(kind, { instances: 1 }, { nodes });
		expect(nodeBar(container).join()).not.toContain("on node");
		cleanup();
	}
});

test("a chart has the color of the messages that it counts", () => {
	const chart = { end: 0, points: [{ at: 0, value: 1 }] };

	const commands = digest(
		"integration",
		{},
		{ history: chart, charted: "commands" },
	).container;
	expect(commands.querySelector("svg.h-10")?.getAttribute("class")).toContain(
		"--color-queues",
	);

	cleanup();

	const events = digest(
		"integration",
		{},
		{ history: chart, charted: "events" },
	).container;
	expect(events.querySelector("svg.h-10")?.getAttribute("class")).toContain(
		"--color-streams",
	);
});

test("the punctuation of a handler's name is muted, and the words are not, and a tooltip has the whole name when it is cut short", async () => {
	render(
		<HandlerDigest
			handler={{
				key: "k",
				name: "statement-schedule.v2",
				kind: "process",
				summary: quiet,
			}}
		/>,
	);

	const digest = screen.getByRole("article", { name: "statement-schedule.v2" });
	const name = document.getElementById(
		digest.getAttribute("aria-labelledby") as string,
	) as HTMLElement;
	expect(name.textContent).toBe("statement-schedule.v2");

	// The page has no layout here, so the name is made wider than its place.
	Object.defineProperty(name, "scrollWidth", { value: 200 });
	Object.defineProperty(name, "clientWidth", { value: 100 });
	expect(await tipOf(name)).toBe("statement-schedule.v2");

	const muted = [...name.querySelectorAll(".text-faint")].map(
		(e) => e.textContent,
	);
	expect(muted).toEqual(["-", "."]);
});

test("a handler's name that fits has no tooltip", () => {
	vi.useFakeTimers();
	try {
		render(
			<HandlerDigest
				handler={{
					key: "k",
					name: "statements",
					kind: "process",
					summary: quiet,
				}}
			/>,
		);

		const digest = screen.getByRole("article", { name: "statements" });
		const name = document.getElementById(
			digest.getAttribute("aria-labelledby") as string,
		) as HTMLElement;
		fireEvent.pointerEnter(name);
		act(() => vi.runAllTimers());
		expect(screen.queryByRole("tooltip")).toBeNull();
	} finally {
		vi.useRealTimers();
	}
});
