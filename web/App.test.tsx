import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App.tsx";
import { application, overview } from "./fixtures/overview.ts";
import { streamOf } from "./fixtures/stream.ts";
import { noSite } from "./lib/route.ts";
import type { ClusterSummary, Installation } from "./model.ts";
import {
	FakeEventSource,
	stubBrowser,
	stubEventSource,
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

test("the review page is at /-/review", () => {
	render(<App path="/-/review" />);

	expect(
		screen.getByRole("button", { name: "Replay animations" }),
	).toBeDefined();
});

test("the fixture is the prototype's overview, with the Observatory's name as the page's heading", () => {
	render(<App path="/-/fixture" />);

	expect(
		screen.getByRole("heading", { name: "Dogma Observatory", level: 1 }),
	).toBeDefined();
	expect(screen.getByRole("region", { name: "Totals" })).toBeDefined();
	expect(screen.getAllByRole("article")).toHaveLength(7);
});

test("the page has a banner, a main region and a footer", () => {
	render(<App path="/-/fixture" />);

	expect(screen.getByRole("banner")).toBeDefined();
	expect(screen.getByRole("main")).toBeDefined();
	expect(screen.getByRole("contentinfo")).toBeDefined();
});

test("the brand links to the first page", () => {
	render(<App path="/-/fixture" />);

	expect(
		screen
			.getByRole("link", { name: "dogmatiq observatory" })
			.getAttribute("href"),
	).toBe("/");
});

test("the title bar says which application the page is about, by its name and not its key", () => {
	render(<App path="/-/fixture" />);

	const bar = screen.getByRole("banner");
	expect(within(bar).getByText("statements")).toBeDefined();
	expect(bar.textContent).not.toContain("d0137119");
});

test("the title bar's color mode control changes the page's colors", () => {
	render(<App path="/-/fixture" />);

	fireEvent.click(
		screen.getByRole("button", { name: "Color mode: automatic" }),
	);

	expect(document.documentElement.getAttribute("data-theme")).toBe("light");
});

test("the first page lists the clusters, each linking to the application view of its application at its site", async () => {
	const clusters: ClusterSummary[] = [
		{
			id: "aaa",
			application: { name: "statements", key: "k1" },
			site: { name: "eu-west", key: "s/1" },
			reporting: true,
		},
		{ id: "bbb", application: { name: "billing", key: "k2" }, reporting: true },
	];
	const requests = serve(() => json(clusters));

	render(<App path="/" />);

	const link = await screen.findByRole("link", { name: "statements" });
	expect(link.getAttribute("href")).toBe("/-/site/s%2F1/app/k1");
	expect(
		screen.getByRole("link", { name: "billing" }).getAttribute("href"),
	).toBe(`/-/site/${noSite}/app/k2`);
	expect(requests).toEqual(["/-/api/clusters"]);
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

	render(<App path="/-/cluster/abc%2F1" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	expect(screen.getByText("Loading…")).toBeDefined();

	connect();

	expect(await screen.findByRole("region", { name: "Totals" })).toBeDefined();
	expect(screen.getByText("statements")).toBeDefined();
	expect(screen.getAllByRole("article")).toHaveLength(7);
	expect(requests).toEqual([]);
	expect(FakeEventSource.live[0]?.url).toBe("/-/api/clusters/abc%2F1/watch");
});

test("a cluster's page says that it is loading until it has data", () => {
	serve(() => new Promise<Response>(() => {}));

	render(<App path="/-/cluster/abc" />);

	expect(screen.getByText("Loading…")).toBeDefined();
	expect(screen.getByRole("banner")).toBeDefined();
});

test("a cluster that the Observatory doesn't know says so", async () => {
	serve(() => new Response("", { status: 404 }));

	render(<App path="/-/cluster/abc" />);

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

	render(<App path="/-/cluster/abc" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	act(() => FakeEventSource.live[0]?.fail(true));

	expect(
		await screen.findByRole("heading", { name: "This cluster can't be read" }),
	).toBeDefined();
});

test("a cluster's page keeps its data, and says so, while updates have stopped", async () => {
	serve(() => new Response("{}"));

	render(<App path="/-/cluster/abc" />);
	await waitFor(() => expect(FakeEventSource.live).toHaveLength(1));
	connect();
	await screen.findByRole("region", { name: "Totals" });
	expect(screen.getByRole("status").textContent).toBe("");

	act(() => FakeEventSource.live[0]?.fail());

	expect(screen.getByRole("region", { name: "Totals" })).toBeDefined();
	expect(screen.getByRole("status").textContent).toContain(
		"Updates have stopped",
	);

	connect();

	expect(screen.getByRole("status").textContent).toBe("");
});

test("a cluster's page shows each change that the stream sends", async () => {
	serve(() => new Response("{}"));

	render(<App path="/-/cluster/abc" />);
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

	render(<App path="/-/cluster/abc" />);
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
	render(<App path="/-/elsewhere" />);

	expect(
		screen.getByRole("heading", { name: "This page isn't here" }),
	).toBeDefined();
});

test("a part of the document that isn't well formed leaves out its tile, and not the others", async () => {
	serve(() => new Response("{}"));

	render(<App path="/-/cluster/abc" />);
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

/**
 * lookups makes the Observatory's API answer the lookups of installations and of
 * the clusters of an installation from what it is given, which a test may
 * change. It returns the requests that were made, as their paths.
 */
function lookups(known: {
	installations: Installation[];
	clusters: ClusterSummary[];
}) {
	return serve((path) => {
		const url = new URL(path, "http://observatory");
		const q = url.searchParams;
		const nil = (key: string | undefined) => key ?? noSite;

		if (url.pathname === "/-/api/clusters") {
			return json(
				known.clusters.filter(
					(c) =>
						nil(c.site?.key) === q.get("site") &&
						c.application.key === q.get("application"),
				),
			);
		}

		if (url.pathname === "/-/api/installations") {
			const matches = (name: string, value: string | undefined) =>
				!q.has(name) || q.get(name) === value;
			return json(
				known.installations.filter(
					(i) =>
						matches("site", nil(i.site?.key)) &&
						matches("application", i.application.key) &&
						(i.site !== undefined || !q.has("site-name")) &&
						matches("site-name", i.site?.name) &&
						matches("application-name", i.application.name),
				),
			);
		}

		return new Response("", { status: 404 });
	});
}

const euWest = { name: "eu-west", key: "s1" };
const statements = { name: "statements", key: "a1" };
const billing = { name: "billing", key: "a2" };

/** watching returns the paths of the streams that are open. */
function watching() {
	return FakeEventSource.live.map((s) => s.url);
}

test("the application view shows the one cluster that runs the application at the site", async () => {
	lookups({
		installations: [],
		clusters: [
			{ id: "c1", application: statements, site: euWest, reporting: true },
		],
	});

	render(<App path="/-/site/s1/app/a1" />);
	await waitFor(() => expect(watching()).toEqual(["/-/api/clusters/c1/watch"]));
	connect();

	expect(await screen.findByRole("region", { name: "Totals" })).toBeDefined();
});

test("the application view of an application at no site asks for the site with the nil UUID", async () => {
	const requests = lookups({
		installations: [],
		clusters: [{ id: "c1", application: statements, reporting: true }],
	});

	render(<App path={`/-/site/${noSite}/app/a1`} />);

	await waitFor(() => expect(watching()).toEqual(["/-/api/clusters/c1/watch"]));
	expect(requests[0]).toBe(`/-/api/clusters?site=${noSite}&application=a1`);
});

test("the application view moves on to the new run of an engine that restarts with a new ID", async () => {
	const known = {
		installations: [],
		clusters: [
			{ id: "run1", application: statements, site: euWest, reporting: true },
		],
	};
	lookups(known);

	render(<App path="/-/site/s1/app/a1" />);
	await waitFor(() =>
		expect(watching()).toEqual(["/-/api/clusters/run1/watch"]),
	);

	known.clusters = [
		{ id: "run2", application: statements, site: euWest, reporting: true },
	];

	await waitFor(
		() => expect(watching()).toEqual(["/-/api/clusters/run2/watch"]),
		{ timeout: 3000 },
	);
});

test("the application view lists the clusters when more than one runs the application at the site", async () => {
	lookups({
		installations: [],
		clusters: [
			{ id: "c1", application: statements, site: euWest, reporting: true },
			{ id: "c2", application: statements, site: euWest, reporting: false },
		],
	});

	render(<App path="/-/site/s1/app/a1" />);

	expect(
		(await screen.findByRole("link", { name: "c1" })).getAttribute("href"),
	).toBe("/-/cluster/c1");
	expect(screen.getByRole("link", { name: "c2" }).getAttribute("href")).toBe(
		"/-/cluster/c2",
	);
	expect(screen.getByText("no signal")).toBeDefined();
	expect(watching()).toEqual([]);
});

test("the application view of an application that isn't known at the site says so, and shows it once it is", async () => {
	const known: { installations: Installation[]; clusters: ClusterSummary[] } = {
		installations: [],
		clusters: [],
	};
	lookups(known);

	render(<App path="/-/site/s1/app/a1" />);

	expect(
		await screen.findByRole("heading", {
			name: "This application isn't known at this site",
		}),
	).toBeDefined();

	known.clusters = [
		{ id: "c1", application: statements, site: euWest, reporting: true },
	];

	await waitFor(
		() => expect(watching()).toEqual(["/-/api/clusters/c1/watch"]),
		{ timeout: 3000 },
	);
});

test("a site lists its applications, each linking to its application view", async () => {
	lookups({
		installations: [
			{ application: billing, site: euWest },
			{ application: statements, site: euWest },
			{ application: statements },
		],
		clusters: [],
	});

	render(<App path="/-/site/s1" />);

	expect(
		await screen.findByRole("heading", { name: "Applications at eu-west" }),
	).toBeDefined();
	expect(
		screen
			.getAllByRole("link", { name: /billing|statements/ })
			.map((l) => l.getAttribute("href")),
	).toEqual(["/-/site/s1/app/a2", "/-/site/s1/app/a1"]);
});

test("an application that runs at several sites lists them, each linking to its application view", async () => {
	lookups({
		installations: [
			{ application: statements },
			{ application: statements, site: euWest },
		],
		clusters: [],
	});

	render(<App path="/-/app/a1" />);

	expect(
		(await screen.findByRole("link", { name: "No site" })).getAttribute("href"),
	).toBe(`/-/site/${noSite}/app/a1`);
	expect(
		screen.getByRole("link", { name: "eu-west" }).getAttribute("href"),
	).toBe("/-/site/s1/app/a1");
});

test("an application that runs at one site shows that site's application view", async () => {
	lookups({
		installations: [{ application: statements }],
		clusters: [{ id: "c1", application: statements, reporting: true }],
	});

	render(<App path="/-/app/a1" />);

	await waitFor(() => expect(watching()).toEqual(["/-/api/clusters/c1/watch"]));
});

test("a name that only an application has shows that application", async () => {
	lookups({
		installations: [{ application: statements, site: euWest }],
		clusters: [
			{ id: "c1", application: statements, site: euWest, reporting: true },
		],
	});

	render(<App path="/statements" />);

	await waitFor(() => expect(watching()).toEqual(["/-/api/clusters/c1/watch"]));
});

test("a name that only a site has shows that site", async () => {
	lookups({
		installations: [{ application: statements, site: euWest }],
		clusters: [],
	});

	render(<App path="/eu-west" />);

	expect(
		await screen.findByRole("heading", { name: "Applications at eu-west" }),
	).toBeDefined();
});

test("a name that a site and an application share lists both, each linking to its permalink", async () => {
	const site = { name: "statements", key: "s2" };
	lookups({
		installations: [
			{ application: billing, site },
			{ application: statements, site: euWest },
		],
		clusters: [],
	});

	render(<App path="/statements" />);

	expect(
		await screen.findByRole("heading", {
			name: "More than one site or application is named statements",
		}),
	).toBeDefined();
	expect(
		screen
			.getAllByRole("link", { name: "statements" })
			.map((l) => l.getAttribute("href")),
	).toEqual(["/-/site/s2", "/-/app/a1"]);
});

test("a name that nothing has says so, and shows what has it once there is something", async () => {
	const known: { installations: Installation[]; clusters: ClusterSummary[] } = {
		installations: [],
		clusters: [],
	};
	lookups(known);

	render(<App path="/statements" />);

	expect(
		await screen.findByRole("heading", {
			name: "No site or application has this name",
		}),
	).toBeDefined();

	known.installations = [{ application: statements }];
	known.clusters = [{ id: "c1", application: statements, reporting: true }];

	await waitFor(
		() => expect(watching()).toEqual(["/-/api/clusters/c1/watch"]),
		{ timeout: 3000 },
	);
});

test("the names of a site and an application show the application view of the application at that site", async () => {
	const requests = lookups({
		installations: [
			{ application: statements, site: euWest },
			{ application: statements },
		],
		clusters: [
			{ id: "c1", application: statements, site: euWest, reporting: true },
		],
	});

	render(<App path="/eu-west/statements" />);

	await waitFor(() => expect(watching()).toEqual(["/-/api/clusters/c1/watch"]));
	expect(requests[0]).toBe(
		"/-/api/installations?site-name=eu-west&application-name=statements",
	);
});

test("the names of a site and an application that several have list them, each linking to its permalink", async () => {
	const other = { name: "statements", key: "a3" };
	lookups({
		installations: [
			{ application: statements, site: euWest },
			{ application: other, site: euWest },
		],
		clusters: [],
	});

	render(<App path="/eu-west/statements" />);

	const links = await screen.findAllByRole("link", {
		name: "statements at eu-west",
	});
	expect(links.map((l) => l.getAttribute("href"))).toEqual([
		"/-/site/s1/app/a1",
		"/-/site/s1/app/a3",
	]);
});

test("the old address of a cluster's page moves to its new one", async () => {
	const id = "113cbdc3-2f6a-4bd5-9c2e-1d0f4a8b7e65";
	serve(() => new Response("{}"));

	render(<App path={`/clusters/${id}`} />);

	await waitFor(() =>
		expect(watching()).toEqual([`/-/api/clusters/${id}/watch`]),
	);
	expect(window.location.pathname).toBe(`/-/cluster/${id}`);
});
