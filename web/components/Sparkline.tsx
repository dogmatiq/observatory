import { useId, useState } from "react";
import { cn } from "../lib/cn.ts";
import { useDistrusted } from "../lib/distrust.tsx";
import { useScrolled } from "../lib/live.tsx";
import { type Readout, useGiveReadout } from "../lib/readout.tsx";
import {
	chartWindowMs,
	heightOf,
	type SparklineGeometry,
	sparklineGeometry,
	sparklineHeight,
	sparklineWidth,
	valueAt,
} from "../lib/sparkline.ts";
import type { Chart } from "../model.ts";

/**
 * Sparkline draws a chart of how a number changed over the last minute, with
 * the most recent value at the right-hand edge. It has no axes, because it
 * shows the shape of the change and not the values, which are scaled so that
 * the largest reaches the top.
 *
 * Between updates the chart scrolls left as time passes, unless the viewer
 * prefers reduced motion, or the numbers around it are not current, so new values enter from the right without a jump.
 * See {@link LiveData}.
 *
 * It is positioned along the bottom edge of the nearest ancestor that is
 * positioned, and is as wide as it, with the height given by the `className`.
 * It takes its colors from the `--subsystem` and `--subsystem-soft` custom
 * properties that it inherits. It is decoration, and the values it shows are
 * also given as text beside it, so it is hidden from assistive technology.
 *
 * If it is given `describe`, which writes a value as a figure and the unit that
 * it is in, pointing at a place on the chart shows a cursor there, and gives the
 * value at that place, and how long ago it was, to the part of the page that
 * shows readouts. The chart scrolls, so the place under the pointer moves.
 */
export function Sparkline({
	chart,
	className,
	describe,
}: {
	chart: Chart;
	className?: string;
	describe?: (value: number) => Pick<Readout, "figure" | "unit" | "subsystem">;
}) {
	const id = useId();

	// A chart stands still if the numbers around it are not current, as they are not
	// for a cluster with no node reporting, and shows what it showed when the last
	// node reported.
	const scrolled = useScrolled();
	const end = chart.end + (useDistrusted() ? 0 : scrolled);
	const geometry = sparklineGeometry({ ...chart, end });

	return (
		<>
			<svg
				className={cn("absolute inset-x-0 bottom-0 w-full", className)}
				viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				{geometry && (
					<g>
						{geometry.leadIn ? (
							<LedPaths id={id} geometry={geometry} />
						) : (
							<>
								<path className="fill-(--subsystem-soft)" d={geometry.area} />
								<path
									className="fill-none stroke-(--subsystem) [stroke-width:1.5]"
									d={geometry.line}
									vectorEffect="non-scaling-stroke"
								/>
							</>
						)}
					</g>
				)}
			</svg>
			{describe && (
				<Cursor
					chart={chart}
					end={end}
					describe={describe}
					className={className}
				/>
			)}
		</>
	);
}

/**
 * Cursor is the layer over a chart that is pointed at. It draws the cursor, and
 * gives the readout for the place that is pointed at to the page.
 */
function Cursor({
	chart,
	end,
	describe,
	className,
}: {
	chart: Chart;
	end: number;
	describe: (value: number) => Pick<Readout, "figure" | "unit" | "subsystem">;
	className?: string;
}) {
	// Where the pointer is, as a share of the chart's width, if it is on it.
	const [pointer, setPointer] = useState<number>();

	// The chart scrolls, so the time under a pointer that is still goes on moving.
	const mark = markAt(
		chart,
		end,
		pointer === undefined ? undefined : (1 - pointer) * chartWindowMs,
	);
	const readout: Readout | undefined = mark && {
		...describe(mark.value),
		age: mark.age < 1500 ? "now" : `${Math.round(mark.age / 1000)} s ago`,
	};

	useGiveReadout(readout);

	return (
		// The chart is decoration, which is hidden from assistive technology, and its
		// values are given as text beside it, so the pointer is the only way to point
		// at a place on it.
		<div
			className={cn("absolute inset-x-0 bottom-0", className)}
			onPointerMove={(e) => {
				const box = e.currentTarget.getBoundingClientRect();
				setPointer(
					Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
				);
			}}
			onPointerLeave={() => setPointer(undefined)}
		>
			{mark && <CursorMark x={mark.x} y={mark.y} />}
		</div>
	);
}

/**
 * CursorMark draws the mark of a chart's cursor, at `x` and `y`, which are shares
 * of the width and the height of the chart from its left and its bottom. It is
 * made of a [CursorLine] and a [CursorDot] of five pixels.
 */
export function CursorMark({ x, y }: { x: number; y: number }) {
	return (
		<>
			<CursorLine x={x} y={y} />
			<CursorDot x={x} y={y} size={5} />
		</>
	);
}

/**
 * CursorLine is a faint line the height of the chart at `x`, which is a share
 * of its width from the left. It fades out upward and downward, and is strongest
 * at `y`, a share of the height from the bottom, where it meets the chart's line.
 */
export function CursorLine({ x, y }: { x: number; y: number }) {
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2"
			style={{
				left: `${(x * 100).toFixed(3)}%`,
				background: `linear-gradient(to bottom, transparent, color-mix(in srgb, var(--subsystem) 55%, transparent) ${((1 - y) * 100).toFixed(1)}%, transparent)`,
			}}
		/>
	);
}

/**
 * CursorDot is a round dot of `size` pixels where the cursor meets the chart's
 * line. Its center pixel has the full color of the text, and the rest is
 * fainter, and fainter again toward its edge, so that it is a point and not a
 * block.
 */
export function CursorDot({
	x,
	y,
	size,
}: {
	x: number;
	y: number;
	size: number;
}) {
	// The center pixel is this share of the way from the center to the edge.
	const center = (0.5 / (size / 2)) * 100;

	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute -translate-x-1/2 translate-y-1/2 rounded-full"
			style={{
				left: `${(x * 100).toFixed(3)}%`,
				bottom: `${(y * 100).toFixed(3)}%`,
				width: size,
				height: size,
				background: `radial-gradient(circle closest-side, var(--color-fg) ${center.toFixed(1)}%, color-mix(in srgb, var(--color-fg) var(--cursor-ring), transparent) ${(center + 1).toFixed(1)}%, color-mix(in srgb, var(--color-fg) var(--cursor-edge), transparent) 100%)`,
			}}
		/>
	);
}

/**
 * markAt returns the place on a chart that is `age` before its right-hand edge,
 * which is at `end`: its value, how long ago it was, and where it is, as shares
 * of the chart's width and height from the left and the bottom. It is undefined
 * if there is no such time, or the chart has no value then.
 */
function markAt(
	chart: Chart,
	end: number,
	age: number | undefined,
): { value: number; age: number; x: number; y: number } | undefined {
	if (age === undefined || age > chartWindowMs) {
		return undefined;
	}

	const value = valueAt(chart, end - age);
	if (value === undefined) {
		return undefined;
	}

	return { value, age, x: 1 - age / chartWindowMs, y: heightOf(chart, value) };
}

/**
 * LedPaths draws the area and the line of a chart that has a lead-in, which
 * fade in from nothing along it.
 *
 * Their fill and stroke are gradients, set by attributes, so the paths have no
 * classes that set them: a class would override the attributes.
 */
function LedPaths({
	id,
	geometry,
}: {
	id: string;
	geometry: SparklineGeometry;
}) {
	const { from, to } = geometry.leadIn ?? { from: 0, to: 0 };
	const gradient = (name: string, color: string) => (
		<linearGradient
			id={`${id}-${name}`}
			gradientUnits="userSpaceOnUse"
			x1={from}
			x2={to}
			y1="0"
			y2="0"
		>
			<stop offset="0" style={{ stopColor: color, stopOpacity: 0 }} />
			<stop offset="1" style={{ stopColor: color }} />
		</linearGradient>
	);

	return (
		<>
			<defs>
				{gradient("area", "var(--subsystem-soft)")}
				{gradient("line", "var(--subsystem)")}
			</defs>
			<path d={geometry.area} fill={`url(#${id}-area)`} />
			<path
				className="[stroke-width:1.5]"
				d={geometry.line}
				fill="none"
				stroke={`url(#${id}-line)`}
				vectorEffect="non-scaling-stroke"
			/>
		</>
	);
}
