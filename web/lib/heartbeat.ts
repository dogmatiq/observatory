/**
 * Point is a position on the heartbeat chart's canvas, in canvas pixels.
 */
export type Point = readonly [x: number, y: number];

/**
 * levelY returns how far down a canvas of `height` pixels the line of the
 * heartbeat chart is when a node's level is `level`, from 0 when it is empty to 1
 * when it is full. An empty level is 2 CSS pixels above the bottom edge, and the
 * line rises by up to 60% of the canvas's height.
 */
export function levelY(level: number, height: number, ratio: number): number {
	return height - 2 * ratio - height * 0.6 * level;
}

/**
 * heartbeatLine returns the points of the heartbeat chart's line, from the left
 * edge of a canvas to its right edge.
 *
 * Each node has a share of the width, in the order of `levels`, like the
 * segments of the bar of workloads above the chart. The line's height in the
 * middle of a node's share is the node's level, from 0 when it is empty to 1
 * when it is full, and the line eases smoothly from one node's level to the
 * next.
 *
 * The shares are equal, unless `presence` says how much of its share each node
 * has, from 0 to 1. It lets a node grow from nothing as it joins and shrink away
 * as it leaves. The share of a node that is partly there is smaller, and its
 * level is partly that of the nodes beside it, so that the line changes
 * smoothly, and is the same without the node when its presence is 0.
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
	presence: readonly number[] = levels.map(() => 1),
): Point[] {
	// A node with no presence is not on the line at all.
	const there = presence.flatMap((w, i) => (w > 0 ? [i] : []));
	if (there.length < levels.length) {
		return heartbeatLine(
			there.map((i) => levels[i] as number),
			width,
			height,
			ratio,
			there.map((i) => presence[i] as number),
		);
	}

	const total = presence.reduce((sum, w) => sum + w, 0);
	if (levels.length === 0 || total <= 0) {
		return [];
	}

	// A node that is partly there has a level that is partly that of the nodes
	// beside it, so that it changes the line less the less of it there is.
	const shown = levels.map((level, i) => {
		const w = presence[i] as number;
		if (w >= 1) {
			return level;
		}

		const beside = [levels[i - 1], levels[i + 1]].filter(
			(l): l is number => l !== undefined,
		);
		if (beside.length === 0) {
			return level;
		}

		const around = beside.reduce((sum, l) => sum + l, 0) / beside.length;
		return around + (level - around) * w;
	});

	const ys = shown.map((level) => levelY(level, height, ratio));
	const last = levels.length - 1;

	// The middle of each node's share, as a fraction of the width.
	const middles: number[] = [];
	let before = 0;
	for (const w of presence) {
		middles.push((before + w / 2) / total);
		before += w;
	}

	const points: Point[] = [];

	for (let x = 0; x <= width; x += 2 * ratio) {
		const u = x / width;

		// The node whose middle is the last at or before u, or the first.
		let i = 0;
		while (i < last && (middles[i + 1] as number) <= u) {
			i++;
		}

		const j = Math.min(last, i + 1);
		const from = middles[i] as number;
		const to = middles[j] as number;
		const t =
			to > from ? Math.max(0, Math.min(1, (u - from) / (to - from))) : 0;
		const ease = t * t * (3 - 2 * t);

		// The indexes are in range, because they are clamped to the levels.
		const yi = ys[i] as number;
		const yj = ys[j] as number;
		points.push([x, yi + (yj - yi) * ease]);
	}

	return points;
}
