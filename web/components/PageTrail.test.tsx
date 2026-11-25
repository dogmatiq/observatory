import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { applicationAtSitePath, clusterPath, sitePath } from "../lib/route.ts";
import type { Software } from "../model.ts";
import { stubBrowser } from "../test-support.ts";
import { PageTrail, type Runner } from "./PageTrail.tsx";

beforeEach(stubBrowser);
afterEach(cleanup);

const site = { name: "eu-west", key: "3a7d9c21-0b4e-4f6a-8d15-6c2e9f0b7a43" };
const application = {
	name: "statements",
	key: "d0137119-2660-4bc2-ab4c-bc156e08521c",
};
const cluster: Runner = {
	kind: "cluster",
	id: "5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58",
};
const software: Software = {
	engineName: "runkit",
	engineVersions: { lowest: "0.3.1", highest: "0.3.1" },
	applicationVersion: "2026.11.3",
};

/** trail returns the links of the trail, by their text, and their addresses. */
function trail() {
	const nav = screen.getByRole("navigation", { name: "Where this page is" });
	return within(nav)
		.getAllByRole("link")
		.map((a) => [a.textContent, a.getAttribute("href")]);
}

/** hovercard points at the trail and returns its hovercard. */
async function hovercard() {
	fireEvent.pointerEnter(
		screen.getByRole("navigation", { name: "Where this page is" }),
	);
	return screen.findByRole("group");
}

test("on an application's page, the trail is the site and the application", () => {
	render(
		<PageTrail
			site={site}
			application={application}
			runner={cluster}
			software={software}
		/>,
	);

	expect(trail()).toEqual([
		["eu-west", sitePath(site.key)],
		["statements", applicationAtSitePath(site.key, application.key)],
	]);
});

test("on a cluster's own page, the trail ends with the cluster, by its engine's name and its ID", () => {
	render(
		<PageTrail
			site={site}
			application={application}
			runner={cluster}
			software={software}
			onClusterPage
		/>,
	);

	expect(trail().at(-1)).toEqual(["runkit 5f1e2a7c", clusterPath(cluster.id)]);
});

test("a cluster whose nodes give different engines is shown by its ID", () => {
	render(
		<PageTrail
			site={site}
			application={application}
			runner={cluster}
			software={{ applicationVersion: "2026.11.3" }}
			onClusterPage
		/>,
	);

	expect(trail().at(-1)?.[0]).toBe("cluster 5f1e2a7c");
});

test("an application at no site has no site step, in the trail or in its hovercard", async () => {
	render(
		<PageTrail
			site={undefined}
			application={application}
			runner={cluster}
			software={software}
		/>,
	);

	expect(trail()).toEqual([
		["statements", applicationAtSitePath(undefined, application.key)],
	]);
	const card = await hovercard();
	expect(within(card).queryByText("Site")).toBeNull();
	expect(
		within(card).queryByRole("button", { name: "Copy site key" }),
	).toBeNull();
});

test("the hovercard gives each step's key or ID to copy, and the versions", async () => {
	render(
		<PageTrail
			site={site}
			application={application}
			runner={cluster}
			software={software}
		/>,
	);

	const card = await hovercard();
	for (const what of ["site key", "application key", "cluster ID"]) {
		expect(
			within(card).getByRole("button", { name: `Copy ${what}` }),
		).toBeDefined();
	}
	expect(within(card).getByText("2026.11.3")).toBeDefined();
	expect(within(card).getByText("0.3.1")).toBeDefined();
});

test("while the nodes run different versions, the engine's is a range and the application's says so", async () => {
	render(
		<PageTrail
			site={site}
			application={application}
			runner={cluster}
			software={{
				engineName: "runkit",
				engineVersions: { lowest: "0.3.1", highest: "0.4.0" },
				applicationVersionsDiffer: true,
			}}
		/>,
	);

	const card = await hovercard();
	expect(within(card).getByText("0.3.1–0.4.0")).toBeDefined();
	expect(within(card).getByText("multiple versions")).toBeDefined();
});

test("a cluster whose nodes give different engines has no version in the hovercard", async () => {
	render(
		<PageTrail
			site={site}
			application={application}
			runner={cluster}
			software={{
				engineVersions: { lowest: "0.3.1", highest: "1.0.0" },
				applicationVersion: "2026.11.3",
			}}
		/>,
	);

	const card = await hovercard();
	expect(within(card).queryByText(/0\.3\.1/)).toBeNull();
	expect(
		within(card).getByRole("button", { name: "Copy cluster ID" }),
	).toBeDefined();
});

test("on a screen that is touched, a tap on the trail opens its hovercard rather than following a link", async () => {
	render(
		<PageTrail
			site={site}
			application={application}
			runner={cluster}
			software={software}
		/>,
	);

	const link = screen.getByRole("link", { name: "statements" });
	fireEvent.pointerDown(link, { pointerType: "touch" });
	const followed = fireEvent.click(link);

	expect(followed).toBe(false);
	expect(await screen.findByRole("group")).toBeDefined();
});
