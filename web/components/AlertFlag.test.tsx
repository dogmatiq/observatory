import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { application, overview } from "../fixtures/overview.ts";
import { euWest, siteApplications, siteOf } from "../fixtures/site.ts";
import type { HandlerData, SiteData } from "../model.ts";
import { stubBrowser, tipOf } from "../test-support.ts";
import { AlertFlag } from "./AlertFlag.tsx";
import { HandlerDigest } from "./HandlerDigest.tsx";
import { Overview } from "./Overview.tsx";
import { SiteEventsTile } from "./SiteView.tsx";
import {
	noSignalFromNodes,
	rateLost,
	someApplicationsReport,
	someNodesReport,
} from "./statuses.ts";

beforeEach(stubBrowser);
afterEach(cleanup);

/** flagOf returns the alert flag that says the given status. */
function flagOf(text: string): HTMLElement {
	return screen.getByText(text).parentElement as HTMLElement;
}

test("there is no flag while no status applies", () => {
	const { container } = render(<AlertFlag statuses={[]} />);

	expect(container.textContent).toBe("");
});

test("a flag of a status that qualifies the figures is grey, and its tooltip says the status", async () => {
	render(<AlertFlag statuses={[someNodesReport]} />);

	const flag = flagOf(someNodesReport.text);
	expect(flag.className).toContain("text-fg-soft");
	expect(await tipOf(flag)).toBe(someNodesReport.text);
});

test("a flag of two statuses is red if either says that something is wrong, and its tooltip says both", async () => {
	render(<AlertFlag statuses={[rateLost, noSignalFromNodes]} />);

	const flag = flagOf(`${rateLost.text} ${noSignalFromNodes.text}`);
	expect(flag.className).toContain("text-bad");
	expect(await tipOf(flag)).toBe(`${rateLost.text}${noSignalFromNodes.text}`);
});

test("the events tile has a flag only while only some nodes report it", () => {
	const { rerender } = render(
		<Overview application={application} data={overview} />,
	);
	expect(screen.queryByText(someNodesReport.text)).toBeNull();

	rerender(
		<Overview
			application={application}
			data={{ ...overview, events: { ...overview.events, coverage: 0.5 } }}
		/>,
	);
	expect(flagOf(someNodesReport.text).className).toContain("text-fg-soft");
});

test("the cluster tile has a red flag while no nodes are sending a signal", () => {
	render(
		<Overview
			application={application}
			data={{ ...overview, cluster: { nodes: [] } }}
		/>,
	);

	expect(flagOf(noSignalFromNodes.text).className).toContain("text-bad");
});

test("a handler digest has a flag only while only some nodes report it", () => {
	const handler = overview.handlers[0] as HandlerData;
	const { rerender } = render(<HandlerDigest handler={handler} />);
	expect(screen.queryByText(someNodesReport.text)).toBeNull();

	rerender(<HandlerDigest handler={{ ...handler, coverage: 0.5 }} />);
	expect(flagOf(someNodesReport.text).className).toContain("text-fg-soft");
});

test("the site's events tile has a flag while only some applications report it", () => {
	const site = siteOf(siteApplications.slice(0, 4), euWest);
	const events = site.events as NonNullable<SiteData["events"]>;
	render(<SiteEventsTile data={site} events={{ ...events, coverage: 0.5 }} />);

	expect(flagOf(someApplicationsReport.text).className).toContain(
		"text-fg-soft",
	);
});
