import { cn } from "../lib/cn.ts";
import {
	type BarSegment,
	layoutSegments,
	type NodeSegment,
} from "../lib/segments.ts";
import { type Subsystem, subsystemColors } from "./subsystems.ts";

/**
 * How opaque each segment is, by its position, so that the segments of a bar
 * are told apart by shade. The first is the darkest.
 */
const shades = [
	"",
	"opacity-80",
	"opacity-[0.64]",
	"opacity-50",
	"opacity-[0.38]",
	"opacity-[0.28]",
];

/**
 * StackedBar draws a bar like a disk usage bar, whose segments are proportional
 * to their values and are in the given order, with a gap between them.
 *
 * Hovering a segment shows its title. The bar as a whole is described to
 * assistive technology by the titles of all its segments. A bar with no segments
 * is an empty track, which keeps its place so that the page does not move when
 * it fills.
 */
export function StackedBar({
	segments,
	subsystem,
}: {
	segments: BarSegment[];
	subsystem: Subsystem;
}) {
	const rects = layoutSegments(segments);
	const described = segments.length > 0;

	return (
		<svg
			className={cn(
				"block h-2 w-full overflow-hidden rounded bg-sunk",
				subsystemColors[subsystem],
			)}
			viewBox="0 0 100 10"
			preserveAspectRatio="none"
			role={described ? "img" : undefined}
			aria-label={
				described ? segments.map((s) => s.title).join("; ") : undefined
			}
			aria-hidden={described ? undefined : true}
		>
			{segments.map((s, i) => {
				const rect = rects[i];
				if (rect === undefined) {
					return null;
				}

				return (
					<rect
						// A segment has no identity but its position.
						// biome-ignore lint/suspicious/noArrayIndexKey: see above
						key={i}
						className={cn(
							s.isOther ? "fill-faint" : cn("fill-(--subsystem)", shades[i]),
							// A segment moves and grows as its value changes, and a new one
							// grows from nothing.
							"transition-[x,width] duration-500 ease-out starting:w-0 motion-reduce:transition-none",
						)}
						x={rect.x.toFixed(3)}
						y="0"
						width={rect.width.toFixed(3)}
						height="10"
					>
						<title>{s.title}</title>
					</rect>
				);
			})}
		</svg>
	);
}

/**
 * NodeBar draws a bar with one segment for each live node, whose width is the
 * node's share of the workloads, with a gap between the segments.
 *
 * A node that owns no workloads has a small square segment instead. The
 * segments shrink in proportion to make room for the gaps and the squares.
 */
export function NodeBar({ segments }: { segments: NodeSegment[] }) {
	return (
		<div className="flex h-2 gap-0.5 overflow-hidden rounded bg-sunk">
			{segments.map((s, i) => (
				<div
					// A segment has no identity but its position.
					// biome-ignore lint/suspicious/noArrayIndexKey: see above
					key={i}
					className={cn(
						"min-w-0 bg-cluster",
						s.percent === undefined ? "flex-none" : "flex-initial",
						// A segment grows and shrinks as its share changes, and a new one
						// grows from nothing.
						"transition-[width] duration-500 ease-out motion-safe:animate-[bar-in_0.5s_ease-out]",
					)}
					style={{
						width: s.percent === undefined ? 8 : `${s.percent.toFixed(3)}%`,
						opacity: s.opacity,
					}}
					role="img"
					aria-label={s.title}
					title={s.title}
				/>
			))}
		</div>
	);
}
