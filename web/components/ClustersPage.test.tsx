import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ClusterSummary } from "../model.ts";
import { stubBrowser } from "../test-support.ts";
import { ClustersPage } from "./ClustersPage.tsx";

beforeEach(() => {
	stubBrowser();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const application = { name: "statements", key: "k" };

test("it tells apart clusters of one application by their site, or else by the start of their ID", () => {
	const clusters: ClusterSummary[] = [
		{
			id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			application,
			site: "eu-west",
		},
		{ id: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb", application },
	];

	render(<ClustersPage clusters={clusters} />);

	const items = screen.getAllByRole("listitem").map((i) => i.textContent);
	expect(items).toEqual(["statements" + "eu-west", "statements" + "22222222"]);
});

test("it lists the clusters by the name of their application, whatever order it is given them in, and the same names by ID", () => {
	const named = (id: string, name: string): ClusterSummary => ({
		id,
		application: { name, key: "k" },
	});

	render(
		<ClustersPage
			clusters={[
				named("33333333-cccc-4ccc-8ccc-cccccccccccc", "statements"),
				named("11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Queues: 10"),
				named("22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "statements"),
				named("44444444-dddd-4ddd-8ddd-dddddddddddd", "Queues: 2"),
				named("55555555-eeee-4eee-8eee-eeeeeeeeeeee", "events"),
			]}
		/>,
	);

	const items = screen.getAllByRole("listitem").map((i) => i.textContent);
	expect(items).toEqual([
		"events" + "55555555",
		"Queues: 2" + "44444444",
		"Queues: 10" + "11111111",
		"statements" + "22222222",
		"statements" + "33333333",
	]);
});
