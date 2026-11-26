/**
 * The heartbeats of a node, as {@link LiveNode} gives them: when they arrived,
 * in milliseconds before the data arrived, oldest first; the time by which the
 * next is due, in milliseconds after the data arrived; and how long the node's
 * engine aims to wait between two heartbeats.
 *
 * [LiveNode]: ../model.ts
 */
interface Beats {
	heartbeats: readonly number[];
	deadline?: number;
	interval?: number;
}

/**
 * latenessOf returns how late a node's next heartbeat is, at `elapsed`
 * milliseconds after the data arrived, as a share of the time between when it
 * was due and when the latest heartbeat expires: just above 0 when it has only
 * just become late, and towards 1 as the heartbeat nears its expiry.
 *
 * The next heartbeat is due once the interval that the node's engine gives has
 * passed since the latest heartbeat arrived. It returns undefined while the
 * next heartbeat isn't late, once the latest heartbeat has expired, and for a
 * node that has no heartbeats or doesn't give both an interval and a deadline.
 */
export function latenessOf(
	{ heartbeats, deadline, interval }: Beats,
	elapsed: number,
): number | undefined {
	const ago = heartbeats.at(-1);
	if (ago === undefined || deadline === undefined || interval === undefined) {
		return undefined;
	}

	const since = ago + elapsed;
	const expiry = ago + deadline;
	if (since <= interval || since >= expiry || expiry <= interval) {
		return undefined;
	}

	return (since - interval) / (expiry - interval);
}

/**
 * heartbeatAge says when a node's latest heartbeat arrived, at `elapsed`
 * milliseconds after the data arrived: "heartbeat just now" within 1.5 seconds,
 * "heartbeat 4 s ago" after that, or "heartbeat 3 s late" once the next is late,
 * by at least a second. It returns undefined for a node that has no heartbeats.
 */
export function heartbeatAge(
	{ heartbeats, deadline, interval }: Beats,
	elapsed: number,
): string | undefined {
	const ago = heartbeats.at(-1);
	if (ago === undefined) {
		return undefined;
	}

	const since = ago + elapsed;
	if (latenessOf({ heartbeats, deadline, interval }, elapsed) !== undefined) {
		const late = since - (interval as number);
		return `heartbeat ${Math.max(1, Math.round(late / 1000))} s late`;
	}

	return since < 1500
		? "heartbeat just now"
		: `heartbeat ${Math.round(since / 1000)} s ago`;
}
