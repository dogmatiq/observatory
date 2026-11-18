import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";
import { countOf, formatCompact, nounFor } from "../lib/format.ts";
import { bindingSegments } from "../lib/segments.ts";
import type { HandlerData, HandlerSummary } from "../model.ts";
import { Icon, type IconName } from "./Icon.tsx";
import {
	cardClasses,
	linkedCardClasses,
	raisedClasses,
} from "./MetricTile.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { StackedBar } from "./StackedBar.tsx";
import { handlerSubsystem, kindColors, subsystemColors } from "./subsystems.ts";

/**
 * The tooltip of the icon that marks a handler that minimizes concurrency.
 */
const minimizesConcurrencyTitle =
	"Minimize concurrency: this handler's configuration instructs the engine to attempt to process messages one at a time, minimizing conflicts and/or contention.";

/**
 * HandlerCard is the card of one handler, on the cluster view. It shows the
 * handler's name and kind, the numbers that matter for that kind of handler, and
 * how many of its messages are failing. Along its bottom are a bar of how its
 * instances are spread, if it has instances, and a chart of the events that it
 * records or handles per minute, if it has one.
 *
 * The card is a link if it has an `href`, and is outlined when pointed at,
 * unless it has failing messages. Otherwise it is an article named by the
 * handler's name, and nothing happens when it is pointed at.
 */
export function HandlerCard({
	handler,
	href,
}: {
	handler: HandlerData;
	href?: string;
}) {
	const nameId = useId();
	const { summary, history } = handler;
	const failing = summary.failing > 0;

	const classes = cn(
		cardClasses,
		"flex flex-col gap-5 p-5",
		subsystemColors[handlerSubsystem(handler.kind)],
		// A card with failing messages has an accent along its top.
		failing
			? "[box-shadow:inset_0_3px_0_var(--color-bad),var(--shadow-raised)]"
			: raisedClasses,
		// A card with a chart has room for it along the bottom.
		history && "pb-15",
		href !== undefined && !failing && linkedCardClasses,
		href !== undefined && failing && "no-underline hover:no-underline",
	);

	const content = (
		<>
			<div className="flex min-w-0 items-center gap-3">
				<span className="flex min-w-0 flex-col">
					<span
						id={nameId}
						className="min-w-0 truncate text-sm font-bold tracking-[0.04em] uppercase"
						title={handler.name}
					>
						{handler.name}
					</span>
					<span className="text-2xs font-medium tracking-[0.08em] text-muted uppercase">
						{handler.disabled ? `${handler.kind}, disabled` : handler.kind}
						{handler.minimizesConcurrency && (
							<span
								className="ml-2 inline-block cursor-help text-fg-soft"
								title={minimizesConcurrencyTitle}
							>
								<Icon
									name="minimize-concurrency"
									className="inline size-3 align-[-2px]"
								/>
							</span>
						)}
					</span>
				</span>
				<span
					className={cn(
						"ml-auto flex-none self-start",
						kindColors[handler.kind],
					)}
					title={`${handler.kind} handler`}
				>
					<Icon
						name={handler.kind}
						className="inline size-5 align-text-bottom"
					/>
				</span>
			</div>
			<Summary handler={handler} summary={summary} />
			{history && (
				<Sparkline
					chart={history}
					className={cn("h-10", subsystemColors.streams)}
				/>
			)}
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
		<article className={classes} aria-labelledby={nameId}>
			{content}
		</article>
	);
}

/**
 * Summary is the numbers of a handler's card, and the bar and the failing
 * messages under them. Which numbers a handler has depends on its kind.
 */
function Summary({
	handler,
	summary,
}: {
	handler: HandlerData;
	summary: HandlerSummary;
}) {
	const failing = summary.failing > 0;
	const stats: StatProps[] = [];
	let bar: ReactNode = null;

	// The number of commands or deadlines that wait in the handler's queue is red
	// when messages are failing, and recedes when it is zero. It is left out if
	// the engine doesn't report it.
	const queue = (icon: IconName, label: string) => {
		const { queuedMessages } = summary;
		if (queuedMessages !== undefined) {
			stats.push({
				tone: failing ? "bad" : zeroOrNormal(queuedMessages),
				icon,
				value: formatCompact(queuedMessages),
				label,
			});
		}
	};

	const eventBacklog = () => {
		const { unhandledEvents } = summary;
		if (unhandledEvents !== undefined) {
			stats.push({
				tone: zeroOrNormal(unhandledEvents),
				icon: "event",
				value: formatCompact(unhandledEvents),
				label: "event backlog",
			});
		}
	};

	switch (handler.kind) {
		case "aggregate": {
			const { instances } = summary;
			if (instances !== undefined) {
				stats.push({
					tone: zeroOrNormal(instances),
					value: formatCompact(instances),
					label: nounFor(instances, "instance", "instances"),
				});
			}

			const { activeInstances } = summary;
			if (activeInstances) {
				stats.push({
					tone: zeroOrNormal(activeInstances.count),
					value: formatCompact(activeInstances.count),
					label: "active",
					title: activeInstances.title,
				});
			}

			queue("command", "command backlog");

			bar = (
				<StackedBar
					subsystem="streams"
					segments={bindingSegments(
						summary.bindings,
						"event stream",
						"event streams",
					)}
				/>
			);
			break;
		}

		case "process": {
			const inProgress = summary.bindings.reduce((n, b) => n + b.instances, 0);
			stats.push({
				tone: zeroOrNormal(inProgress),
				value: formatCompact(inProgress),
				label: "in progress",
			});

			eventBacklog();

			if (summary.schedulesDeadlines) {
				queue(
					"deadline",
					nounFor(summary.queuedMessages ?? 0, "deadline", "deadlines"),
				);

				bar = (
					<StackedBar
						subsystem="queues"
						segments={bindingSegments(
							summary.bindings,
							"deadline queue",
							"deadline queues",
						)}
					/>
				);
			}

			break;
		}

		case "integration":
			queue("command", "command backlog");
			break;

		case "projection":
			eventBacklog();
			break;
	}

	return (
		<>
			<div className="flex flex-wrap gap-x-5 gap-y-4">
				{stats.map((s) => (
					<Stat key={s.label} {...s} />
				))}
			</div>
			{(failing || bar) && (
				<div className="mt-auto flex flex-col gap-4">
					{failing && (
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
							<span className="inline-flex items-center gap-2 font-semibold text-bad">
								<span className="size-1.5 flex-none rounded-full bg-current" />
								{`${countOf(summary.failing, "message", "messages")} failing`}
							</span>
						</div>
					)}
					{bar}
				</div>
			)}
		</>
	);
}

function zeroOrNormal(n: number): Tone {
	return n === 0 ? "zero" : "normal";
}

/**
 * How a number stands out: red when messages are failing, faint when it is
 * zero, and the page's text color otherwise.
 */
type Tone = "normal" | "zero" | "bad";

interface StatProps {
	tone: Tone;

	/** The kind of thing that the number counts, shown as an icon before it. */
	icon?: IconName;

	value: string;
	label: string;

	/** Explains the number, as a tooltip. */
	title?: string;
}

/**
 * The color of the icon before a number, by what it counts: the color of the
 * subsystem that the thing belongs to.
 */
const iconColors: Partial<Record<IconName, string>> = {
	command: "text-queues",
	deadline: "text-queues",
	event: "text-streams",
};

function Stat({ tone, icon, value, label, title }: StatProps) {
	return (
		<div className="flex flex-col" title={title}>
			<span
				className={cn(
					"text-2xl leading-[1.2] tabular-nums",
					tone === "zero" ? "font-medium text-faint" : "font-semibold",
					tone === "bad" && "text-bad",
				)}
			>
				{icon && (
					<Icon
						name={icon}
						className={cn(
							"mr-1.5 inline size-[18px] align-[-1px]",
							iconColors[icon],
							tone === "zero" && "opacity-60",
						)}
					/>
				)}
				{value}
			</span>
			<span className="text-xs text-muted">{label}</span>
		</div>
	);
}
