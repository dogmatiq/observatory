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
import { stubBrowser } from "../test-support.ts";
import { Overview } from "./Overview.tsx";
import {
	noSignalFromEngine,
	noSignalFromNodes,
	rateUnavailable,
} from "./statuses.ts";

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

test("a cluster with no live nodes has a red number, and the words after it still make a sentence", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				cluster: { nodes: [] },
			}}
		/>,
	);

	const tile = screen.getByRole("article", { name: "Cluster" });
	// The alert flag reads its status where it is, after the number.
	expect(tile.textContent).toBe(`0${noSignalFromNodes.text}cluster nodes`);
	expect(tile.querySelector(".text-bad")?.textContent).toBe("0");
});

test("one node and one workload are in the singular", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				cluster: {
					reportsWorkloads: true,
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
	// Neither rate is known yet, which each tile's alert flag reads where it is.
	expect(events.textContent).toBe(
		`0${rateUnavailable.text}events per minute, 1.2K events in 2 streams`,
	);
	expect(queues.textContent).toBe(
		`19${rateUnavailable.text}messages in 1 queue, 0/min`,
	);
	expect(
		within(events).getByRole("img", { name: "not available" }),
	).toBeDefined();
});

test("the events tile of an engine that appends every event to one stream doesn't count streams, and has no bar", () => {
	const events = overview.events;
	render(
		<Overview
			application={application}
			data={{
				...overview,
				events: {
					...events,
					streams: [{ id: "85d749b5", size: 652 }],
					oneStream: true,
				},
			}}
		/>,
	);

	const tile = within(screen.getByRole("region", { name: "Totals" })).getByRole(
		"article",
		{ name: "Events" },
	);
	expect(tile.textContent).toBe("347events per minute, 652 events");
	expect(tile.querySelector("div.h-2")).toBeNull();
});

test("the queues tile of an engine that keeps every message in one queue doesn't count queues, and has no bar", () => {
	render(
		<Overview
			application={application}
			data={{ ...overview, queues: { ...overview.queues, oneQueue: true } }}
		/>,
	);

	const tile = within(screen.getByRole("region", { name: "Totals" })).getByRole(
		"article",
		{ name: "Queues" },
	);
	expect(tile.textContent).toBe("19messages, 442/min");
	expect(tile.querySelector("div.h-2")).toBeNull();
});

test("a tile that only some of the nodes report shows their numbers, blurred by how few they are", () => {
	render(
		<Overview
			application={application}
			data={{ ...overview, events: { ...overview.events, coverage: 0.75 } }}
		/>,
	);

	const tile = within(screen.getByRole("region", { name: "Totals" })).getByRole(
		"article",
		{ name: "Events" },
	);

	// The numbers are the nodes' own, not the zero that is not available.
	expect(within(tile).queryAllByRole("img", { name: "not available" })).toEqual(
		[],
	);
	const blurred = [...tile.querySelectorAll<HTMLElement>(".distrust-blur")];
	expect(blurred).not.toHaveLength(0);
	for (const n of blurred) {
		expect(n.style.getPropertyValue("--distrust")).toBe("0.25");
	}
});

test("a cluster whose engine doesn't divide its work into workloads leaves them out", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				cluster: {
					nodes: overview.cluster.nodes.map(({ workloads: _, ...n }) => n),
				},
			}}
		/>,
	);

	const cluster = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Cluster" });
	expect(cluster.textContent).toBe("3cluster nodes");
	expect(cluster.querySelector(".h-2")).toBeNull();
});

test("an engine that doesn't cluster has an engine tile in place of the cluster tile, which says whether its process is online", () => {
	render(
		<Overview
			application={application}
			data={{
				...overview,
				cluster: undefined,
				engine: { node: overview.cluster.nodes[0] },
			}}
		/>,
	);

	const totals = within(screen.getByRole("region", { name: "Totals" }));
	expect(totals.queryByRole("article", { name: "Cluster" })).toBeNull();

	const engine = totals.getByRole("article", { name: "Engine" });
	expect(engine.textContent).toBe("Online");

	// An engine that doesn't cluster has no nodes, so the tile never names one.
	expect(engine.textContent).not.toMatch(/node|cluster/i);
	expect(engine.className).not.toContain("--color-bad");
});

test("the engine tile of an engine whose process isn't live says that it is offline, in red", () => {
	render(
		<Overview
			application={application}
			data={{ ...overview, cluster: undefined, engine: {} }}
		/>,
	);

	const engine = within(
		screen.getByRole("region", { name: "Totals" }),
	).getByRole("article", { name: "Engine" });
	expect(engine.textContent).toBe(`Offline${noSignalFromEngine.text}`);
	expect(engine.className).toContain("--color-bad");
	expect(within(engine).getByText("Offline").className).toContain("text-bad");
});

test("a rate that is built from the messages that handlers handle says so", () => {
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
});

test("a rate of only the commands that handlers handle, or only their deadlines, says which", () => {
	for (const [of, words] of [
		["commands handled", "commands handled per minute"],
		["deadlines handled", "deadlines handled per minute"],
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

		expect(screen.getByText(words)).toBeDefined();
		unmount();
	}
});

test("no icon or figure of a tile or a digest opens a popover, because each card has its explainer", async () => {
	vi.useFakeTimers();
	render(<Overview application={application} data={overview} />);

	for (const card of screen.getAllByRole("article")) {
		for (const element of card.querySelectorAll("span, svg")) {
			fireEvent.pointerEnter(element);
			act(() => {
				vi.advanceTimersByTime(600);
			});
			// The tooltips that stay are the whole of a handler's name that is cut
			// short, and the flag of a handler that minimizes concurrency.
			const tip = screen.queryByRole("tooltip")?.textContent;
			if (tip !== undefined) {
				expect(
					overview.handlers.some((h) => h.name === tip) ||
						tip.startsWith("Minimize concurrency"),
				).toBe(true);
			}
			fireEvent.pointerLeave(element);
			act(() => {
				vi.advanceTimersByTime(300);
			});
		}
	}
	vi.useRealTimers();
});

test("every tile and digest has a button that explains it", () => {
	render(<Overview application={application} data={overview} />);

	for (const name of [
		"Explain the events tile",
		"Explain the queues tile",
		"Explain the cluster tile",
		"Explain the account aggregate digest",
		"Explain the statement-schedule process digest",
		"Explain the mailer integration digest",
		"Explain the balances projection digest",
	]) {
		expect(screen.getByRole("button", { name })).toBeDefined();
	}
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

test("a tile in an error state has an accent along its top, orange for failing messages and red for no live nodes, and others have none", () => {
	const accentOf = (name: string) =>
		within(screen.getByRole("region", { name: "Totals" }))
			.getByRole("article", { name })
			.className.match(/inset_0_3px_0_var\(--color-(\w+)\)/)?.[1];

	const { rerender } = render(
		<Overview application={application} data={overview} />,
	);
	expect(accentOf("Events")).toBeUndefined();
	expect(accentOf("Queues")).toBeUndefined();
	expect(accentOf("Cluster")).toBeUndefined();

	rerender(
		<Overview
			application={application}
			data={{
				...overview,
				queues: { ...(overview.queues as object), failing: 2 } as never,
				cluster: { nodes: [] },
			}}
		/>,
	);
	expect(accentOf("Events")).toBeUndefined();
	expect(accentOf("Queues")).toBe("failing");
	expect(accentOf("Cluster")).toBe("bad");
});

test("a cluster that is down keeps its tiles and its cards, with their numbers as zeros that are not available, and not the cluster tile's", () => {
	const { container, rerender } = render(
		<Overview application={application} data={overview} />,
	);
	expect(container.querySelector(".distrust-blur")).toBeNull();

	rerender(
		<Overview
			application={application}
			data={{ ...overview, cluster: { nodes: [] } }}
			down
		/>,
	);

	const totals = within(screen.getByRole("region", { name: "Totals" }));
	for (const name of ["Events", "Queues"]) {
		expect(
			totals.getByRole("article", { name }).querySelector(".distrust-blur")
				?.textContent,
		).not.toBe("");
	}
	expect(
		totals
			.getByRole("article", { name: "Cluster" })
			.querySelector(".distrust-blur"),
	).toBeNull();

	// None of the numbers is current, so each is a zero that is not available, as
	// on a page that loads with the cluster down.
	cleanup();
	render(
		<Overview
			application={application}
			data={{ ...overview, cluster: { nodes: [] } }}
			down
		/>,
	);
	const unavailableTotals = within(
		screen.getByRole("region", { name: "Totals" }),
	);
	for (const name of ["Events", "Queues"]) {
		const tile = unavailableTotals.getByRole("article", { name });
		const unavailable = within(tile).getAllByRole("img", {
			name: "not available",
		});
		expect(unavailable.length).toBeGreaterThan(0);
		for (const n of unavailable) {
			expect(n.textContent).toBe("0");
		}
	}
	expect(
		within(screen.getByRole("region", { name: "Handlers" }))
			.getAllByRole("img", { name: "not available" })
			.every((n) => n.textContent === "0"),
	).toBe(true);
	expect(
		within(screen.getByRole("region", { name: "Handlers" })).getAllByRole(
			"article",
		).length,
	).toBeGreaterThan(0);
	expect(
		screen
			.getByRole("region", { name: "Handlers" })
			.querySelector(".distrust-blur"),
	).not.toBeNull();
});
