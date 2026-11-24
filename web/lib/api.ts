import type { ClusterSummary, Installation } from "../model.ts";
import { noSite } from "./route.ts";

/**
 * NotFound is the failure to read a cluster that the Observatory doesn't know,
 * which it may once have known.
 */
export class NotFound extends Error {
	constructor() {
		super("the Observatory doesn't know the cluster");
		this.name = "NotFound";
	}
}

/**
 * getJSON reads the JSON that the Observatory serves at a path.
 */
async function getJSON<T>(path: string, signal: AbortSignal): Promise<T> {
	const response = await fetch(path, {
		signal,
		headers: { Accept: "application/json" },
	});

	if (response.status === 404) {
		throw new NotFound();
	}

	if (!response.ok) {
		throw new Error(`the Observatory answered ${response.status}`);
	}

	return (await response.json()) as T;
}

/**
 * fetchClusters returns the clusters that the Observatory sees each installation
 * through.
 */
export function fetchClusters(signal: AbortSignal): Promise<ClusterSummary[]> {
	return getJSON("/-/api/clusters", signal);
}

/**
 * fetchClustersOf returns the clusters that the Observatory sees the
 * installation of the application with the given key through, at the site with
 * the given key, or at no site if the site's key is undefined. They are empty if
 * the Observatory doesn't know the installation.
 */
export function fetchClustersOf(
	siteKey: string | undefined,
	applicationKey: string,
	signal: AbortSignal,
): Promise<ClusterSummary[]> {
	const query = new URLSearchParams({
		site: siteKey ?? noSite,
		application: applicationKey,
	});
	return getJSON(`/-/api/clusters?${query}`, signal);
}

/**
 * InstallationFilter is what the installations that {@link fetchInstallations}
 * returns have. Each key is a UUID, and each name must be the same, byte for
 * byte. The site's key is {@link noSite} for the installations with no site.
 */
export interface InstallationFilter {
	siteKey?: string;
	applicationKey?: string;
	siteName?: string;
	applicationName?: string;
}

/**
 * fetchInstallations returns the installations that the Observatory knows and
 * that match the filter, sorted by the name of the application, then its key,
 * then the name of the site, with no site first, then its key.
 */
export function fetchInstallations(
	filter: InstallationFilter,
	signal: AbortSignal,
): Promise<Installation[]> {
	const query = new URLSearchParams();
	if (filter.siteKey !== undefined) {
		query.set("site", filter.siteKey);
	}
	if (filter.applicationKey !== undefined) {
		query.set("application", filter.applicationKey);
	}
	if (filter.siteName !== undefined) {
		query.set("site-name", filter.siteName);
	}
	if (filter.applicationName !== undefined) {
		query.set("application-name", filter.applicationName);
	}
	return getJSON(`/-/api/installations?${query}`, signal);
}

/**
 * checkCluster finds out whether the Observatory knows the cluster with the
 * given ID. It fails with {@link NotFound} if it doesn't.
 *
 * What the Observatory answers with is not used, because the stream of the
 * cluster tells the page everything that it shows.
 */
export async function checkCluster(
	id: string,
	signal: AbortSignal,
): Promise<void> {
	// Only the status matters, so the Observatory is asked for no body.
	const response = await fetch(`/-/api/clusters/${encodeURIComponent(id)}`, {
		method: "HEAD",
		signal,
	});

	if (response.status === 404) {
		throw new NotFound();
	}

	if (!response.ok) {
		throw new Error(`the Observatory answered ${response.status}`);
	}
}

/**
 * watchPath returns the path of the stream of events that tells of each change
 * to the cluster view of the cluster with the given ID.
 */
export function watchPath(id: string): string {
	return `/-/api/clusters/${encodeURIComponent(id)}/watch`;
}
