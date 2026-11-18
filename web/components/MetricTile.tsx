import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { countOf, formatCompact } from "../lib/format.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Presence } from "./Presence.tsx";
import { type Subsystem, subsystemColors } from "./subsystems.ts";

/**
 * What a card looks like, whatever it holds: a panel that is raised off the
 * page by a shadow.
 */
export const cardClasses =
	"relative overflow-hidden rounded-card bg-panel text-fg";
export const raisedClasses = "[box-shadow:var(--shadow-raised)]";

/**
 * How a card that is a link looks when it is pointed at: it is outlined.
 */
export const linkedCardClasses =
	"no-underline hover:[box-shadow:var(--shadow-raised-pointed)] hover:no-underline";

/**
 * MetricTile is one of the three tiles at the top of the cluster view. It shows
 * one headline number, with a few words that say what the number counts, and a
 * bar and a chart along its bottom.
 *
 * The tile is a link if it has an `href`, and is outlined when pointed at.
 * Otherwise it is an article named by its `label`, and nothing happens when it is
 * pointed at.
 */
export function MetricTile({
	subsystem,
	label,
	icon,
	value,
	valueTitle,
	detail,
	bar,
	chart,
	href,
}: {
	subsystem: Subsystem;

	/** The name of what the tile shows, which is the icon's tooltip. */
	label: string;

	icon: IconName;

	/** The headline number. */
	value: ReactNode;

	/** The headline number in full, as its tooltip. */
	valueTitle?: string;

	/** The words beside the number, which always take two lines of room. */
	detail: ReactNode;

	/** The bar of how the number is spread, if there is one. */
	bar?: ReactNode;

	/** The chart along the bottom, if there is one. */
	chart?: ReactNode;

	href?: string;
}) {
	const classes = cn(
		cardClasses,
		raisedClasses,
		"flex min-h-44 flex-col px-5 pt-5",
		// The room for the chart is only there if there is one.
		"transition-[padding-bottom] duration-400 motion-reduce:transition-none",
		chart ? "pb-16" : "pb-5",
		subsystemColors[subsystem],
		href !== undefined && linkedCardClasses,
	);

	const content = (
		<>
			<div className="flex items-center justify-between gap-3">
				<span
					className="self-start text-4xl leading-none font-bold tracking-[-0.02em] tabular-nums"
					title={valueTitle}
				>
					{value}
				</span>
				<span className="flex-none text-(--subsystem)" title={label}>
					<Icon name={icon} className="inline size-5 align-text-bottom" />
				</span>
			</div>
			<span className="relative z-10 mt-1 min-h-[calc(2*1.5em)] text-sm text-muted">
				{detail}
			</span>
			<Presence>
				{bar && <div className="relative z-10 mt-3">{bar}</div>}
			</Presence>
			<Presence shape="fade" className="absolute inset-x-0 bottom-0">
				{chart}
			</Presence>
		</>
	);

	if (href !== undefined) {
		return (
			<a className={classes} href={href}>
				{content}
			</a>
		);
	}

	return (
		<article className={classes} aria-label={label}>
			{content}
		</article>
	);
}

/**
 * Noun marks the words in a tile's detail that say what the headline number
 * counts, which stand out from the rest.
 */
export function Noun({ children }: { children: ReactNode }) {
	return <span className="text-fg">{children}</span>;
}

/**
 * Failing is the number of messages that are pending and failing, which comes
 * after the number of those that are not, such as "24 +1". It is red, and
 * smaller than the number it follows.
 *
 * It is spoken in full, because "+1" says little to a screen reader.
 *
 * When there are none it is not shown. When there begin to be some it grows from
 * nothing, larger than it will stay for a moment, and when there stop being any
 * it shrinks away, so that it doesn't make the page jump. It does neither when
 * the page loads with it in place, nor for a viewer who asks for less motion.
 */
export function Failing({
	count,
	size,
}: {
	count: number;
	size: "headline" | "stat";
}) {
	const [phase, setPhase] = useState<"gone" | "in" | "steady" | "out">(
		count > 0 ? "steady" : "gone",
	);

	// The number that is shown while it shrinks away is the last that wasn't zero.
	const last = useRef(count);
	if (count > 0) {
		last.current = count;
	}

	useEffect(() => {
		if (count > 0) {
			setPhase((p) => (p === "steady" || p === "in" ? p : "in"));
		} else {
			setPhase((p) => (p === "gone" ? p : "out"));
		}
	}, [count]);

	if (phase === "gone") {
		return null;
	}

	// The count is smaller than the number that it follows, and is raised so that
	// the tops of their digits are on one line, which is not a superscript. The
	// raise is the difference between the heights of the digits, which are 0.7 of
	// the font size, as a share of the count's own size. Its space is inside the
	// box that shrinks away, because padding on that box would stay behind when it
	// has shrunk and make the number beside it jump when the count goes.
	const shown = (
		<span
			className={cn(
				"inline-grid grid-cols-[1fr]",
				size === "headline"
					? "align-[0.43em] text-[0.62em]"
					: "align-[0.36em] text-[0.66em]",
				phase === "in" && "motion-safe:animate-[failing-in_0.55s_ease-out]",
				phase === "out" &&
					"motion-safe:animate-[failing-out_0.8s_ease-in-out_forwards]",
			)}
			onAnimationEnd={() => setPhase((p) => (p === "out" ? "gone" : "steady"))}
		>
			<span className="min-w-0 origin-left overflow-hidden font-semibold whitespace-nowrap text-bad">
				<span className={cn("block", size === "headline" ? "pl-1.5" : "pl-1")}>
					<span aria-hidden="true">{`+${formatCompact(last.current)}`}</span>
					<span className="sr-only">
						{` and ${countOf(last.current, "message", "messages")} failing`}
					</span>
				</span>
			</span>
		</span>
	);

	return shown;
}

/**
 * Alarm marks a number of things that need attention.
 */
export function Alarm({ children }: { children: ReactNode }) {
	return <span className="font-semibold text-bad">{children}</span>;
}
