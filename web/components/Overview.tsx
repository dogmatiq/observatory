import {
	countOf,
	formatCompact,
	inUnit,
	nounFor,
	shortPer,
} from "../lib/format.ts";
import { heartbeatLevel } from "../lib/levels.ts";
import { useElapsed } from "../lib/live.tsx";
import {
	nodeSegments,
	queueSegments,
	streamSegments,
} from "../lib/segments.ts";
import type { Application, Counted, OverviewData } from "../model.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Figure } from "./Figure.tsx";
import { HandlerCard } from "./HandlerCard.tsx";
import { HeartbeatChart } from "./HeartbeatChart.tsx";
import { MessagesWaitingCard } from "./MessagesWaitingCard.tsx";
import { Alarm, Failing, MetricTile, Noun } from "./MetricTile.tsx";
import { describedClasses, Popover } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import { Ramped } from "./Ramped.tsx";
import { RateCard } from "./RateCard.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { NodeBar, StackedBar } from "./StackedBar.tsx";
import { useRate } from "./useRate.ts";

/**
 * Where the tiles and the cards of the overview link to. A tile or a card that
 * has no place to link to is not a link.
 */
export interface OverviewLinks {
	events?: string;
	queues?: string;
	cluster?: string;

	/** Returns where the card of the handler with the given key links to. */
	handler?: (key: string) => string;
}

/**
 * Overview is the cluster view's body: three tiles with the totals for the
 * cluster's events, queues and nodes, and a card for each of its handlers.
 *
 * Each tile and each card fails on its own, so one that cannot be drawn does not
 * take the others with it.
 */
export function Overview({
	application,
	data,
	links = {},
}: {
	application: Application;
	data: OverviewData;
	links?: OverviewLinks;
}) {
	return (
		<div className="grid gap-8">
			<section
				className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5"
				aria-label="Totals"
			>
				<Presence shape="fade">
					{data.events && (
						<ErrorBoundary>
							<EventsTile
								application={application}
								data={data.events}
								href={links.events}
							/>
						</ErrorBoundary>
					)}
				</Presence>
				<Presence shape="fade">
					{data.queues && (
						<ErrorBoundary>
							<QueuesTile
								application={application}
								data={data.queues}
								href={links.queues}
							/>
						</ErrorBoundary>
					)}
				</Presence>
				<ErrorBoundary>
					<ClusterTile data={data.cluster} href={links.cluster} />
				</ErrorBoundary>
			</section>
			<section
				className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5"
				aria-label="Handlers"
			>
				{data.handlers.map((handler) => (
					<ErrorBoundary key={handler.key}>
						<HandlerCard
							application={application}
							handler={handler}
							href={links.handler?.(handler.key)}
						/>
					</ErrorBoundary>
				))}
			</section>
		</div>
	);
}

/** What the card of the rate of the events tile says. */
export const eventRateWords = {
	kind: "Event rate",
	description: "The rate at which the application is recording new events",
};

/**
 * eventsAbout returns what the card of the events tile says, which is what the
 * part of the page is about. It says nothing of what the part shows, because
 * that depends on what the nodes of the cluster can tell it, and each element of
 * it has a popover of its own.
 */
export function eventsAbout(application: Application) {
	return (
		<p>
			This section shows information about the events and event streams in the{" "}
			<span className="font-semibold text-fg">{application.name}</span>{" "}
			application.
		</p>
	);
}

/**
 * EventsTile is the events tile, whose headline is the events per minute, or the
 * number of events if no node reports the rate.
 */
export function EventsTile({
	application,
	data,
	href,
}: {
	application: Application;
	data: NonNullable<OverviewData["events"]>;
	href: string | undefined;
}) {
	const { rate, streams } = data;
	const total = streams?.reduce((sum, s) => sum + s.size, 0) ?? 0;

	// A rate is a whole number of events per minute, or per hour or per day if it
	// is less than one per minute, and is lost, as the figure shows it, for a
	// minute at most.
	const { scaled, per, state } = useRate(rate?.perMinute);

	// The number and the words beside it both have the card of the rate.
	const rateCard = (
		<RateCard
			subsystem="streams"
			icon="event"
			kind={eventRateWords.kind}
			description={eventRateWords.description}
			state={state}
		/>
	);

	// The tile shows what the nodes can tell it. Its headline is the events per
	// minute, or, if no node supports that, how many events there are.
	return (
		<MetricTile
			subsystem="streams"
			label="Events"
			icon="event"
			about={eventsAbout(application)}
			href={href}
			value={
				rate ? (
					<Popover card content={rateCard}>
						<span>
							<Figure
								number={scaled?.amount}
								format={formatCompact}
								unit={per}
							/>
						</span>
					</Popover>
				) : (
					<Ramped value={total} format={formatCompact} />
				)
			}
			detail={
				rate ? (
					<>
						<Popover card content={rateCard}>
							<span className={describedClasses}>
								<Noun>{`events per ${per}`}</Noun>
							</span>
						</Popover>
						{streams && (
							<>
								{", "}
								<Ramped value={total} format={formatCompact} />
								{` ${nounFor(total, "event", "events")} in ${countOf(streams.length, "stream", "streams")}`}
							</>
						)}
					</>
				) : (
					<>
						<Noun>{nounFor(total, "event", "events")}</Noun>
						{` in ${countOf(streams?.length ?? 0, "stream", "streams")}`}
					</>
				)
			}
			bar={
				streams && (
					<StackedBar subsystem="streams" segments={streamSegments(streams)} />
				)
			}
			chart={
				data.history && (
					<Sparkline
						chart={data.history}
						className="h-12"
						describe={(value) => ({
							figure: formatCompact(inUnit(value, per)),
							unit: `events${shortPer[per]}`,
						})}
					/>
				)
			}
		/>
	);
}

/**
 * How the queues tile says what its rate counts, in the card of the rate, in the
 * words beside the headline and in the readout of its chart.
 */
export const countedWords: Record<
	Counted,
	{
		kind: string;
		description: string;
		note?: string;
		counted: string;
		unit: string;
	}
> = {
	removed: {
		kind: "Message removal rate",
		description:
			"The rate at which commands and deadlines are being removed from the queues",
		note: "It includes messages that were removed from the queue without being handled.",
		counted: "messages removed",
		unit: "removals",
	},
	handled: {
		kind: "Message handling rate",
		description:
			"The rate at which the application is handling commands and deadlines",
		note: "It does not include messages that were removed from the queue without being handled.",
		counted: "messages handled",
		unit: "handled",
	},
	"commands handled": {
		kind: "Command handling rate",
		description: "The rate at which the application is handling commands",
		note: "It does not include deadlines, or messages that were removed from the queue without being handled.",
		counted: "commands handled",
		unit: "commands",
	},
	"deadlines handled": {
		kind: "Deadline handling rate",
		description: "The rate at which the application is handling deadlines",
		note: "It does not include commands, or messages that were removed from the queue without being handled.",
		counted: "deadlines handled",
		unit: "deadlines",
	},
};

/**
 * queuesAbout returns what the card of the queues tile says, which is what the
 * part of the page is about, as [eventsAbout] does.
 */
export function queuesAbout(application: Application) {
	return (
		<p>
			This section shows information about the messages and queues in the{" "}
			<span className="font-semibold text-fg">{application.name}</span>{" "}
			application.
		</p>
	);
}

/**
 * QueuesTile is the queues tile, whose headline is the messages that wait in the
 * queues, or the rate at which they get through the queues, if no node reports how
 * many wait, which is the messages that handlers have handled, or those that are
 * removed, or only some kinds of the first. See [countedWords].
 */
export function QueuesTile({
	application,
	data,
	href,
}: {
	application: Application;
	data: NonNullable<OverviewData["queues"]>;
	href: string | undefined;
}) {
	const { queues, throughput } = data;
	const messages = queues?.reduce((sum, q) => sum + q.size, 0) ?? 0;

	// The headline is the messages that aren't failing, and then those that are,
	// as in "24 +1", because the failing ones are part of the queues' messages. If
	// no node supports the messages in queues, it is the messages that are removed
	// per minute.
	const healthy = Math.max(0, messages - data.failing);

	// The rate of removal is a whole number per minute, or per hour or per day if
	// it is less than one per minute, as the rate of events is.
	const { scaled, per, state } = useRate(throughput?.perMinute);

	// What the rate counts, which is the messages that handlers have handled, or
	// those that are removed from the queues, or only the commands, or only the
	// deadlines, that handlers have handled. The card says which, because it is
	// built from the statistics of the nodes.
	const counted = throughput?.of ?? "removed";
	const wording = countedWords[counted];

	// The number and the words beside it both have the card of the rate.
	const rateCard = (
		<RateCard
			subsystem="queues"
			icon="message"
			kind={wording.kind}
			description={wording.description}
			note={wording.note}
			state={state}
		/>
	);

	const rate = (
		<Figure number={scaled?.amount} format={formatCompact} unit={per} />
	);

	return (
		<MetricTile
			subsystem="queues"
			label="Queues"
			icon="message"
			about={queuesAbout(application)}
			href={href}
			value={
				queues ? (
					<Popover card content={<MessagesWaitingCard />}>
						<span>
							<Ramped value={healthy} format={formatCompact} />
							<Failing count={data.failing} size="headline" />
						</span>
					</Popover>
				) : (
					<Popover card content={rateCard}>
						<span>{rate}</span>
					</Popover>
				)
			}
			detail={
				queues ? (
					<>
						<Noun>{nounFor(messages, "message", "messages")}</Noun>
						{` in ${countOf(queues.length, "queue", "queues")}`}
						{throughput && (
							<>
								{", "}
								<Popover card content={rateCard}>
									<span className={describedClasses}>
										{rate}
										{shortPer[per]}
									</span>
								</Popover>
							</>
						)}
					</>
				) : (
					<Popover card content={rateCard}>
						<span className={describedClasses}>
							<Noun>{`${wording.counted} per ${per}`}</Noun>
						</span>
					</Popover>
				)
			}
			bar={
				queues && (
					<StackedBar subsystem="queues" segments={queueSegments(queues)} />
				)
			}
			chart={
				data.history && (
					<Sparkline
						chart={data.history}
						className="h-12"
						describe={(value) => ({
							figure: formatCompact(inUnit(value, per)),
							unit: `${wording.unit}${shortPer[per]}`,
						})}
					/>
				)
			}
		/>
	);
}

function ClusterTile({
	data,
	href,
}: {
	data: OverviewData["cluster"];
	href: string | undefined;
}) {
	const workloads = data.nodes.reduce((sum, n) => sum + n.workloads, 0);

	// The levels drain between updates, so they are worked out again with each
	// frame from the time that has passed.
	const elapsed = useElapsed();
	const sections = data.nodes.map((n) => ({
		id: n.id,
		level: heartbeatLevel(
			n.heartbeats.map((ago) => -ago),
			elapsed,
		),
	}));

	return (
		<MetricTile
			subsystem="cluster"
			label="Cluster"
			icon="cluster"
			href={href}
			value={<Ramped value={data.nodes.length} format={String} />}
			detail={
				data.nodes.length > 0 ? (
					<>
						<Noun>
							{nounFor(data.nodes.length, "cluster node", "cluster nodes")}
						</Noun>
						{`, ${countOf(workloads, "workload", "workloads")}`}
					</>
				) : (
					<Alarm>no live nodes</Alarm>
				)
			}
			bar={<NodeBar segments={nodeSegments(data.nodes)} />}
			chart={<HeartbeatChart sections={sections} />}
		/>
	);
}
