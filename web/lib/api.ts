import type { ClusterSummary } from "../model.ts";

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
 * fetchClusters returns the clusters that the Observatory knows.
 */
export function fetchClusters(signal: AbortSignal): Promise<ClusterSummary[]> {
	return getJSON("/api/clusters", signal);
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
	const response = await fetch(`/api/clusters/${encodeURIComponent(id)}`, {
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
	return `/api/clusters/${encodeURIComponent(id)}/watch`;
}
