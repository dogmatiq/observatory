import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	euWest,
	siteApplications,
	siteOf,
	withSignal,
} from "../fixtures/site.ts";
import { formatCompact } from "../lib/format.ts";
import { applicationAtSitePath } from "../lib/route.ts";
import { stubBrowser, tipOf } from "../test-support.ts";
import { noSignalText, SiteBreakdown, SiteOverview } from "./SiteView.tsx";
import {
	noSignalFromApplications,
	someApplicationNodesReport,
} from "./statuses.ts";

beforeEach(stubBrowser);
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const apps = siteApplications.slice(0, 4);

test("each application is in the order given, and links to its application view", () => {
	const data = siteOf(apps, euWest);
	render(<SiteOverview data={data} />);

	const grid = screen.getByRole("region", { name: "Applications" });
	const links = within(grid).getAllByRole("link");

	links.forEach((link, i) => {
		expect(link.textContent).toMatch(
			new RegExp(`^${apps[i]?.application.name}`),
		);
	});
	expect(links.map((l) => l.getAttribute("href"))).toEqual(
		apps.map((a) => applicationAtSitePath(data.site?.key, a.application.key)),
	);
});

test("an application with no signal says so by an icon beside its name, and its figures are not available", () => {
	const name = apps[1]?.application.name as string;
	render(
		<SiteOverview data={siteOf(withSignal(apps, { out: [name] }), euWest)} />,
	);

	const grid = screen.getByRole("region", { name: "Applications" });
	const digest = within(grid).getByRole("article", { name });

	expect(within(digest).getByText(noSignalText)).toBeDefined();
	expect(
		within(digest).getAllByRole("img", { name: "not available" }).length,
	).toBeGreaterThan(0);
});

test("the applications tile counts those sending a signal, with those that send none set apart", () => {
	const names = apps.slice(0, 1).map((a) => a.application.name);
	render(
		<SiteOverview data={siteOf(withSignal(apps, { out: names }), euWest)} />,
	);

	const tile = screen.getByRole("article", { name: "Applications" });

	expect(tile.textContent).toMatch(/^3\+1 and 1 application with no signal/);
	expect(tile.textContent).toMatch(/with no signalapplications$/);
});

test("the applications at no site link to the site whose key is the nil UUID", () => {
	const data = siteOf(apps, undefined);
	render(<SiteOverview data={data} />);

	const grid = screen.getByRole("region", { name: "Applications" });
	const href = within(grid).getAllByRole("link")[0]?.getAttribute("href");

	expect(href).toMatch(
		/^\/-\/site\/00000000-0000-0000-0000-000000000000\/app\//,
	);
});

test("each square names its application to assistive technology", () => {
	render(<SiteBreakdown data={siteOf(apps, euWest)} breakdown="squares" />);

	const grid = screen.getByRole("region", { name: "Applications" });

	expect(
		within(grid)
			.getAllByRole("link")
			.map((l) => l.textContent),
	).toEqual(apps.map((a) => a.application.name));
});

test("the alert icon of an application with no signal says what that means", async () => {
	const name = apps[1]?.application.name as string;
	render(
		<SiteOverview data={siteOf(withSignal(apps, { out: [name] }), euWest)} />,
	);

	const icon = screen.getByText(noSignalText).parentElement as HTMLElement;

	expect(await tipOf(icon)).toContain(
		"There is no signal from the application, so it's unknown whether it is working.",
	);
});

test("the applications tile is a red zero alone when no applications are sending a signal", () => {
	const names = apps.map((a) => a.application.name);
	render(
		<SiteOverview data={siteOf(withSignal(apps, { out: names }), euWest)} />,
	);

	const tile = screen.getByRole("article", { name: "Applications" });

	expect(tile.textContent).toBe(
		`0${noSignalFromApplications.text}applications`,
	);
});

test("the events tile counts the events and event streams of all the applications together", () => {
	const data = siteOf(apps, euWest);
	render(<SiteOverview data={data} />);

	const tile = screen.getByRole("article", { name: "Events" });

	expect(tile.textContent).toContain(
		`events per minute, ${formatCompact(data.events?.streams?.events ?? 0)} events on ${data.events?.streams?.count} streams`,
	);
});

test("the queues tile counts the queues of all the applications together", () => {
	const data = siteOf(apps, euWest);
	render(<SiteOverview data={data} />);

	const tile = screen.getByRole("article", { name: "Queues" });

	expect(tile.textContent).toMatch(
		new RegExp(`messages in ${data.queues?.queues} queues, `),
	);
});

test("a compact digest's flag says that its rate isn't known yet, while it isn't", async () => {
	const app = siteApplications[0] as (typeof siteApplications)[number];
	render(
		<SiteBreakdown
			data={siteOf([{ ...app, events: { perMinute: undefined } }], euWest)}
			breakdown="compact-digests"
		/>,
	);

	const digest = screen.getByRole("article", { name: app.application.name });
	const flag = within(digest).getByText(/samples/).parentElement as HTMLElement;

	expect(flag.className).toContain("text-fg-soft");
	expect(await tipOf(flag)).toMatch(/samples/);
});

test("a compact digest has no flag while its rate is known and its application sends a signal", () => {
	const app = siteApplications[0] as (typeof siteApplications)[number];
	render(
		<SiteBreakdown data={siteOf([app], euWest)} breakdown="compact-digests" />,
	);

	const digest = screen.getByRole("article", { name: app.application.name });
	expect(within(digest).queryByText(/samples|signal/)).toBeNull();
});

test("a compact digest whose figures only some of its application's nodes report says so by its flag", async () => {
	const app = siteApplications[0] as (typeof siteApplications)[number];
	render(
		<SiteBreakdown
			data={siteOf([{ ...app, coverage: 0.5 }], euWest)}
			breakdown="compact-digests"
		/>,
	);

	const digest = screen.getByRole("article", { name: app.application.name });
	const flag = within(digest).getByText(someApplicationNodesReport.text)
		.parentElement as HTMLElement;

	expect(await tipOf(flag)).toContain(someApplicationNodesReport.text);
});

test("a compact digest's rate that waits only on a node being measured stays as it was, with no flag", () => {
	const app = siteApplications[0] as (typeof siteApplications)[number];
	const withRate = (events: { perMinute?: number; measuring?: boolean }) => (
		<SiteBreakdown
			data={siteOf([{ ...app, events }], euWest)}
			breakdown="compact-digests"
		/>
	);
	const { rerender } = render(withRate({ perMinute: 330 }));
	const digest = () =>
		screen.getByRole("article", { name: app.application.name });

	rerender(withRate({ measuring: true }));

	expect(digest().textContent).toContain("330/min");
	expect(within(digest()).queryByText(/samples/)).toBeNull();
	expect(digest().querySelector(".glitch")).toBeNull();
});

test("the site's events tile holds its rate while a node is being measured", () => {
	const data = siteOf(apps, euWest);
	const withRate = (rate: { perMinute?: number; measuring?: boolean }) => (
		<SiteOverview
			data={{
				...data,
				events: { ...(data.events as NonNullable<typeof data.events>), rate },
			}}
		/>
	);
	const { rerender } = render(withRate({ perMinute: 330 }));
	const tile = () => screen.getByRole("article", { name: "Events" });

	rerender(withRate({ measuring: true }));

	expect(tile().textContent).toMatch(/^330events per minute/);
	expect(tile().querySelector(".glitch")).toBeNull();
});

test("the events tile of applications whose engines don't report the rate counts the events on their streams, as a cluster's does", () => {
	const data = siteOf(apps, euWest);
	const events = data.events as NonNullable<typeof data.events>;
	render(
		<SiteOverview
			data={{
				...data,
				events: { ...events, rate: undefined, history: undefined },
			}}
		/>,
	);

	const tile = screen.getByRole("article", { name: "Events" });

	expect(tile.textContent).toBe(
		`${formatCompact(events.streams?.events ?? 0)}events on ${events.streams?.count} streams`,
	);
});
