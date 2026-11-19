import { expect, test } from "vitest";
import { clusterPath, routeOf } from "./route.ts";

test.each([
	["/", { page: "clusters" }],
	["", { page: "clusters" }],
	["/clusters/abc-123", { page: "cluster", id: "abc-123" }],
	["/clusters/abc-123/", { page: "cluster", id: "abc-123" }],
	["/clusters/a%20b", { page: "cluster", id: "a b" }],
	["/fixture", { page: "fixture" }],
	["/states", { page: "states" }],
	["/states/x", { page: "not-found" }],
	["/clusters", { page: "not-found" }],
	["/clusters/abc/handlers", { page: "not-found" }],
	["/clusters/%E0%A4%A", { page: "not-found" }],
	["/fixture/x", { page: "not-found" }],
	["/elsewhere", { page: "not-found" }],
])("the address %j is %j", (path, route) => {
	expect(routeOf(path)).toEqual(route);
});

test("the address of a cluster leads back to the cluster", () => {
	const id = "113cbdc3/a b?";

	expect(routeOf(clusterPath(id))).toEqual({ page: "cluster", id });
});
