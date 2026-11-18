import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { overview } from "../fixtures/overview.ts";
import type { OverviewData } from "../model.ts";
import { stubBrowser, visibleText } from "../test-support.ts";
import { Overview } from "./Overview.tsx";

beforeEach(stubBrowser);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("the totals are the prototype's", () => {
	render(<Overview data={overview} />);

	const totals = within(screen.getByRole("region", { name: "Totals" }));
	const events = totals.getByRole("article", { name: "Events" });
	const queues = totals.getByRole("article", { name: "Queues" });
	const cluster = totals.getByRole("article", { name: "Cluster" });

	expect(visibleText(events)).toBe(
		"347events per minute, 1.2K events in 2 streams",
	);
	expect(visibleText(queues)).toBe("19messages in 1 queue, 442/min");
	expect(visibleText(cluster)).toBe("3cluster nodes, 5 workloads");
});

test("the handlers are the prototype's", () => {
	render(<Overview data={overview} />);

	const handlers = within(screen.getByRole("region", { name: "Handlers" }));

	expect(handlers.getAllByRole("article").map(visibleText)).toEqual([
		"accountaggregate100instances0commands",
		"statement-scheduleprocess20in progress0events20deadlines",
		"mailerintegration0commands",
		"balancesprojection0events",
	]);
});

test("the bars say what they are made of", () => {
	render(<Overview data={overview} />);

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
	render(<Overview data={overview} />);

	expect(screen.queryAllByRole("link")).toEqual([]);
});

test("the tiles and the cards are links to where they are given", () => {
	render(
		<Overview
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

	render(<Overview data={broken} />);

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

	render(<Overview data={broken} />);

	expect(screen.getAllByRole("alert")).toHaveLength(1);
	expect(screen.getAllByRole("article")).toHaveLength(6);
	expect(screen.getByRole("article", { name: "Events" })).toBeDefined();
});

test("a tile whose metrics the engine doesn't report is hidden", () => {
	const { events, ...withoutEvents } = overview;
	const { queues, ...withoutQueues } = overview;
	expect(events).toBeDefined();
	expect(queues).toBeDefined();

	render(<Overview data={withoutEvents} />);
	expect(screen.queryByRole("article", { name: "Events" })).toBeNull();
	expect(screen.getByRole("article", { name: "Queues" })).toBeDefined();
	expect(screen.getByRole("article", { name: "Cluster" })).toBeDefined();

	cleanup();

	render(<Overview data={withoutQueues} />);
	expect(screen.queryByRole("article", { name: "Queues" })).toBeNull();
	expect(screen.getByRole("article", { name: "Events" })).toBeDefined();
});

test("a rate that the Observatory has never had is a dash", () => {
	render(
		<Overview
			data={{
				...overview,
				events: { ...overview.events, rate: {} },
				queues: { ...overview.queues, removed: {} },
			}}
		/>,
	);

	const events = screen.getByRole("article", { name: "Events" });
	const queues = screen.getByRole("article", { name: "Queues" });
	expect(visibleText(events)).toBe(
		"\u2014events per minute, 1.2K events in 2 streams",
	);
	expect(visibleText(queues)).toBe("19messages in 1 queue, \u2014/min");
});
