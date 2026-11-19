import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { application, overview } from "../fixtures/overview.ts";
import type { OverviewData } from "../model.ts";
import { stubBrowser, tipOf } from "../test-support.ts";
import { Overview } from "./Overview.tsx";

beforeEach(stubBrowser);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("the totals are the prototype's", () => {
	render(<Overview application={application} data={overview} />);

	const totals = within(screen.getByRole("region", { name: "Totals" }));
	const events = totals.getByRole("article", { name: "Events" });
	const queues = totals.getByRole("article", { name: "Queues" });
	const cluster = totals.getByRole("article", { name: "Cluster" });

	expect(events.textContent).toBe(
		"347events per minute, 1.2K events in 2 streams",
	);
	expect(queues.textContent).toBe("19messages in 1 queue, 442/min");
	expect(cluster.textContent).toBe("3cluster nodes, 5 workloads");
});

test("the handlers are the prototype's", () => {
	render(<Overview application={application} data={overview} />);

	const handlers = within(screen.getByRole("region", { name: "Handlers" }));

	expect(handlers.getAllByRole("article").map((e) => e.textContent)).toEqual([
		"accountaggregate100instances0commands",
		"statement-scheduleprocess20in progress0events20deadlines",
		"mailerintegration0commands",
		"balancesprojection0events",
	]);
});

test("the bars say what they are made of", () => {
	render(<Overview application={application} data={overview} />);

	expect(
		screen.getByRole("img", {
			name: "652 events on event stream 85d749b5; 529 events on event stream fc53a99f",
		}),
	).toBeDefined();
	expect(
		screen.getByRole("img", { name: "19 messages in queue 113cbdc3" }),
	).toBeDefined();
	expect(
		screen.getByRole("img", { name: "3 workloads owned by node 113cbdc3" }),
	).toBeDefined();
});

test("nothing is a link unless it is given somewhere to link to", () => {
	render(<Overview application={application} data={overview} />);

	expect(screen.queryAllByRole("link")).toEqual([]);
});

test("the tiles and the cards are links to where they are given", () => {
	render(
		<Overview
			application={application}
			data={overview}
			links={{
				events: "/streams",
				queues: "/queues",
				cluster: "/cluster",
				handler: (key) => `/handlers/${key}`,
			}}
		/>,
	);

	const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
	expect(hrefs).toEqual([
		"/streams",
		"/queues",
		"/cluster",
		...overview.handlers.map((h) => `/handlers/${h.key}`),
	]);
});

test("failing messages are shown in the queues tile, and the plural is exact", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				queues: { ...overview.queues, failing: 1234 },
			}}
		/>,
	);

	const tile = screen.getByRole("article", { name: "Queues" });
	expect(within(tile).getByText("+1.2K")).toBeDefined();
	expect(within(tile).getByText(/1,234 messages failing/)).toBeDefined();
	expect(tile.textContent).toContain("442/min");
	expect(tile.textContent).not.toContain("442/min, ");
});

test("a cluster with no live nodes says so", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				cluster: { nodes: [] },
			}}
		/>,
	);

	expect(screen.getByRole("article", { name: "Cluster" }).textContent).toBe(
		"0no live nodes",
	);
});

test("one node and one workload are in the singular", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				cluster: {
					nodes: [{ id: "abcdefgh-1", workloads: 1, heartbeats: [] }],
				},
			}}
		/>,
	);

	expect(screen.getByRole("article", { name: "Cluster" }).textContent).toBe(
		"1cluster node, 1 workload",
	);
});

test("a tile that fails does not take the page with it", () => {
	vi.spyOn(console, "error").mockImplementation(() => {});

	const broken = {
		...overview,
		// Reading a stream's size fails.
		events: {
			...overview.events,
			streams: [
				{
					id: "aaaaaaaa",
					get size(): number {
						throw new Error("stream is unreadable");
					},
				},
			],
		},
	} satisfies OverviewData;

	render(<Overview application={application} data={broken} />);

	// The tile that failed says so, in its place.
	expect(screen.getByRole("alert").textContent).toBe(
		"Unable to read this. stream is unreadable",
	);
	expect(screen.queryByRole("article", { name: "Events" })).toBeNull();

	// Everything else is still there.
	expect(screen.getByRole("article", { name: "Queues" })).toBeDefined();
	expect(screen.getByRole("article", { name: "Cluster" })).toBeDefined();
	expect(screen.getAllByRole("article")).toHaveLength(6);
});

test("a card that fails does not take the other cards with it", () => {
	vi.spyOn(console, "error").mockImplementation(() => {});

	const [account, ...others] = overview.handlers;
	const broken = {
		...overview,
		handlers: [
			{
				...(account as NonNullable<typeof account>),
				get summary(): never {
					throw new Error("handler is unreadable");
				},
			},
			...others,
		],
	} as OverviewData;

	render(<Overview application={application} data={broken} />);

	expect(screen.getAllByRole("alert")).toHaveLength(1);
	expect(screen.getAllByRole("article")).toHaveLength(6);
	expect(screen.getByRole("article", { name: "Events" })).toBeDefined();
});

test("a tile whose metrics the engine doesn't report is hidden", () => {
	const { events, ...withoutEvents } = overview;
	const { queues, ...withoutQueues } = overview;
	expect(events).toBeDefined();
	expect(queues).toBeDefined();

	render(<Overview application={application} data={withoutEvents} />);
	expect(screen.queryByRole("article", { name: "Events" })).toBeNull();
	expect(screen.getByRole("article", { name: "Queues" })).toBeDefined();
	expect(screen.getByRole("article", { name: "Cluster" })).toBeDefined();

	cleanup();

	render(<Overview application={application} data={withoutQueues} />);
	expect(screen.queryByRole("article", { name: "Queues" })).toBeNull();
	expect(screen.getByRole("article", { name: "Events" })).toBeDefined();
});

test("a rate that the Observatory has never had is a zero in dot-matrix type, that is described as not available", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				events: { ...overview.events, rate: {} },
				queues: { ...overview.queues, throughput: { of: "removed" } },
			}}
		/>,
	);

	const events = screen.getByRole("article", { name: "Events" });
	const queues = screen.getByRole("article", { name: "Queues" });
	expect(events.textContent).toBe(
		"0events per minute, 1.2K events in 2 streams",
	);
	expect(queues.textContent).toBe("19messages in 1 queue, 0/min");
	expect(
		within(events).getByRole("img", { name: "not available" }),
	).toBeDefined();
});

test("the number of events per minute and the words beside it both have the card of the rate", async () => {
	render(<Overview application={application} data={overview} />);

	const events = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Events" });
	const number = events.querySelector("span.text-4xl span") as Element;
	const words = screen.getByText("events per minute");

	for (const target of [number, words]) {
		const tip = await tipOf(target);

		expect(tip).toContain("Event rate");
		expect(tip).toContain(
			"The rate at which the application is recording new events, averaged over the last minute.",
		);
		expect(tip).not.toContain("347");
	}
});

test("the icon of the events tile has a card that says what it is about, and not what it shows", async () => {
	render(<Overview application={application} data={overview} />);

	const events = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Events" });
	const icon = events.querySelector("svg")?.parentElement as Element;

	const tip = await tipOf(icon);

	expect(tip).toContain("Events");
	expect(tip).toContain(
		"This section shows information about the events and event streams in the statements application.",
	);
	expect(tip).not.toContain("The bar shows");
});

test("a rate that is built from the messages that handlers handle says so, in its words and its card", async () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				queues: {
					failing: 0,
					throughput: { perMinute: 442, of: "handled" },
					history: overview.queues?.history,
				},
			}}
		/>,
	);

	const queues = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Queues" });
	expect(queues.textContent).toContain("messages handled per minute");

	const words = screen.getByText("messages handled per minute");
	const tip = await tipOf(words);
	expect(tip).toContain("Message handling rate");
	expect(tip).toContain(
		"It counts the messages that handlers have handled, which leaves out those that were removed from the queues without being handled.",
	);
});

test("a rate of only the commands that handlers handle, or only their deadlines, says which, in its words and its card", async () => {
	for (const [of, words, kind] of [
		[
			"commands handled",
			"commands handled per minute",
			"Command handling rate",
		],
		[
			"deadlines handled",
			"deadlines handled per minute",
			"Deadline handling rate",
		],
	] as const) {
		const { unmount } = render(
			<Overview
				application={application}
				data={{
					...overview,
					queues: {
						failing: 0,
						throughput: { perMinute: 442, of },
						history: overview.queues?.history,
					},
				}}
			/>,
		);

		const tip = await tipOf(screen.getByText(words));
		expect(tip).toContain(kind);
		expect(tip).toContain("it is only a part of the messages");
		unmount();
	}
});

test("no popover of the events tile gives the exact number of events", () => {
	vi.useFakeTimers();
	render(<Overview application={application} data={overview} />);

	const events = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Events" });

	const tips: (string | null | undefined)[] = [];
	for (const element of events.querySelectorAll("span, svg")) {
		fireEvent.pointerEnter(element);
		act(() => {
			vi.advanceTimersByTime(600);
		});
		tips.push(screen.queryByRole("tooltip")?.textContent);
		fireEvent.pointerLeave(element);
		act(() => {
			vi.advanceTimersByTime(300);
		});
	}

	expect(tips.filter(Boolean).length).toBeGreaterThan(0);
	expect(tips.filter((t) => /\d,\d{3}/.test(t ?? ""))).toEqual([]);
	vi.useRealTimers();
});

test("the icon of the queues tile has a card that says what it is about, and the figure of removals has the card of the rate", async () => {
	render(<Overview application={application} data={overview} />);

	const queues = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Queues" });
	const icon = queues.querySelector("svg")?.parentElement as Element;

	expect(await tipOf(icon)).toContain(
		"This section shows information about the messages and queues in the statements application.",
	);

	const rate = [...queues.querySelectorAll("span")].find(
		(e) => e.textContent === "442/min",
	) as Element;
	const tip = await tipOf(rate);
	expect(tip).toContain("Message removal rate");
	expect(tip).toContain(
		"The rate at which messages are being removed from the queues, averaged over the last minute.",
	);
	expect(tip).not.toContain("442");
});

test("the queues tile has no popover with the exact number of messages", () => {
	vi.useFakeTimers();
	render(<Overview application={application} data={overview} />);

	const queues = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Queues" });

	for (const element of queues.querySelectorAll("span")) {
		fireEvent.pointerEnter(element);
		act(() => {
			vi.advanceTimersByTime(600);
		});
		const tip = screen.queryByRole("tooltip")?.textContent ?? "";
		expect(tip).not.toMatch(/^\d[\d,]*$/);
		fireEvent.pointerLeave(element);
		act(() => {
			vi.advanceTimersByTime(300);
		});
	}
	vi.useRealTimers();
});

test("a rate of less than one event per minute is a whole number per hour", () => {
	const slow = structuredClone(overview);
	if (slow.events) {
		slow.events.rate = { perMinute: 0.4 };
	}
	render(<Overview application={application} data={slow} />);

	const events = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Events" });

	expect(events.textContent).toBe(
		"24events per hour, 1.2K events in 2 streams",
	);
});
