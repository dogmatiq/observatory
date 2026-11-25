import { expect, test } from "vitest";
import {
	applicationAtSitePath,
	applicationPath,
	clusterPath,
	noSite,
	routeOf,
	sitePath,
} from "./route.ts";

const uuid = "113cbdc3-2f6a-4bd5-9c2e-1d0f4a8b7e65";

test.each([
	["/", { page: "clusters" }],
	["", { page: "clusters" }],
	["/-/site/s1", { page: "site", siteKey: "s1" }],
	["/-/site/s1/", { page: "site", siteKey: "s1" }],
	[
		"/-/site/s1/app/a1",
		{ page: "application-at-site", siteKey: "s1", applicationKey: "a1" },
	],
	[
		`/-/site/${noSite}/app/a1`,
		{ page: "application-at-site", siteKey: noSite, applicationKey: "a1" },
	],
	["/-/app/a1", { page: "application", applicationKey: "a1" }],
	["/-/cluster/abc-123", { page: "cluster", id: "abc-123" }],
	["/-/cluster/abc-123/", { page: "cluster", id: "abc-123" }],
	["/-/cluster/a%20b", { page: "cluster", id: "a b" }],
	["/-/fixture", { page: "fixture" }],
	["/-/review", { page: "review" }],
	["/-/review/x", { page: "not-found" }],
	["/-/fixture/x", { page: "not-found" }],
	["/-", { page: "not-found" }],
	["/-/", { page: "not-found" }],
	["/-/elsewhere", { page: "not-found" }],
	["/-/site", { page: "not-found" }],
	["/-/site/s1/app", { page: "not-found" }],
	["/-/site/s1/app/a1/x", { page: "not-found" }],
	["/-/site/s1/x/a1", { page: "not-found" }],
	["/-/app/a1/x", { page: "not-found" }],
	["/-/cluster/abc/handlers", { page: "not-found" }],
	["/-/api/clusters", { page: "not-found" }],
	["/statements", { page: "named", name: "statements" }],
	["/statements/", { page: "named", name: "statements" }],
	["/Queues%3A%20sizes", { page: "named", name: "Queues: sizes" }],
	["/a%2Fb", { page: "named", name: "a/b" }],
	["/review", { page: "named", name: "review" }],
	["/clusters", { page: "named", name: "clusters" }],
	[
		"/eu-west/statements",
		{
			page: "named-application-at-site",
			siteName: "eu-west",
			applicationName: "statements",
		},
	],
	["/eu-west/statements/x", { page: "not-found" }],
	["/%E0%A4%A", { page: "not-found" }],
	["/-/cluster/%E0%A4%A", { page: "not-found" }],
	[`/clusters/${uuid}`, { page: "moved", to: `/-/cluster/${uuid}` }],
	[
		"/clusters/abc",
		{
			page: "named-application-at-site",
			siteName: "clusters",
			applicationName: "abc",
		},
	],
])("the address %j is %j", (path, route) => {
	expect(routeOf(path)).toEqual(route);
});

test("the address of a cluster leads back to the cluster", () => {
	const id = "113cbdc3/a b?";

	expect(routeOf(clusterPath(id))).toEqual({ page: "cluster", id });
});

test("the address of a site leads back to the site", () => {
	expect(routeOf(sitePath("s/1"))).toEqual({ page: "site", siteKey: "s/1" });
});

test("the address of the applications at no site is the site with the nil UUID", () => {
	expect(sitePath(undefined)).toBe(`/-/site/${noSite}`);
});

test("the address of an application at a site leads back to it", () => {
	expect(routeOf(applicationAtSitePath("s/1", "a 1"))).toEqual({
		page: "application-at-site",
		siteKey: "s/1",
		applicationKey: "a 1",
	});
});

test("the address of an application at no site is at the site with the nil UUID", () => {
	expect(applicationAtSitePath(undefined, "a1")).toBe(
		`/-/site/${noSite}/app/a1`,
	);
});

test("the address of an application leads back to it", () => {
	expect(routeOf(applicationPath("a/1"))).toEqual({
		page: "application",
		applicationKey: "a/1",
	});
});
