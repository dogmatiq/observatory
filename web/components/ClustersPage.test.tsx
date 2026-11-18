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
