import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { useCurrent } from "../lib/distrust.tsx";
import { countOf, formatCompact } from "../lib/format.ts";
import { prefersReducedMotion } from "../lib/ramped.ts";
import { type Readout, ReadoutContext } from "../lib/readout.tsx";
import { AlertFlag } from "./AlertFlag.tsx";
import { Glitch } from "./Glitch.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { Presence } from "./Presence.tsx";
import { Ramped } from "./Ramped.tsx";
import type { Status } from "./statuses.ts";
import { type Subsystem, subsystemColors } from "./subsystems.ts";

/**
 * What a card looks like, whatever it holds: a panel that is raised off the
 * page by a shadow.
 */
export const cardClasses =
	"relative overflow-hidden rounded-card bg-panel text-fg";
export const raisedClasses = "[box-shadow:var(--shadow-raised)]";

/**
 * What a card looks like when it is in an error state: raised, with an accent along
 * its top.
 */
export const accentClasses = {
	failing:
		"[box-shadow:inset_0_3px_0_var(--color-failing),var(--shadow-raised)]",
	bad: "[box-shadow:inset_0_3px_0_var(--color-bad),var(--shadow-raised)]",
};

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
 * While any of its `statuses` apply, it has an alert flag in its top row, between
 * the readout of its chart and its icon, so that the readout, which appears while
 * the chart is pointed at, comes before the flag and never covers it.
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
	detail,
	bar,
	chart,
	href,
	accent,
	statuses = [],
}: {
	subsystem: Subsystem;

	/** The name of what the tile shows. */
	label: string;

	/** The icon of what the tile shows, at its top right. */
	icon: IconName;

	/** The headline number. */
	value: ReactNode;

	/** The detail line under the number, which always takes two lines of room. */
	detail: ReactNode;

	/** The bar of how the number is spread, if there is one. */
	bar?: ReactNode;

	/** The chart along the bottom, if there is one. */
	chart?: ReactNode;

	href?: string;

	/**
	 * An accent along the top of the tile, for a tile that is in an error state:
	 * "failing", in orange, for failing messages, as on a handler's card, or "bad",
	 * in red, for something that has stopped. The tile says what is wrong in words
	 * too, so that the color is not the only sign.
	 */
	accent?: "failing" | "bad";

	/** The statuses that apply to what the tile shows, which its alert flag says. */
	statuses?: readonly Status[];
}) {
	const classes = cn(
		cardClasses,
		accent ? accentClasses[accent] : raisedClasses,
		"flex min-h-44 flex-col px-5 pt-5",
		// The room for the chart is only there if there is one.
		"transition-[padding-bottom] duration-400 motion-reduce:transition-none",
		chart ? "pb-16" : "pb-5",
		subsystemColors[subsystem],
		href !== undefined && !accent && linkedCardClasses,
		href !== undefined && accent && "no-underline hover:no-underline",
	);

	// What the chart says about the place on it that is pointed at, which is
	// shown beside the icon, and is kept for the moment that it takes to go.
	const [readout, setReadout] = useState<Readout>();
	const lastReadout = useRef(readout);
	if (readout) {
		lastReadout.current = readout;
	}
	const shownReadout = readout ?? lastReadout.current;

	const content = (
		<ReadoutContext.Provider value={setReadout}>
			<div className="flex items-center justify-between gap-3">
				<span className="self-start text-4xl leading-none font-bold tracking-[-0.02em] tabular-nums">
					{value}
				</span>
				<div className="flex items-center gap-2.5">
					<span
						aria-hidden="true"
						className={cn(
							"grid overflow-hidden text-right text-xs leading-snug whitespace-nowrap tabular-nums transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none",
							readout ? "max-w-44 opacity-100" : "max-w-0 opacity-0",
						)}
					>
						{shownReadout && (
							<>
								{shownReadout.subject !== undefined && (
									<span className="text-muted">{shownReadout.subject}</span>
								)}
								<span className="font-semibold text-(--subsystem)">
									{shownReadout.label !== undefined && (
										<span className="font-normal text-muted">
											{shownReadout.label}{" "}
										</span>
									)}
									{shownReadout.figure}
									{shownReadout.unit !== undefined && (
										<span className="font-normal text-muted">
											{" "}
											{shownReadout.unit}
										</span>
									)}
								</span>
								{shownReadout.age !== undefined && (
									<span className="text-muted">{shownReadout.age}</span>
								)}
							</>
						)}
					</span>
					<AlertFlag statuses={statuses} />
					<span className="flex-none text-(--subsystem)">
						<Icon name={icon} className="inline size-5 align-text-bottom" />
					</span>
				</div>
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
		</ReadoutContext.Provider>
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
 * How long a count set apart that has fallen to zero stays, in milliseconds,
 * before it shrinks away.
 */
const holdTime = 1000;

/**
 * What each kind of count set apart is: the color that it has, and what a screen
 * reader says of it.
 */
const setApart = {
	failing: {
		ink: "text-failing",
		spoken: (n: number) => ` and ${countOf(n, "message", "messages")} failing`,
	},
	"no-signal": {
		ink: "text-bad",
		spoken: (n: number) =>
			` and ${countOf(n, "application", "applications")} with no signal`,
	},
} as const;

/**
 * Failing is the number of messages that are pending and failing, which comes
 * after the number of those that are not, such as "24 +1", in orange. See
 * [SetApart].
 */
export function Failing({
	count,
	size,
}: {
	count: number;
	size: "headline" | "stat";
}) {
	return <SetApart kind="failing" count={count} size={size} />;
}

/**
 * NoSignal is the number of applications with no signal, which comes after the
 * number of those that are sending a signal, such as "94 +2", in red.
 * See [SetApart].
 */
export function NoSignal({ count }: { count: number }) {
	return <SetApart kind="no-signal" count={count} size="headline" />;
}

/**
 * SetApart is the part of a number that needs attention, which comes after the
 * rest of the number, such as the failing messages of "24 +1". It is smaller
 * than the number it follows, and has the color of its kind: orange for failing
 * messages, and red for what there is no signal from.
 *
 * It is spoken in full, because "+1" says little to a screen reader.
 *
 * When there are none it is not shown. When there begin to be some it grows from
 * nothing, larger than it will stay for a moment, and glitches as it grows, so
 * that the moment is noticed, while the growing keeps the eye on the number. When there stop being any it
 * ramps down to "+0", stays at that for [holdTime], and then shrinks away, so
 * that it doesn't make the page jump. If there are some again while it stays, it
 * stays, so that a count that goes up and down doesn't come and go. It does
 * neither of the others when the page loads with it in place, nor for a viewer
 * who asks for less motion.
 */
function SetApart({
	kind,
	count,
	size,
}: {
	kind: keyof typeof setApart;
	count: number;
	size: "headline" | "stat";
}) {
	// A count that is not current is no count.
	count = useCurrent(count);

	const [phase, setPhase] = useState<"gone" | "in" | "steady" | "zero" | "out">(
		count > 0 ? "steady" : "gone",
	);

	// The phase follows the count as it changes, as the count is drawn, rather
	// than in an effect afterwards, so that a count that is gone and stays at
	// none does no work at all, however many of them a view has.
	const [last, setLast] = useState(count);
	if (count !== last) {
		setLast(count);
		if (count > 0) {
			setPhase(phase === "zero" ? "steady" : phase === "steady" ? phase : "in");
		} else if (phase !== "gone" && phase !== "out") {
			setPhase("zero");
		}
	}

	// It stays at zero for a while, and then shrinks away.
	useEffect(() => {
		if (phase !== "zero") {
			return;
		}

		const timer = window.setTimeout(
			() => setPhase(prefersReducedMotion() ? "gone" : "out"),
			holdTime,
		);
		return () => window.clearTimeout(timer);
	}, [phase]);

	if (phase === "gone") {
		return null;
	}

	// The count is smaller than the number that it follows, and is raised so that
	// the tops of their digits are on one line, which is not a superscript. The
	// raise is the difference between the heights of the digits, which are 0.7 of
	// the font size, as a share of the count's own size. Its space is inside the
	// box that shrinks away, because padding on that box would stay behind when it
	// has shrunk and make the number beside it jump when the count goes.
	const figure = (
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
			onAnimationEnd={() =>
				setPhase((p) => (p === "out" ? "gone" : p === "in" ? "steady" : p))
			}
		>
			<span
				className={cn(
					"min-w-0 origin-left overflow-hidden font-semibold whitespace-nowrap",
					setApart[kind].ink,
				)}
			>
				<span className={cn("block", size === "headline" ? "pl-1.5" : "pl-1")}>
					<span aria-hidden="true">
						{phase === "in" && !prefersReducedMotion() ? (
							<Glitch
								text={`+${formatCompact(count)}`}
								distrust={1}
								burst={500}
							/>
						) : (
							<>
								+<Ramped value={count} format={formatCompact} />
							</>
						)}
					</span>
					{count > 0 && (
						<span className="sr-only">{setApart[kind].spoken(count)}</span>
					)}
				</span>
			</span>
		</span>
	);

	return figure;
}

/**
 * Alarm colors a figure red, because it says that something has stopped, such as
 * a headline of no live nodes. It is the figure that is red, and not the words
 * after it, so that the words still make a sentence with it: "0 cluster nodes". It
 * keeps the weight of the figure.
 */
export function Alarm({ children }: { children: ReactNode }) {
	return (
		<span className="text-bad transition-colors duration-300 motion-reduce:transition-none">
			{children}
		</span>
	);
}
