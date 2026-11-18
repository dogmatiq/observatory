import { useEffect, useRef, useState } from "react";
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
 * How long a segment takes to shrink away, in milliseconds, which is the time
 * that its width takes to change.
 */
const leaving = 500;

/**
 * useExtent returns how many segments a bar draws, which is the number that it
 * has, and, for the time that a segment takes to shrink away after the bar has
 * fewer, the number that it had.
 */
function useExtent(count: number): number {
	const [extent, setExtent] = useState(count);

	useEffect(() => {
		if (count > extent) {
			setExtent(count);
			return;
		}

		if (count < extent) {
			const timer = window.setTimeout(() => setExtent(count), leaving + 100);
			return () => window.clearTimeout(timer);
		}
	}, [count, extent]);

	return Math.max(count, extent);
}

/**
 * useKept returns how many segments a bar draws, as [useExtent] does, and the
 * segment that each of them has, or had last, so that a segment that is shrinking
 * away keeps its look until it is gone and doesn't flash in another's.
 */
function useKept<T>(segments: readonly T[]): { extent: number; kept: T[] } {
	const extent = useExtent(segments.length);
	const last = useRef<T[]>([]);

	const kept = Array.from({ length: extent }, (_, i) =>
		i < segments.length ? (segments[i] as T) : (last.current[i] as T),
	);

	last.current = kept;
	return { extent, kept };
}

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
	const { extent, kept } = useKept(segments);

	// A segment that has no width, or has gone, is drawn with none, where it
	// would begin, so that it can shrink away and grow back.
	let cursor = 0;
	const drawn = Array.from({ length: extent }, (_, i) => {
		const rect = rects[i];
		if (rect === undefined) {
			return { x: cursor, width: 0 };
		}

		cursor = rect.x + rect.width;
		return rect;
	});

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
			{drawn.map((rect, i) => {
				const s = segments[i];
				const look = kept[i];

				return (
					<rect
						// A segment has no identity but its position.
						// biome-ignore lint/suspicious/noArrayIndexKey: see above
						key={i}
						className={cn(
							look?.isOther
								? "fill-faint"
								: cn("fill-(--subsystem)", shades[i]),
							// A segment moves and grows as its value changes, and a new one
							// grows from nothing.
							"transition-[x,width] duration-500 ease-out starting:w-0 motion-reduce:transition-none",
						)}
						x={rect.x.toFixed(3)}
						y="0"
						width={rect.width.toFixed(3)}
						height="10"
					>
						{s && <title>{s.title}</title>}
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
	// A segment that has gone shrinks away before it is removed.
	const { extent, kept } = useKept(segments);

	return (
		<div className="flex h-2 gap-0.5 overflow-hidden rounded bg-sunk">
			{Array.from({ length: extent }, (_, i) => {
				const s = segments[i];

				return (
					<div
						// A segment has no identity but its position.
						// biome-ignore lint/suspicious/noArrayIndexKey: see above
						key={i}
						className={cn(
							"min-w-0 bg-cluster",
							s === undefined || s.percent !== undefined
								? "flex-initial"
								: "flex-none",
							// A segment grows and shrinks as its share changes, and a new one
							// grows from nothing.
							"transition-[width,margin] duration-500 ease-out motion-safe:animate-[bar-in_0.5s_ease-out]",
							s === undefined && "-ml-0.5",
						)}
						style={{
							width:
								s === undefined
									? 0
									: s.percent === undefined
										? 8
										: `${s.percent.toFixed(3)}%`,
							opacity: kept[i]?.opacity,
						}}
						{...(s
							? { role: "img", "aria-label": s.title, title: s.title }
							: { "aria-hidden": true })}
					/>
				);
			})}
		</div>
	);
}
