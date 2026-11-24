/**
 * Route is a page of the Observatory, as the address of the page says.
 *
 * A key or an ID is a UUID, and a name is the name of a site's or an
 * application's identity.
 */
export type Route =
	| { page: "clusters" }
	| { page: "site"; siteKey: string }
	| { page: "application-at-site"; siteKey: string; applicationKey: string }
	| { page: "application"; applicationKey: string }
	| { page: "cluster"; id: string }
	| { page: "named"; name: string }
	| {
			page: "named-application-at-site";
			siteName: string;
			applicationName: string;
	  }
	| { page: "moved"; to: string }
	| { page: "fixture" }
	| { page: "review" }
	| { page: "vitals" }
	| { page: "not-found" };

/**
 * noSite is the site key in the address of an application that runs at no site.
 * It is the nil UUID, which Dogma doesn't allow as a key, so no site has it.
 */
export const noSite = "00000000-0000-0000-0000-000000000000";

/**
 * routeOf returns the page that a path is the address of. A path may end in a
 * slash, and each part of it between slashes is percent-decoded.
 *
 * The Observatory's own addresses begin with `/-/`, because no name can be `-`,
 * and the other addresses are names. The addresses are:
 *
 * - `/`, the list of the clusters;
 * - `/-/site/{site key}`, a site, with the applications at it;
 * - `/-/site/{site key}/app/{application key}`, the application at that site,
 *   which is the application view. An application that runs at no site is at
 *   the site whose key is {@link noSite};
 * - `/-/app/{application key}`, the application at every site that it runs at;
 * - `/-/cluster/{id}`, one cluster;
 * - `/{name}`, the site or the application with that name;
 * - `/{site name}/{application name}`, the application with that name at the
 *   site with that name;
 * - `/clusters/{id}`, where the page of a cluster used to be, which has moved to
 *   `/-/cluster/{id}`. It is only for an ID that is a UUID, because the address
 *   of a site named "clusters" has the same form;
 * - `/-/fixture`, the cluster view with the numbers that the prototype's
 *   overview showed, which a person compares with the prototype;
 * - `/-/review`, the tiles that are under review, each whole and then part by
 *   part, in every state, which a person looks at when reviewing them;
 * - `/-/vitals`, the words of the popovers of the vital statistics of the tiles,
 *   in each combination, which a person reads in one go.
 */
export function routeOf(path: string): Route {
	let parts: string[];
	try {
		parts = path
			.split("/")
			.filter((part) => part !== "")
			.map(decodeURIComponent);
	} catch {
		// The address is not valid, so it is the address of nothing.
		return { page: "not-found" };
	}

	const [first, ...rest] = parts;

	if (first === undefined) {
		return { page: "clusters" };
	}

	if (first === "-") {
		return ownRouteOf(rest);
	}

	const [second, ...others] = rest;

	if (second === undefined) {
		return { page: "named", name: first };
	}

	if (others.length > 0) {
		return { page: "not-found" };
	}

	if (first === "clusters" && isUUID(second)) {
		return { page: "moved", to: clusterPath(second) };
	}

	return {
		page: "named-application-at-site",
		siteName: first,
		applicationName: second,
	};
}

/**
 * ownRouteOf returns the page that the parts of a path after `/-/` are the
 * address of.
 */
function ownRouteOf(parts: string[]): Route {
	const [kind, key, nested, nestedKey, ...rest] = parts;

	if (key === undefined) {
		return pageRouteOf(kind);
	}

	if (nested === undefined) {
		switch (kind) {
			case "site":
				return { page: "site", siteKey: key };
			case "app":
				return { page: "application", applicationKey: key };
			case "cluster":
				return { page: "cluster", id: key };
		}
	}

	if (
		kind === "site" &&
		nested === "app" &&
		nestedKey !== undefined &&
		rest.length === 0
	) {
		return {
			page: "application-at-site",
			siteKey: key,
			applicationKey: nestedKey,
		};
	}

	return { page: "not-found" };
}

/**
 * pageRouteOf returns the page that the one part of a path after `/-/` is the
 * address of.
 */
function pageRouteOf(name: string | undefined): Route {
	if (name === "fixture") {
		return { page: "fixture" };
	}

	if (name === "review") {
		return { page: "review" };
	}

	if (name === "vitals") {
		return { page: "vitals" };
	}

	return { page: "not-found" };
}

/** isUUID returns true if the text is a UUID in its usual form. */
function isUUID(text: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		text,
	);
}

/**
 * clusterPath returns the address of the view of the cluster with the given ID.
 */
export function clusterPath(id: string): string {
	return `/-/cluster/${encodeURIComponent(id)}`;
}

/**
 * sitePath returns the address of the site with the given key, or, if the key
 * is undefined, of the applications that run at no site.
 */
export function sitePath(siteKey: string | undefined): string {
	return `/-/site/${encodeURIComponent(siteKey ?? noSite)}`;
}

/**
 * applicationAtSitePath returns the address of the application view of the
 * application with the given key at the site with the given key, or at no site
 * if the site's key is undefined.
 */
export function applicationAtSitePath(
	siteKey: string | undefined,
	applicationKey: string,
): string {
	return `${sitePath(siteKey)}/app/${encodeURIComponent(applicationKey)}`;
}

/**
 * applicationPath returns the address of the application with the given key, at
 * every site that it runs at.
 */
export function applicationPath(applicationKey: string): string {
	return `/-/app/${encodeURIComponent(applicationKey)}`;
}
