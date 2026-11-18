/**
 * Point is a position on the heartbeat chart's canvas, in canvas pixels.
 */
export type Point = readonly [x: number, y: number];

/**
 * heartbeatLine returns the points of the heartbeat chart's line, from the left
 * edge of a canvas to its right edge.
 *
 * Each node has an equal share of the width, in the order of `levels`, like
 * the segments of the bar of workloads above the chart. The line's height in
 * the middle of a node's share is the node's level, from 0 when it is empty to
 * 1 when it is full, and the line eases smoothly from one node's level to the
 * next.
 *
 * `ratio` is the number of canvas pixels in one CSS pixel. The line is drawn
 * every two CSS pixels, and sits 2 CSS pixels above the bottom edge when a
 * level is empty and rises by up to 60% of the canvas's height.
 */
export function heartbeatLine(
	levels: readonly number[],
	width: number,
	height: number,
	ratio: number,
): Point[] {
	if (levels.length === 0) {
		return [];
	}

	const base = height - 2 * ratio;
	const rise = height * 0.6;
	const ys = levels.map((level) => base - rise * level);
	const last = levels.length - 1;

	const points: Point[] = [];

	for (let x = 0; x <= width; x += 2 * ratio) {
		// f is how far x is through the nodes, where node i's middle is at i.
		const f = (x / width) * levels.length - 0.5;
		const i = Math.max(0, Math.min(last, Math.floor(f)));
		const j = Math.min(last, i + 1);
		const t = Math.max(0, Math.min(1, f - i));
		const ease = t * t * (3 - 2 * t);

		// The indexes are in range, because they are clamped to the levels.
		const yi = ys[i] as number;
		const yj = ys[j] as number;
		points.push([x, yi + (yj - yi) * ease]);
	}

	return points;
}
