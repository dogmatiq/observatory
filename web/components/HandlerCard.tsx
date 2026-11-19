import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";
import { formatCompact, nounFor } from "../lib/format.ts";
import { useRamped } from "../lib/ramped.ts";
import { bindingSegments, handlerNodeSegments } from "../lib/segments.ts";
import type { HandlerData, HandlerSummary } from "../model.ts";
import { Icon, type IconName } from "./Icon.tsx";
import {
	cardClasses,
	Failing,
	linkedCardClasses,
	raisedClasses,
} from "./MetricTile.tsx";
import { Popover } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { NodeBar, StackedBar } from "./StackedBar.tsx";
import { handlerSubsystem, kindColors, subsystemColors } from "./subsystems.ts";

/**
 * What the popover of the icon that marks a handler that minimizes concurrency
 * says.
 */
const minimizesConcurrencyText =
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
			? "[box-shadow:inset_0_3px_0_var(--color-failing),var(--shadow-raised)]"
			: raisedClasses,
		// A card with a chart has room for it along the bottom. So does a card with
		// a bar and no chart, such as one whose nodes don't report the events that
		// the chart counts, so that its bar sits where the bars of the other cards
		// in its row do.
		"transition-[padding-bottom] duration-400 motion-reduce:transition-none",
		(history || hasBar(handler)) && "pb-15",
		href !== undefined && !failing && linkedCardClasses,
		href !== undefined && failing && "no-underline hover:no-underline",
	);

	const content = (
		<>
			<div className="flex min-w-0 items-center gap-3">
				<span className="flex min-w-0 flex-col">
					<Popover content={handler.name}>
						<span
							id={nameId}
							className="min-w-0 truncate text-sm font-bold tracking-[0.04em] uppercase"
						>
							<HandlerName name={handler.name} />
						</span>
					</Popover>
					<span className="flex min-w-0 items-center gap-3 text-2xs font-medium tracking-[0.08em] text-muted uppercase">
						<span className="min-w-0 truncate">
							{handler.disabled ? `${handler.kind}, disabled` : handler.kind}
							{handler.minimizesConcurrency && (
								<Popover content={minimizesConcurrencyText}>
									<span className="ml-2 inline-block cursor-help text-fg-soft">
										<Icon
											name="minimize-concurrency"
											className="inline size-3 align-[-2px]"
										/>
									</span>
								</Popover>
							)}
						</span>
					</span>
				</span>
				<Popover content={`${handler.kind} handler`}>
					<span
						className={cn(
							"ml-auto flex-none self-start",
							kindColors[handler.kind],
						)}
					>
						<Icon
							name={handler.kind}
							className="inline size-5 align-text-bottom"
						/>
					</span>
				</Popover>
			</div>
			<Summary handler={handler} summary={summary} />
			<Presence shape="fade" className="absolute inset-x-0 bottom-0">
				{history && (
					<Sparkline
						chart={history}
						// The chart has the color of the messages that it counts.
						className={cn(
							"h-10",
							subsystemColors[
								handler.charted === "commands" ? "queues" : "streams"
							],
						)}
					/>
				)}
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
		<article className={classes} aria-labelledby={nameId}>
			{content}
		</article>
	);
}

/**
 * hasBar returns whether a handler's card draws a bar of how its work is spread:
 * an aggregate's instances over the event streams, a process's over the queues of
 * its deadlines, or an integration's or a projection's work over the nodes. It
 * does if the nodes report what the bar is made from.
 */
function hasBar(handler: HandlerData): boolean {
	switch (handler.kind) {
		case "aggregate":
			return handler.summary.bindings !== undefined;
		case "process":
			return (
				handler.summary.schedulesDeadlines === true &&
				handler.summary.bindings !== undefined
			);
		case "integration":
		case "projection":
			return handler.nodes !== undefined;
	}
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
				id: "queued",
				icon,
				number: healthy,
				after: <Failing count={summary.failing} size="stat" />,
				// A message kind on its own means the ones that are pending.
				label: plural,
				title: `${plural} pending`,
				end: true,
			});
		}
	};

	const eventsPending = () => {
		const { unhandledEvents } = summary;
		if (unhandledEvents !== undefined) {
			stats.push({
				id: "events",
				icon: "event",
				number: unhandledEvents,
				label: "events",
				title: "events pending",
				end: true,
			});
		}
	};

	switch (handler.kind) {
		case "aggregate": {
			const { instances } = summary;
			if (instances !== undefined) {
				stats.push({
					id: "instances",
					number: instances,
					label: nounFor(instances, "instance", "instances"),
				});
			}

			const { activeInstances } = summary;
			if (activeInstances) {
				stats.push({
					id: "active",
					number: activeInstances.count,
					label: "active",
					title: activeInstances.title,
				});
			}

			queue("command", "commands");

			if (summary.bindings !== undefined) {
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
			}
			break;
		}

		case "process": {
			// The instances in progress are in the bindings, so there are none to
			// count if no node supports them.
			if (summary.bindings !== undefined) {
				const inProgress = summary.bindings.reduce(
					(n, b) => n + b.instances,
					0,
				);
				stats.push({
					id: "in-progress",
					number: inProgress,
					label: "in progress",
				});
			}

			eventsPending();

			if (summary.schedulesDeadlines) {
				queue("deadline", "deadlines");

				if (summary.bindings !== undefined) {
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
				{stats
					.filter((s) => !s.end)
					.map((s) => (
						<Stat key={s.id} {...s} />
					))}
				<div className="ml-auto flex gap-x-5">
					{stats
						.filter((s) => s.end)
						.map((s) => (
							<Stat key={s.id} {...s} />
						))}
				</div>
			</div>
			<Presence className="mt-auto">
				{bar && <div className="relative z-10 flex flex-col gap-4">{bar}</div>}
			</Presence>
		</>
	);
}

interface StatProps {
	/** Identifies the stat among the others of its card, whatever its label says. */
	id: string;

	/** The kind of thing that the number counts, shown as an icon before it. */
	icon?: IconName;

	/**
	 * The number that the stat is. It is faint when it is zero. It ramps to a new
	 * number, and is faint only once it has got to zero, and gets its color back as
	 * soon as it has left it.
	 */
	number: number;

	/** What follows the number, such as the count of those that fail. */
	after?: ReactNode;

	label: string;

	/** Explains the number, as a popover. */
	title?: string;

	/**
	 * True if the stat is aligned to the right of the card, with its label under
	 * it, which is how the numbers of messages are, so that the numbers of
	 * instances stay on the left.
	 */
	end?: boolean;
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

function Stat({ icon, number, after, label, title, end }: StatProps) {
	const shown = useRamped(number) ?? number;
	const zero = shown === 0;

	return (
		<Popover content={title}>
			<div
				className={cn(
					// A number with a popover has a chip behind it when it is pointed at,
					// as a link in the title bar does. Its padding is taken back by a
					// negative margin, so that the chip doesn't move the numbers.
					"-mx-2 -my-1 flex flex-col rounded-control px-2 py-1 transition-colors duration-150 hover:bg-sunk motion-reduce:transition-none",
					end && "items-end text-right",
				)}
			>
				<span
					className={cn(
						"text-2xl leading-[1.2] tabular-nums transition-[color,font-weight] duration-500 motion-reduce:transition-none",
						zero ? "font-medium text-faint" : "font-semibold",
					)}
				>
					{icon && (
						<Icon
							name={icon}
							className={cn(
								"mr-1.5 inline size-[18px] align-[-1px] transition-opacity duration-500 motion-reduce:transition-none",
								iconColors[icon],
								zero && "opacity-60",
							)}
						/>
					)}
					{formatCompact(shown)}
					{after}
				</span>
				<span className="text-xs text-muted">{label}</span>
			</div>
		</Popover>
	);
}

/**
 * HandlerName is the name of a handler, with its punctuation in the muted color,
 * the one of a number that is zero, so that the words of the name stand out.
 */
function HandlerName({ name }: { name: string }) {
	// Splitting on a group keeps what matched, which is at the odd positions.
	return name.split(/([^\p{L}\p{N}]+)/u).map((part, i) =>
		i % 2 === 1 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: the parts have no identity but their positions
			<span key={i} className="text-faint">
				{part}
			</span>
		) : (
			part
		),
	);
}
