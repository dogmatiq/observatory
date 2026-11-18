/**
 * Route is a page of the Observatory, as the address of the page says.
 */
export type Route =
	| { page: "clusters" }
	| { page: "cluster"; id: string }
	| { page: "fixture" }
	| { page: "not-found" };

/**
 * routeOf returns the page that a path is the address of. A path may end in a
 * slash.
 *
 * The addresses are:
 *
 * - `/`, the list of the clusters;
 * - `/clusters/{id}`, the view of one cluster;
 * - `/fixture`, the cluster view with the numbers that the prototype's overview
 *   showed, which a person compares with the prototype.
 */
export function routeOf(path: string): Route {
	const parts = path.split("/").filter((part) => part !== "");

	if (parts.length === 0) {
		return { page: "clusters" };
	}

	const [first, id] = parts;

	if (first === "clusters" && id !== undefined && parts.length === 2) {
		try {
			return { page: "cluster", id: decodeURIComponent(id) };
		} catch {
			// The address is not valid, so it is not the address of a cluster.
			return { page: "not-found" };
		}
	}

	if (first === "fixture" && parts.length === 1) {
		return { page: "fixture" };
	}

	return { page: "not-found" };
}

/**
 * clusterPath returns the address of the view of the cluster with the given ID.
 */
export function clusterPath(id: string): string {
	return `/clusters/${encodeURIComponent(id)}`;
}
