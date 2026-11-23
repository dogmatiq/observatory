import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App.tsx";
import { application, overview } from "./fixtures/overview.ts";
import { streamOf } from "./fixtures/stream.ts";
import type { ClusterSummary } from "./model.ts";
import {
	FakeEventSource,
	stubBrowser,
	stubEventSource,
	tipOf,
} from "./test-support.ts";

beforeEach(() => {
	stubBrowser();
	stubEventSource();
	window.localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/**
 * serve makes the Observatory's API answer as the given function says. It
 * returns the requests that were made, as their paths.
 */
function serve(answer: (path: string) => Response | Promise<Response>) {
	const requests: string[] = [];
	vi.stubGlobal("fetch", async (path: string) => {
		requests.push(path);
		return answer(path);
	});
	return requests;
}

function json(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json" },
	});
}

/** Connects the stream that is open, and sends the burst of the fixture. */
function connect(source = FakeEventSource.live[0]) {
	act(() => {
		source?.open();
		for (const [name, data] of streamOf(application, overview)) {
			source?.send(name, data);
		}
	});
}

test("the review page shows each state of the elements that are being worked on, including the ones that are errors", () => {
	render(<App path="/review" />);

	for (const state of ["Several nodes", "No live nodes", "Online", "Offline"]) {
		expect(screen.getAllByText(state).length).toBeGreaterThan(0);
	}
});

test("the vitals page has the words of every combination of the popovers of the vital statistics", () => {
	render(<App path="/vitals" />);

	// The rate of the events tile, and each of the four things that the rate of the
	// queues tile can count, each in the three states of a rate.
	expect(screen.getAllByText("Event rate")).toHaveLength(3);
	for (const kind of [
		"Message handling rate",
		"Message removal rate",
		"Command handling rate",
		"Deadline handling rate",
	]) {
		expect(screen.getAllByText(kind)).toHaveLength(3);
	}
	expect(
		screen.getAllByText(
			"No new samples are arriving, so this average is out of date.",
		),
	).toHaveLength(5);
	expect(screen.getAllByText("Messages waiting")).toHaveLength(2);
});

test("the fixture is the prototype's overview, with the Observatory's name as the page's heading", () => {
	render(<App path="/fixture" />);

	expect(
		screen.getByRole("heading", { name: "Dogma Observatory", level: 1 }),
	).toBeDefined();
	expect(screen.getByRole("region", { name: "Totals" })).toBeDefined();
	expect(screen.getAllByRole("article")).toHaveLength(7);
});

test("the page has a banner, a main region and a footer", () => {
	render(<App path="/fixture" />);

	expect(screen.getByRole("banner")).toBeDefined();
	expect(screen.getByRole("main")).toBeDefined();
	expect(screen.getByRole("contentinfo")).toBeDefined();
});

test("the brand links to the first page", () => {
	render(<App path="/fixture" />);

	expect(
		screen
			.getByRole("link", { name: "dogmatiq observatory" })
			.getAttribute("href"),
	).toBe("/");
});

test("the title bar says which application the page is about, and its key", async () => {
	render(<App path="/fixture" />);

	expect(await tipOf(screen.getByText("statements"))).toBe(
		"Application statements, key d0137119-2660-4bc2-ab4c-bc156e08521c",
	);
});

test("the title bar's color mode control changes the page's colors", () => {
	render(<App path="/fixture" />);

	fireEvent.click(
		screen.getByRole("button", { name: "Color mode: automatic" }),
	);

	expect(document.documentElement.getAttribute("data-theme")).toBe("light");
});

test("the first page lists the clusters, each linking to its own page", async () => {
	const clusters: ClusterSummary[] = [
		{
			id: "aaa",
			application: { name: "statements", key: "k1" },
			reporting: true,
		},
		{ id: "b/b", application: { name: "billing", key: "k2" }, reporting: true },
	];
	const requests = serve(() => json(clusters));

	render(<App path="/" />);

	const link = await screen.findByRole("link", { name: "statements" });
	expect(link.getAttribute("href")).toBe("/clusters/aaa");
	expect(
		screen.getByRole("link", { name: "billing" }).getAttribute("href"),
	).toBe("/clusters/b%2Fb");
	expect(requests).toEqual(["/api/clusters"]);
});

test("the first page says so when no cluster has connected", async () => {
	serve(() => json([]));

	render(<App path="/" />);

	expect(
		await screen.findByText("No cluster has connected yet."),
	).toBeDefined();
});

test("the first page has no application in its title bar", async () => {
	serve(() => json([]));

	render(<App path="/" />);
	await screen.findByText("No cluster has connected yet.");

	expect(screen.getByRole("banner").textContent).not.toContain("statements");
});

test("a cluster's page shows what the stream tells it, and never asks about the cluster", async () => {
	const requests = serve(() => new Response("{}"));

	render(<App path="/clusters/abc%2F1" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	expect(screen.getByText("Loading…")).toBeDefined();

	connect();

	expect(await screen.findByRole("region", { name: "Totals" })).toBeDefined();
	expect(screen.getByText("statements")).toBeDefined();
	expect(screen.getAllByRole("article")).toHaveLength(7);
	expect(requests).toEqual([]);
	expect(FakeEventSource.live[0]?.url).toBe("/api/clusters/abc%2F1/watch");
});

test("a cluster's page says that it is loading until it has data", () => {
	serve(() => new Promise<Response>(() => {}));

	render(<App path="/clusters/abc" />);

	expect(screen.getByText("Loading…")).toBeDefined();
	expect(screen.getByRole("banner")).toBeDefined();
});

test("a cluster that the Observatory doesn't know says so", async () => {
	serve(() => new Response("", { status: 404 }));

	render(<App path="/clusters/abc" />);

	// The stream of a cluster that isn't known fails to open for good, and then
	// the page asks why.
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	act(() => FakeEventSource.live[0]?.fail(true));

	expect(
		await screen.findByRole("heading", { name: "This cluster isn't known" }),
	).toBeDefined();
	expect(
		screen
			.getByRole("link", { name: "Go to the clusters" })
			.getAttribute("href"),
	).toBe("/");
});

test("a cluster that can't be read at all says so", async () => {
	serve(() => new Response("", { status: 500 }));

	render(<App path="/clusters/abc" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	act(() => FakeEventSource.live[0]?.fail(true));

	expect(
		await screen.findByRole("heading", { name: "This cluster can't be read" }),
	).toBeDefined();
});

test("a cluster's page keeps its data, and says so, while updates have stopped", async () => {
	serve(() => new Response("{}"));

	render(<App path="/clusters/abc" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	connect();
	await screen.findByRole("region", { name: "Totals" });
	expect(screen.queryByRole("status")).toBeNull();

	act(() => FakeEventSource.live[0]?.fail());

	expect(screen.getByRole("region", { name: "Totals" })).toBeDefined();
	expect(screen.getByRole("status").textContent).toContain(
		"Updates have stopped",
	);

	connect();

	expect(screen.queryByRole("status")).toBeNull();
});

test("a cluster's page shows each change that the stream sends", async () => {
	serve(() => new Response("{}"));

	render(<App path="/clusters/abc" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	connect();
	await screen.findByRole("region", { name: "Totals" });

	act(() =>
		FakeEventSource.live[0]?.send("changed", {
			application: { name: "billing" },
		}),
	);

	expect(screen.getByText("billing")).toBeDefined();
});

test("a handler that the stream says is gone has no card", async () => {
	serve(() => new Response("{}"));

	render(<App path="/clusters/abc" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	connect();
	await screen.findByRole("region", { name: "Totals" });
	expect(screen.getByRole("article", { name: "account" })).toBeDefined();

	const [first] = overview.handlers;
	act(() =>
		FakeEventSource.live[0]?.send("changed", {
			handlers: { [first?.key ?? ""]: null },
		}),
	);

	expect(screen.queryByRole("article", { name: "account" })).toBeNull();
});

test("an address that is not a page says so", () => {
	render(<App path="/elsewhere" />);

	expect(
		screen.getByRole("heading", { name: "This page isn't here" }),
	).toBeDefined();
});

test("a part of the document that isn't well formed leaves out its tile, and not the others", async () => {
	serve(() => new Response("{}"));

	render(<App path="/clusters/abc" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	connect();
	await screen.findByRole("region", { name: "Totals" });
	expect(screen.getByRole("article", { name: "Events" })).toBeDefined();

	act(() =>
		FakeEventSource.live[0]?.send("changed", {
			eventStreams: { s: { length: "x" } },
		}),
	);

	await waitFor(() =>
		expect(screen.queryByRole("article", { name: "Events" })).toBeNull(),
	);
	expect(screen.getByRole("article", { name: "Queues" })).toBeDefined();
});
