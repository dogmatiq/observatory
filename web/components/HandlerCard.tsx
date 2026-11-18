import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";
import { formatCompact, nounFor } from "../lib/format.ts";
import { bindingSegments, handlerNodeSegments } from "../lib/segments.ts";
import type { HandlerData, HandlerSummary } from "../model.ts";
import { Icon, type IconName } from "./Icon.tsx";
import {
	cardClasses,
	Failing,
	linkedCardClasses,
	raisedClasses,
} from "./MetricTile.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { NodeBar, StackedBar } from "./StackedBar.tsx";
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
		// A card with a chart has room for it along the bottom. So does a card
		// with a bar of its nodes, which has no chart of its own yet, so that its
		// bar sits where the bars of the other cards in its row do.
		(history || handler.nodes !== undefined) && "pb-15",
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
					<span className="flex min-w-0 items-center gap-3 text-2xs font-medium tracking-[0.08em] text-muted uppercase">
						<span className="min-w-0 truncate">
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
	const stats: StatProps[] = [];
	let bar: ReactNode = null;

	// The number of commands or deadlines that are pending for the handler is
	// those that aren't failing, and then those that are, as in "2 +1", because
	// the failing ones are pending too, so that the two add up to all that is
	// pending. It recedes when it is zero. It is left out if the engine doesn't
	// report it.
	const queue = (icon: IconName, plural: string) => {
		const { queuedMessages } = summary;
		if (queuedMessages !== undefined) {
			const healthy = Math.max(0, queuedMessages - summary.failing);
			stats.push({
				tone: zeroOrNormal(healthy),
				icon,
				value: (
					<>
						{formatCompact(healthy)}
						<Failing count={summary.failing} size="stat" />
					</>
				),
				// A message kind on its own means the ones that are pending.
				label: plural,
				title: `${plural} pending`,
			});
		}
	};

	const eventsPending = () => {
		const { unhandledEvents } = summary;
		if (unhandledEvents !== undefined) {
			stats.push({
				tone: zeroOrNormal(unhandledEvents),
				icon: "event",
				value: formatCompact(unhandledEvents),
				label: "events",
				title: "events pending",
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

			queue("command", "commands");

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

			eventsPending();

			if (summary.schedulesDeadlines) {
				queue("deadline", "deadlines");

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
			queue("command", "commands");
			break;

		case "projection":
			eventsPending();
			break;
	}

	// An integration and a projection have no instances to spread, so their bar is
	// of the nodes that handled their messages, if the nodes say what they handled.
	if (
		(handler.kind === "integration" || handler.kind === "projection") &&
		handler.nodes !== undefined
	) {
		bar = (
			<NodeBar segments={handlerNodeSegments(handler.nodes, handler.kind)} />
		);
	}

	return (
		<>
			<div className="flex flex-wrap gap-x-5 gap-y-4">
				{stats.map((s) => (
					<Stat key={s.label} {...s} />
				))}
			</div>
			{bar && <div className="mt-auto flex flex-col gap-4">{bar}</div>}
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

	value: ReactNode;
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
