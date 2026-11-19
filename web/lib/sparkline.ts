import type { Chart } from "../model.ts";

/** The width of the chart's drawing, in its own units. */
export const sparklineWidth = 240;

/** The height of the chart's drawing, in its own units. */
export const sparklineHeight = 48;

/** The period of time that a chart shows, in milliseconds. */
export const chartWindowMs = 60_000;

/** The space above and below the highest and lowest values, in drawing units. */
const pad = 2;

/** The width of the lead-in, in drawing units. */
const leadIn = 60;

/**
 * SparklineGeometry is what the SVG of a sparkline is drawn from.
 */
export interface SparklineGeometry {
	/** The outline of the area under the line, as an SVG path. */
	area: string;

	/** The line, as an SVG path. */
	line: string;

	/**
	 * The x-coordinates between which the line and the area fade in from
	 * nothing, or undefined if they do not.
	 *
	 * A chart whose points begin inside the window, as they do on a page that has
	 * just loaded, has a lead-in: the line and the area beneath it continue to the
	 * left of the first point at the same height, and fade to nothing. It shows
	 * no value, and gives the chart a soft start instead of an abrupt one. It is
	 * gone once the points fill the window.
	 */
	leadIn: { from: number; to: number } | undefined;
}

/**
 * sparklineGeometry returns the geometry of a chart of the given points over
 * {@link chartWindowMs}, with each point placed by its time and the chart's end
 * at the right-hand edge. The chart is scaled so that the largest value reaches
 * the top. It returns undefined for a chart that has no points.
 *
 * Points that are later than the chart's end are beyond its right-hand edge,
 * and the last value continues flat past them, and the points may begin before
 * the left-hand edge. So the chart can be moved left as time passes, and new
 * points enter from the right without showing a gap at either edge.
 */
export function sparklineGeometry(chart: Chart): SparklineGeometry | undefined {
	const { points } = chart;

	const first = points[0];
	const last = points[points.length - 1];
	if (first === undefined || last === undefined) {
		return undefined;
	}

	let peak = Math.max(...points.map((p) => p.value));
	if (peak === 0) {
		peak = 1;
	}

	const xOf = (at: number) =>
		sparklineWidth - ((chart.end - at) / chartWindowMs) * sparklineWidth;
	const yOf = (value: number) =>
		sparklineHeight - pad - (value / peak) * (sparklineHeight - 2 * pad);
	const fixed = (n: number) => n.toFixed(2);

	const firstX = xOf(first.at);
	const hasLeadIn = firstX > 0;
	const startX = hasLeadIn ? firstX - leadIn : firstX;

	const commands: string[] = [];

	if (hasLeadIn) {
		commands.push(
			`M${fixed(startX)} ${fixed(yOf(first.value))}`,
			`L${fixed(firstX)} ${fixed(yOf(first.value))}`,
		);
	}

	for (const [i, p] of points.entries()) {
		if (i === 0 && hasLeadIn) {
			// The lead-in has already moved the line to this point.
			continue;
		}

		commands.push(
			`${i === 0 ? "M" : "L"}${fixed(xOf(p.at))} ${fixed(yOf(p.value))}`,
		);
	}

	const beyond = Math.max(xOf(last.at), sparklineWidth) + sparklineWidth * 0.25;
	commands.push(`L${fixed(beyond)} ${fixed(yOf(last.value))}`);

	const line = commands.join(" ");

	return {
		line,
		area: `${line} L${fixed(beyond)} ${sparklineHeight} L${fixed(startX)} ${sparklineHeight} Z`,
		leadIn: hasLeadIn ? { from: startX, to: firstX } : undefined,
	};
}

/**
 * valueAt returns the value of a chart at a time, on the same scale as its
 * points, as the line between its points has it. It is undefined before the
 * first point, where the chart has no value, and it is the last value after the
 * last point.
 */
export function valueAt(chart: Chart, at: number): number | undefined {
	const { points } = chart;

	const first = points[0];
	const last = points[points.length - 1];
	if (first === undefined || last === undefined || at < first.at) {
		return undefined;
	}
	if (at >= last.at) {
		return last.value;
	}

	for (let i = 1; i < points.length; i++) {
		const next = points[i] as Chart["points"][number];
		if (at <= next.at) {
			const prev = points[i - 1] as Chart["points"][number];
			if (next.at === prev.at) {
				return next.value;
			}
			return (
				prev.value +
				((next.value - prev.value) * (at - prev.at)) / (next.at - prev.at)
			);
		}
	}

	return last.value;
}

/**
 * heightOf returns how far up a chart a value is drawn, from 0, at the bottom,
 * to 1, at the top, where the largest value of the chart is, as
 * {@link sparklineGeometry} scales it.
 */
export function heightOf(chart: Chart, value: number): number {
	const peak = Math.max(0, ...chart.points.map((p) => p.value)) || 1;
	return (
		(sparklineHeight - pad - (1 - value / peak) * (sparklineHeight - 2 * pad)) /
		sparklineHeight
	);
}
