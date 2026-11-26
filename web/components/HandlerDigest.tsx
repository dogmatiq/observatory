import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";
import { Trusted, useCurrent } from "../lib/distrust.tsx";
import { formatCompact, nounFor, scaleRate, shortPer } from "../lib/format.ts";
import { useRamped } from "../lib/ramped.ts";
import { ReadoutContext } from "../lib/readout.tsx";
import { bindingSegments, handlerNodeSegments } from "../lib/segments.ts";
import type { HandlerData, HandlerSummary } from "../model.ts";
import { AlertFlag } from "./AlertFlag.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import {
	accentClasses,
	cardClasses,
	Failing,
	raisedClasses,
} from "./MetricTile.tsx";
import { NameLink } from "./NameLink.tsx";
import { Popover, Tooltip } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import { ReadoutLines, useReadoutPlace } from "./ReadoutLines.tsx";
import { Sky } from "./Sky.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { NodeBar, StackedBar } from "./StackedBar.tsx";
import { someNodesReport } from "./statuses.ts";
import { handlerSubsystem, kindColors, subsystemColors } from "./subsystems.ts";

/**
 * What the popover of the icon that marks a handler that minimizes concurrency
 * says.
 */
const minimizesConcurrencyText =
	"Minimize concurrency: this handler's configuration instructs the engine to attempt to process messages one at a time, minimizing conflicts and/or contention.";

/**
 * What the chart of a handler's digest counts, by the kind of handler, for the
 * words of the sky that is there if no node reports it.
 */
const chartedWords: Record<HandlerData["kind"], string> = {
	aggregate: "the events that this handler records",
	process: "the events that this handler handles",
	integration: "the messages that this handler handles",
	projection: "the events that this handler handles",
};

/**
 * HandlerDigest is the digest of one handler, on the cluster view. It shows the
 * handler's name and kind, the numbers that matter for that kind of handler, and
 * how many of its messages are failing, and, while only some of the cluster's
 * nodes report it, an alert flag that says so. Along its bottom are a bar of how its
 * instances are spread, if it has instances, and a chart of the events that it
 * records or handles per minute, if it has one. Pointing at the bar or the chart
 * shows what is there beside the kind icon, over the end of the name.
 *
 * The digest is an article named by the handler's name. If it has an `href`, the
 * name is a link to the handler's page, and is the only part of the digest that
 * is.
 */
export function HandlerDigest({
	handler,
	href,
}: {
	handler: HandlerData;
	href?: string;
}) {
	const nameId = useId();

	// What the chart or the bar says about the place on it that is pointed at,
	// which is shown beside the kind icon, and is kept for the moment that it
	// takes to go.
	const { readout, shown, setReadout } = useReadoutPlace();
	const charted = handler.charted ?? "events";

	// The chart has the color of the messages that it counts.
	const chartSubsystem = charted === "commands" ? "queues" : "streams";
	const { summary, history } = handler;
	const failing = useCurrent(summary.failing) > 0;

	const classes = cn(
		cardClasses,
		"flex flex-col gap-5 p-5",
		subsystemColors[handlerSubsystem(handler.kind)],
		// A digest with failing messages has an accent along its top.
		failing ? accentClasses.failing : raisedClasses,
		// A digest has room along the bottom for its chart, or, if no node reports what
		// the chart counts, for the sky that is there instead, so that the bars of
		// the digests in a row are where they are.
		"group/digest pb-15",
	);

	const content = (
		<>
			<div className="flex min-w-0 items-center gap-3">
				{/* On a screen that is touched, the name and the kind are one place to
				tap, for the link of the name. */}
				<span className="relative flex min-w-0 flex-col">
					{href === undefined ? (
						<Tooltip text={handler.name}>
							<span
								id={nameId}
								className="min-w-0 truncate text-sm font-bold tracking-[0.04em] uppercase"
							>
								<HandlerName name={handler.name} />
							</span>
						</Tooltip>
					) : (
						<NameLink
							href={href}
							className="text-sm font-bold tracking-[0.04em] uppercase"
						>
							<Tooltip text={handler.name}>
								<span id={nameId} className="min-w-0 truncate">
									<HandlerName name={handler.name} />
								</span>
							</Tooltip>
						</NameLink>
					)}
					<span className="flex min-w-0 items-center gap-3 text-2xs font-medium tracking-[0.08em] text-muted uppercase">
						<span className="min-w-0 truncate">
							{handler.disabled ? `${handler.kind}, disabled` : handler.kind}
							{handler.minimizesConcurrency && (
								<Popover content={minimizesConcurrencyText}>
									<span className="ml-2 inline-block text-fg-soft">
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
				{/* The alert flag is to the left of the kind icon, where a compact
				digest has its flag, and clear of the chevron after a linked name. The
				readout floats over the end of the name, which keeps its size, with a
				short fade on its left edge, so that nothing on the digest moves. */}
				<span className="relative ml-auto flex flex-none items-start gap-2.5 self-start">
					<span
						aria-hidden="true"
						className={cn(
							"pointer-events-none absolute top-0 right-full mr-2.5 grid bg-panel pl-6 text-right text-xs leading-snug whitespace-nowrap tabular-nums [mask-image:linear-gradient(to_right,transparent,black_1.25rem)] transition-opacity duration-200 ease-out motion-reduce:transition-none",
							readout ? "opacity-100" : "opacity-0",
						)}
					>
						{shown && <ReadoutLines readout={shown} />}
					</span>
					<AlertFlag
						statuses={handler.coverage === undefined ? [] : [someNodesReport]}
					/>
					<span className={kindColors[handler.kind]}>
						<Icon
							name={handler.kind}
							className="inline size-5 align-text-bottom"
						/>
					</span>
				</span>
			</div>
			<Summary handler={handler} summary={summary} />
			<Presence shape="fade" className="absolute inset-x-0 bottom-0">
				{history ? (
					<Sparkline
						chart={history}
						describe={(value) => {
							const { amount, per } = scaleRate(value);
							return {
								figure: formatCompact(amount),
								unit: `${charted}${shortPer[per]}`,
								subsystem: chartSubsystem,
							};
						}}
						className={cn("h-10", subsystemColors[chartSubsystem])}
					/>
				) : (
					<Sky missing={chartedWords[handler.kind]} height={60} />
				)}
			</Presence>
		</>
	);

	return (
		<article className={classes} aria-labelledby={nameId}>
			<ReadoutContext.Provider value={setReadout}>
				{content}
			</ReadoutContext.Provider>
		</article>
	);
}

/**
 * Summary is the numbers of a handler's digest, and the bar and the failing
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
	/** Identifies the stat among the others of its digest, whatever its label says. */
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

	/**
	 * True if the stat is aligned to the right of the digest, with its label under
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

function Stat({ icon, number, after, label, end }: StatProps) {
	const current = useCurrent(number);
	const shown = useRamped(current) ?? current;
	const zero = shown === 0;

	return (
		<div className={cn("flex flex-col", end && "items-end text-right")}>
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
				<Trusted text={formatCompact(shown)} />
				{after}
			</span>
			<span className="text-xs text-muted">{label}</span>
		</div>
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
