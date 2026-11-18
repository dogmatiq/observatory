import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { countOf, formatCompact } from "../lib/format.ts";
import { Icon, type IconName } from "./Icon.tsx";
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

	/** The bar of how the number is spread. */
	bar: ReactNode;

	/** The chart along the bottom. */
	chart: ReactNode;

	href?: string;
}) {
	const classes = cn(
		cardClasses,
		raisedClasses,
		"flex min-h-44 flex-col px-5 pt-5 pb-16",
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
			<div className="relative z-10 mt-3">{bar}</div>
			{chart}
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
 * Failing is the number of messages in a backlog that are failing, which comes
 * after the number of those that are not, such as "24 +1". It is red, and
 * smaller than the number it follows by the given amount, in ems.
 *
 * It is spoken in full, because "+1" says little to a screen reader.
 */
export function Failing({
	count,
	size,
}: {
	count: number;
	size: "headline" | "stat";
}) {
	return (
		<span
			className={cn(
				"font-semibold text-bad",
				size === "headline"
					? "ml-1.5 align-[0.15em] text-[0.62em]"
					: "ml-1 align-[0.05em] text-[0.78em]",
			)}
		>
			<span aria-hidden="true">{`+${formatCompact(count)}`}</span>
			<span className="sr-only">
				{` and ${countOf(count, "message", "messages")} failing`}
			</span>
		</span>
	);
}

/**
 * Alarm marks a number of things that need attention.
 */
export function Alarm({ children }: { children: ReactNode }) {
	return <span className="font-semibold text-bad">{children}</span>;
}
