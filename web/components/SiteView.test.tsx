import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	euWest,
	siteApplications,
	siteOf,
	withContact,
} from "../fixtures/site.ts";
import { applicationAtSitePath } from "../lib/route.ts";
import { stubBrowser, tipOf } from "../test-support.ts";
import { SiteBreakdown, SiteOverview } from "./SiteView.tsx";

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

test("an application that is out of contact says so by an icon beside its name, and its figures are not available", () => {
	const name = apps[1]?.application.name as string;
	render(
		<SiteOverview data={siteOf(withContact(apps, { out: [name] }), euWest)} />,
	);

	const grid = screen.getByRole("region", { name: "Applications" });
	const link = within(grid).getByRole("link", { name: new RegExp(`^${name}`) });

	expect(link.textContent).toMatch(new RegExp(`^${name}Contact lost`));
	expect(
		within(link).getAllByRole("img", { name: "not available" }).length,
	).toBeGreaterThan(0);
});

test("the applications tile counts those in contact, with those out of contact set apart", () => {
	const names = apps.slice(0, 1).map((a) => a.application.name);
	render(
		<SiteOverview data={siteOf(withContact(apps, { out: names }), euWest)} />,
	);

	const tile = screen.getByRole("article", { name: "Applications" });

	expect(tile.textContent).toMatch(/^3\+1 and 1 application out of contact/);
	expect(tile.textContent).toMatch(/out of contactapplications$/);
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

test("the alert icon of an application out of contact says what losing contact means", async () => {
	const name = apps[1]?.application.name as string;
	render(
		<SiteOverview data={siteOf(withContact(apps, { out: [name] }), euWest)} />,
	);

	const icon = screen.getByText("Contact lost").parentElement as HTMLElement;

	expect(await tipOf(icon)).toContain(
		"The application is out of contact, so it's unknown whether it is working.",
	);
});

test("the applications tile is a red zero alone when every application is out of contact", () => {
	const names = apps.map((a) => a.application.name);
	render(
		<SiteOverview data={siteOf(withContact(apps, { out: names }), euWest)} />,
	);

	const tile = screen.getByRole("article", { name: "Applications" });

	expect(tile.textContent).toMatch(/^0applications$/);
});

test("the events tile counts the event streams of all the applications together", () => {
	const data = siteOf(apps, euWest);
	render(<SiteOverview data={data} />);

	const tile = screen.getByRole("article", { name: "Events" });

	expect(tile.textContent).toContain(
		`events per minute, in ${data.events?.streams} streams`,
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
