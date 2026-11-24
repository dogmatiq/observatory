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

test("the applications tile counts those in contact, and those out of contact", () => {
	const names = apps.slice(0, 2).map((a) => a.application.name);
	const { container } = render(
		<SiteOverview data={siteOf(withContact(apps, { out: names }), euWest)} />,
	);

	expect(container.textContent).toContain(
		"applications in contact, 2 out of contact",
	);
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
		"Contact with the application has been lost, so it's unknown whether the application is working.",
	);
});
