import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { useDistrusted } from "../lib/distrust.tsx";
import {
	type BarSegment,
	layoutSegments,
	type NodeSegment,
	type SegmentAbout,
} from "../lib/segments.ts";
import { Identifier } from "./Identifier.tsx";
import { Popover } from "./Popover.tsx";
import { SegmentCard } from "./SegmentCard.tsx";
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
 * describe returns what the popover of a segment holds, which is the segment's
 * title, or, for a segment of one thing that has an ID, the title without the ID,
 * followed by the ID as an [Identifier].
 */
function describe(s: {
	title: string;
	lead?: string;
	id?: string;
	of?: string;
	about?: SegmentAbout;
}): ReactNode {
	if (s.about !== undefined) {
		return <SegmentCard about={s.about} />;
	}

	return s.id === undefined ? (
		s.title
	) : (
		<>
			{s.lead} <Identifier id={s.id} what={`${s.of ?? "thing"} ID`} />
		</>
	);
}

/**
 * useHovered returns the position of the segment that the pointer is on, if any,
 * and the handlers to give the element of each segment.
 */
function useHovered() {
	const [hovered, setHovered] = useState<number>();

	return {
		hovered,
		handlers: (i: number) => ({
			onPointerEnter: () => setHovered(i),
			onPointerLeave: () => setHovered((h) => (h === i ? undefined : h)),
		}),
	};
}

/**
 * StackedBar draws a bar like a disk usage bar, whose segments are proportional
 * to their values and are in the given order, with a gap between them.
 *
 * Pointing at a segment shows its title in a popover, and the segment rises out
 * of the bar by a pixel above and below, at full opacity. The bar as a whole is
 * described to assistive technology by the titles of all its segments. A bar with
 * no segments is an empty track, which keeps its place so that the page does not
 * move when it fills. A bar is empty in a cluster whose numbers are not current.
 *
 * A rising segment reaches outside the bar, so whatever holds the bar must not
 * clip it.
 */
export function StackedBar({
	segments: given,
	subsystem,
}: {
	segments: BarSegment[];
	subsystem: Subsystem;
}) {
	// What a bar spreads is not current if the numbers around it are not, so it is
	// an empty track, as the segments shrink away. See [Distrusted].
	const segments = useDistrusted() ? [] : given;
	const rects = layoutSegments(segments);
	const described = segments.length > 0;
	const { extent, kept } = useKept(segments);
	const { hovered, handlers } = useHovered();

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
		<div
			className={cn(
				"relative block h-2 w-full rounded bg-sunk",
				subsystemColors[subsystem],
			)}
			{...(described
				? { role: "img", "aria-label": segments.map((s) => s.title).join("; ") }
				: { "aria-hidden": true })}
		>
			{drawn.map((rect, i) => {
				const s = segments[i];
				const look = kept[i];

				return (
					<Popover
						// A segment has no identity but its position.
						// biome-ignore lint/suspicious/noArrayIndexKey: see above
						key={i}
						content={s && describe(s)}
						interactive={s?.id !== undefined || s?.about !== undefined}
						card={s?.about !== undefined}
					>
						<div
							className={cn(
								"absolute transition-[left,width,top,bottom,opacity] duration-500 ease-out motion-safe:animate-[bar-in_0.5s_ease-out] motion-reduce:transition-none",
								look?.isOther ? "bg-faint" : "bg-(--subsystem)",
								// The segments at the two ends of the bar have its rounded
								// ends, which stay as round as the segment is high when it
								// rises.
								rect.x < 0.001 && "rounded-l-full",
								rect.x + rect.width > 99.999 && "rounded-r-full",
								// A segment rises out of the bar, and then has no shade.
								hovered === i
									? "-top-px -bottom-px opacity-100 duration-200"
									: cn("top-0 bottom-0", !look?.isOther && shades[i]),
							)}
							style={{
								left: `${rect.x.toFixed(3)}%`,
								width: `${rect.width.toFixed(3)}%`,
							}}
							{...(s ? handlers(i) : {})}
						/>
					</Popover>
				);
			})}
		</div>
	);
}

/**
 * NodeBar draws a bar with one segment for each live node, whose width is the
 * node's share of the workloads, with a gap between the segments.
 *
 * A node that owns no workloads has a small square segment instead. The
 * segments shrink in proportion to make room for the gaps and the squares.
 *
 * Pointing at a segment shows its title in a popover, and the segment rises out
 * of the bar by a pixel above and below, at full opacity, so whatever holds the
 * bar must not clip it.
 */
export function NodeBar({ segments }: { segments: NodeSegment[] }) {
	// A segment that has gone shrinks away before it is removed.
	const { extent, kept } = useKept(segments);
	const { hovered, handlers } = useHovered();

	return (
		<div className="flex h-2 gap-0.5 rounded bg-sunk">
			{Array.from({ length: extent }, (_, i) => {
				const s = segments[i];

				return (
					<Popover
						// A segment has no identity but its position.
						// biome-ignore lint/suspicious/noArrayIndexKey: see above
						key={i}
						content={s && describe(s)}
						interactive={s?.id !== undefined || s?.about !== undefined}
						card={s?.about !== undefined}
					>
						<div
							className={cn(
								"min-w-0",
								s?.faint ? "bg-faint" : "bg-cluster",
								s === undefined || s.percent !== undefined
									? "flex-initial"
									: "flex-none",
								// The segments at the two ends of the bar have its rounded
								// ends, which stay as round as the segment is high when it
								// rises.
								i === 0 && "rounded-l-full",
								i === segments.length - 1 && "rounded-r-full",
								// A segment grows and shrinks as its share changes, and a new one
								// grows from nothing.
								"transition-[width,margin,opacity] duration-500 ease-out motion-safe:animate-[bar-in_0.5s_ease-out]",
								s === undefined && "-ml-0.5",
								// A segment rises out of the bar, by the room that a negative
								// margin gives a segment that stretches to the bar's height.
								hovered === i && "-my-px duration-200",
							)}
							style={{
								width:
									s === undefined
										? 0
										: s.percent === undefined
											? 8
											: `${s.percent.toFixed(3)}%`,
								opacity: hovered === i ? 1 : kept[i]?.opacity,
							}}
							{...(s
								? { role: "img", "aria-label": s.title, ...handlers(i) }
								: { "aria-hidden": true })}
						/>
					</Popover>
				);
			})}
		</div>
	);
}
