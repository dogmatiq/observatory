/**
 * How long a level takes to rise after a heartbeat, in milliseconds, so that it
 * rises instead of jumping.
 */
export const riseTime = 280;

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
 * before it arrived, and the deadline of the latest in milliseconds after: the
 * time by which the next is due, which is when the node stops sending a signal.
 * The level drains to empty at the deadline, by {@link deadlineLevel}. Heartbeats
 * that give no way to calculate a deadline keep the level full, as the node is
 * sending a signal for as long as it is connected.
 */
export function levelOf(
	{
		heartbeats,
		deadline,
	}: { heartbeats: readonly number[]; deadline?: number },
	elapsed: number,
): number {
	if (deadline === undefined) {
		return 1;
	}
	return deadlineLevel(
		heartbeats.map((ago) => -ago),
		deadline,
		elapsed,
	);
}
