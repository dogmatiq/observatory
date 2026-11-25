/**
 * How long a level takes to rise after a heartbeat, in milliseconds, so that it
 * rises instead of jumping.
 */
export const riseTime = 280;

/**
 * The number of a node's usual intervals between heartbeats over which its
 * level drains to empty. A level empties when the node has missed about this
 * many heartbeats.
 */
export const drainBeats = 3;

/**
 * The most recent heartbeats that are used to find a node's usual interval.
 */
const recentBeats = 9;

/**
 * usualInterval returns the median time between the given times, or 0 if there
 * are fewer than two.
 */
function usualInterval(times: readonly number[]): number {
	const intervals: number[] = [];
	for (let i = 1; i < times.length; i++) {
		intervals.push((times[i] as number) - (times[i - 1] as number));
	}

	if (intervals.length === 0) {
		return 0;
	}

	intervals.sort((a, b) => a - b);
	return intervals[Math.floor(intervals.length / 2)] as number;
}

/**
 * levelAfter returns a level at the time `now`, given the times of the node's
 * recent heartbeats, and the level that the node had just before the latest of
 * them.
 */
function levelAfter(
	times: readonly number[],
	from: number,
	now: number,
): number {
	const last = times[times.length - 1];
	if (last === undefined) {
		return 0;
	}

	const since = now - last;
	if (since < riseTime) {
		return from + (1 - from) * (since / riseTime);
	}

	const interval = usualInterval(times);
	if (interval === 0) {
		return 1;
	}

	return Math.max(0, 1 - (since - riseTime) / (drainBeats * interval));
}

/**
 * heartbeatLevel returns the level of a node's heartbeat at the time `now`,
 * from 0 when it is empty to 1 when it is full, given the times at which the
 * node's heartbeats arrived, oldest first. The times and `now` are in
 * milliseconds on the same scale, whatever its origin.
 *
 * A heartbeat raises the level to full, over {@link riseTime}, and the level
 * then drains until the next one. A node can send heartbeats at its own
 * interval, which the page can't see, so the usual interval is the median time
 * between the node's recent heartbeats. The level drains to empty over
 * {@link drainBeats} of them. Until two heartbeats have arrived the level
 * stays full, and a node with none is empty.
 */
export function heartbeatLevel(times: readonly number[], now: number): number {
	let recent: number[] = [];
	let from = 0;

	for (const t of times) {
		from = levelAfter(recent, from, t);
		recent = [...recent, t].slice(-recentBeats);
	}

	return levelAfter(recent, from, now);
}

/**
 * deadlineLevel returns the level of a heartbeat at the time `now`, from 0 when
 * it is empty to 1 when it is full, given the times at which the heartbeats
 * arrived, oldest first, and the deadline of the latest of them, which is the
 * time by which the next one is due. The times, the deadline and `now` are in
 * milliseconds on the same scale, whatever its origin.
 *
 * A heartbeat raises the level to full, over {@link riseTime}, and the level
 * then drains, in a straight line, to empty at the deadline, so that it is
 * empty exactly when the heartbeat expires. The level just before a heartbeat
 * is worked out as if the heartbeat before it gave a deadline the same length of
 * time after it arrived. With no heartbeat, the level is empty.
 */
export function deadlineLevel(
	times: readonly number[],
	deadline: number,
	now: number,
): number {
	const last = times[times.length - 1];
	if (last === undefined) {
		return 0;
	}

	const span = deadline - last;
	const drain = (from: number, at: number) =>
		span <= riseTime
			? 0
			: Math.max(0, Math.min(1, (from + span - at) / (span - riseTime)));

	const since = now - last;
	if (since < riseTime) {
		const before = times[times.length - 2];
		const from = before === undefined ? 0 : drain(before, last);
		return from + (1 - from) * (since / riseTime);
	}

	return drain(last, now);
}

/**
 * levelOf returns the level, at `elapsed` milliseconds after the data arrived,
 * of the heartbeats that the data describes, with their times in milliseconds
 * before it arrived, and their deadline in milliseconds after. With a deadline,
 * the level drains to empty at the deadline, by {@link deadlineLevel}; without
 * one, it drains over the heartbeats' usual interval, by
 * {@link heartbeatLevel}.
 */
export function levelOf(
	{
		heartbeats,
		deadline,
	}: { heartbeats: readonly number[]; deadline?: number },
	elapsed: number,
): number {
	const times = heartbeats.map((ago) => -ago);
	return deadline === undefined
		? heartbeatLevel(times, elapsed)
		: deadlineLevel(times, deadline, elapsed);
}
