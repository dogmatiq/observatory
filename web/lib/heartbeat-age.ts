/**
 * heartbeatAge says when a node's latest heartbeat arrived, at `elapsed`
 * milliseconds after the data arrived, given the times that its heartbeats
 * arrived, in milliseconds before the data arrived, oldest first: "just now"
 * within 1.5 seconds, and "4 s ago" after that. It returns undefined for a node
 * that has no heartbeats.
 */
export function heartbeatAge(
	{ heartbeats }: { heartbeats: readonly number[] },
	elapsed: number,
): string | undefined {
	const ago = heartbeats.at(-1);
	if (ago === undefined) {
		return undefined;
	}

	const since = ago + elapsed;
	return since < 1500 ? "just now" : `${Math.round(since / 1000)} s ago`;
}
