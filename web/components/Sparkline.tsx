import { useId } from "react";
import { cn } from "../lib/cn.ts";
import { useScrolled } from "../lib/live.tsx";
import {
	type SparklineGeometry,
	sparklineGeometry,
	sparklineHeight,
	sparklineWidth,
} from "../lib/sparkline.ts";
import type { Chart } from "../model.ts";
import { EmptySky } from "./EmptySky.tsx";

/**
 * Sparkline draws a chart of how a number changed over the last minute, with
 * the most recent value at the right-hand edge. It has no axes, because it
 * shows the shape of the change and not the values, which are scaled so that
 * the largest reaches the top.
 *
 * Between updates the chart scrolls left as time passes, unless the viewer
 * prefers reduced motion, so new values enter from the right without a jump.
 * See {@link LiveData}.
 *
 * It is positioned along the bottom edge of the nearest ancestor that is
 * positioned, and is as wide as it, with the height given by the `className`.
 * It takes its colors from the `--subsystem` and `--subsystem-soft` custom
 * properties that it inherits. It is decoration, and the values it shows are
 * also given as text beside it, so it is hidden from assistive technology.
 */
export function Sparkline({
	chart,
	className,
}: {
	chart: Chart;
	className?: string;
}) {
	const id = useId();
	const scrolled = useScrolled();
	const geometry = sparklineGeometry({ ...chart, end: chart.end + scrolled });

	// A chart with nothing to draw, or with only zeros, is empty.
	const empty = chart.points.every((p) => p.value === 0);

	return (
		<>
			{empty && <EmptySky className={className} />}
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
		</>
	);
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
