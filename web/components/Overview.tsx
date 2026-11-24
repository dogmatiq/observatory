import { Covered, Distrusted, useCurrent } from "../lib/distrust.tsx";
import { formatCompact, inUnit, nounFor, shortPer } from "../lib/format.ts";
import { heartbeatLevel } from "../lib/levels.ts";
import { useElapsed } from "../lib/live.tsx";
import {
	nodeSegments,
	queueSegments,
	streamSegments,
} from "../lib/segments.ts";
import type { Application, Counted, OverviewData } from "../model.ts";
import { ApplicationName } from "./ApplicationName.tsx";
import { NodesCard, WorkloadsCard } from "./ClusterCards.tsx";
import { EngineCard } from "./EngineCard.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Figure } from "./Figure.tsx";
import { HandlerDigest } from "./HandlerDigest.tsx";
import { HeartbeatChart } from "./HeartbeatChart.tsx";
import { Identifier } from "./Identifier.tsx";
import { MessagesWaitingCard } from "./MessagesWaitingCard.tsx";
import { Alarm, Failing, MetricTile, Noun } from "./MetricTile.tsx";
import { describedClasses, Popover } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import { partialStatus } from "./partial.ts";
import { Ramped } from "./Ramped.tsx";
import { RateCard, type RateWords } from "./RateCard.tsx";
import { Sky } from "./Sky.tsx";
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
	engine?: string;

	/** Returns where the card of the handler with the given key links to. */
	handler?: (key: string) => string;
}

/**
 * Totals is the three tiles of the overview, with the totals for the cluster's
 * events, queues and nodes. A tile whose metrics no node supports is not there.
 *
 * The tiles fill each row, so a row never ends in a gap: when all three fit on one
 * row, they share it; when two fit, the third has a row to itself, across its whole
 * width; and when one fits, they are stacked. Two tiles share a row, or are
 * stacked, in the same way.
 *
 * If the cluster is `down`, the numbers of the events and queues tiles are what they
 * were when a node last reported, and are drawn as not to be trusted, so that the
 * tiles keep their shape for when a node reports again. The cluster tile is not
 * blurred, because it knows that no node is live.
 */
export function Totals({
	application,
	data,
	links = {},
	clusterId,
	down = false,
}: {
	application: Application;
	data: OverviewData;
	links?: OverviewLinks;
	clusterId?: string;
	down?: boolean;
}) {
	return (
		<section
			className="flex flex-wrap gap-5 [&>*]:min-w-0 [&>*]:flex-[1_1_260px]"
			aria-label="Totals"
		>
			<Presence shape="fade">
				{data.events && (
					<ErrorBoundary>
						<Distrusted value={down}>
							<Covered coverage={data.events.coverage ?? 1}>
								<EventsTile
									application={application}
									data={data.events}
									href={links.events}
								/>
							</Covered>
						</Distrusted>
					</ErrorBoundary>
				)}
			</Presence>
			<Presence shape="fade">
				{data.queues && (
					<ErrorBoundary>
						<Distrusted value={down}>
							<Covered coverage={data.queues.coverage ?? 1}>
								<QueuesTile
									application={application}
									data={data.queues}
									href={links.queues}
								/>
							</Covered>
						</Distrusted>
					</ErrorBoundary>
				)}
			</Presence>
			{data.cluster && (
				<ErrorBoundary>
					<ClusterTile
						application={application}
						clusterId={clusterId}
						data={data.cluster}
						href={links.cluster}
					/>
				</ErrorBoundary>
			)}
			{data.engine && (
				<ErrorBoundary>
					<EngineTile
						application={application}
						data={data.engine}
						href={links.engine}
					/>
				</ErrorBoundary>
			)}
		</section>
	);
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
	clusterId,
	down = false,
}: {
	application: Application;
	data: OverviewData;
	links?: OverviewLinks;

	/** The ID of the cluster, which the card of the cluster tile gives. */
	clusterId?: string;

	/** True if no node of the cluster is reporting, so its numbers are not trusted. */
	down?: boolean;
}) {
	return (
		<div className="grid gap-8">
			<Totals
				application={application}
				data={data}
				links={links}
				clusterId={clusterId}
				down={down}
			/>
			<section
				className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5"
				aria-label="Handlers"
			>
				{data.handlers.map((handler) => (
					<ErrorBoundary key={handler.key}>
						<Distrusted value={down}>
							<Covered coverage={handler.coverage ?? 1}>
								<HandlerDigest
									application={application}
									handler={handler}
									href={links.handler?.(handler.key)}
								/>
							</Covered>
						</Distrusted>
					</ErrorBoundary>
				))}
			</section>
		</div>
	);
}

/** What the card of the rate of the events tile says. */
export const eventRateWords: RateWords = {
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
			<ApplicationName application={application} />.
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
	const { rate, streams, oneStream } = data;
	const total = streams?.reduce((sum, s) => sum + s.size, 0) ?? 0;

	// An engine that appends every event to one stream has no streams to count,
	// and no spread of events across them to show.
	const inStreams =
		streams === undefined || oneStream ? null : (
			<>
				{" in "}
				<Ramped value={streams.length} format={String} />
				{` ${nounFor(streams.length, "stream", "streams")}`}
			</>
		);

	// A rate is a whole number of events per minute, or per hour or per day if it
	// is less than one per minute, and is lost, as the figure shows it, for a
	// minute at most.
	const { scaled, per, state } = useRate(rate?.perMinute);

	// The number and its detail line both have the card of the rate.
	const rateCard = (
		<RateCard
			subsystem="streams"
			icon="event"
			words={eventRateWords}
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
			aboutStatus={data.coverage === undefined ? undefined : partialStatus}
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
								{` ${nounFor(total, "event", "events")}`}
								{inStreams}
							</>
						)}
					</>
				) : (
					<>
						<Noun>{nounFor(total, "event", "events")}</Noun>
						{oneStream ? null : (
							<>
								{" in "}
								<Ramped value={streams?.length ?? 0} format={String} />
								{` ${nounFor(streams?.length ?? 0, "stream", "streams")}`}
							</>
						)}
					</>
				)
			}
			bar={
				streams &&
				!oneStream && (
					<StackedBar subsystem="streams" segments={streamSegments(streams)} />
				)
			}
			chart={
				data.history ? (
					<Sparkline
						chart={data.history}
						className="h-12"
						describe={(value) => ({
							figure: formatCompact(inUnit(value, per)),
							unit: `events${shortPer[per]}`,
						})}
					/>
				) : (
					<Sky missing="the rate of events" />
				)
			}
		/>
	);
}

/**
 * How the queues tile says what its rate counts, in the card of the rate, in the
 * detail line and in the readout of its chart.
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
			<ApplicationName application={application} />.
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
	const { queues, throughput, oneQueue } = data;
	const messages = queues?.reduce((sum, q) => sum + q.size, 0) ?? 0;

	// The headline is the messages that aren't failing, and then those that are,
	// as in "24 +1", because the failing ones are part of the queues' messages. If
	// no node supports the messages in queues, it is the messages that are removed
	// per minute.
	const failing = useCurrent(data.failing);
	const healthy = Math.max(0, messages - failing);

	// The rate of removal is a whole number per minute, or per hour or per day if
	// it is less than one per minute, as the rate of events is.
	const { scaled, per, state } = useRate(throughput?.perMinute);

	// What the rate counts, which is the messages that handlers have handled, or
	// those that are removed from the queues, or only the commands, or only the
	// deadlines, that handlers have handled. The card says which, because it is
	// built from the statistics of the nodes.
	const counted = throughput?.of ?? "removed";
	const wording = countedWords[counted];

	// The number and its detail line both have the card of the rate.
	const rateCard = (
		<RateCard subsystem="queues" icon="message" words={wording} state={state} />
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
			aboutStatus={data.coverage === undefined ? undefined : partialStatus}
			href={href}
			accent={failing > 0 ? "failing" : undefined}
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
						{/* An engine that keeps every message in one queue has no queues to
						count, and no spread of messages across them to show. */}
						{!oneQueue && (
							<>
								{" in "}
								<Ramped value={queues.length} format={String} />
								{` ${nounFor(queues.length, "queue", "queues")}`}
							</>
						)}
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
				queues &&
				!oneQueue && (
					<StackedBar subsystem="queues" segments={queueSegments(queues)} />
				)
			}
			chart={
				data.history ? (
					<Sparkline
						chart={data.history}
						className="h-12"
						describe={(value) => ({
							figure: formatCompact(inUnit(value, per)),
							unit: `${wording.unit}${shortPer[per]}`,
						})}
					/>
				) : (
					<Sky missing="the rate at which messages get through the queues" />
				)
			}
		/>
	);
}

/**
 * clusterAbout returns what the card of the cluster tile says, which is what the
 * part of the page is about, as [eventsAbout] does.
 */
export function clusterAbout(application: Application) {
	return (
		<p>
			This section shows information about the nodes of the cluster that runs
			the <ApplicationName application={application} />.
		</p>
	);
}

/**
 * ClusterTile is the cluster tile, whose headline is the number of nodes that are
 * live, with the workloads that they own, and a bar of how those are shared. If
 * no node says that it reports its workloads, the tile leaves them out, and has
 * no bar.
 */
export function ClusterTile({
	application,
	clusterId,
	data,
	href,
}: {
	application: Application;
	clusterId?: string;
	data: NonNullable<OverviewData["cluster"]>;
	href: string | undefined;
}) {
	const divided = data.reportsWorkloads === true;

	// While a node doesn't report its workloads and others do, the number of
	// workloads is of the nodes that do, which covers only some of the cluster.
	const reporting = data.nodes.filter((n) => n.workloads !== undefined).length;
	const coverage = data.nodes.length === 0 ? 1 : reporting / data.nodes.length;
	const workloads = data.nodes.reduce((sum, n) => sum + (n.workloads ?? 0), 0);

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

	// The number and its detail line both have the card of the nodes.
	const nodesCard = <NodesCard live={data.nodes.length} />;

	return (
		<MetricTile
			subsystem="cluster"
			label="Cluster"
			icon="cluster"
			about={clusterAbout(application)}
			identifier={
				clusterId === undefined ? undefined : (
					<Identifier id={clusterId} of="cluster" />
				)
			}
			href={href}
			accent={data.nodes.length === 0 ? "bad" : undefined}
			value={
				<Popover card content={nodesCard}>
					<span>
						{data.nodes.length === 0 ? (
							<Alarm>
								<Ramped value={0} format={String} />
							</Alarm>
						) : (
							<Ramped value={data.nodes.length} format={String} />
						)}
					</span>
				</Popover>
			}
			detail={
				<>
					<Popover card content={nodesCard}>
						<span className={describedClasses}>
							<Noun>
								{nounFor(data.nodes.length, "cluster node", "cluster nodes")}
							</Noun>
						</span>
					</Popover>
					{divided && (
						<>
							{", "}
							<Popover card content={<WorkloadsCard whole={coverage === 1} />}>
								<span className={describedClasses}>
									<Covered coverage={coverage}>
										<Figure number={workloads} format={String} />
									</Covered>{" "}
									{nounFor(workloads, "workload", "workloads")}
								</span>
							</Popover>
						</>
					)}
				</>
			}
			// The bar is of how the workloads are shared, so an engine that doesn't
			// divide its work has none. A cluster with no live node has the empty
			// track of a bar, because its engine can't be known.
			bar={
				divided || data.nodes.length === 0 ? (
					<NodeBar segments={nodeSegments(data.nodes)} />
				) : undefined
			}
			chart={<HeartbeatChart sections={sections} />}
		/>
	);
}

/**
 * engineAbout returns what the card of the engine tile says, which is what the
 * part of the page is about, as [clusterAbout] does.
 */
export function engineAbout(application: Application) {
	return (
		<p>
			This section shows information about the engine that runs the{" "}
			<ApplicationName application={application} />.
		</p>
	);
}

/**
 * EngineTile is the tile of an engine that doesn't cluster, which always runs as a
 * single process, in place of the cluster tile. Its headline says whether the
 * process is online, which is whether it is reporting, and its chart is the process's heartbeat. It has no bar,
 * because there is nothing to share between processes.
 */
export function EngineTile({
	application,
	data,
	href,
}: {
	application: Application;
	data: NonNullable<OverviewData["engine"]>;
	href: string | undefined;
}) {
	const { node } = data;

	// The level drains between updates, so it is worked out again with each frame
	// from the time that has passed.
	const elapsed = useElapsed();
	const sections =
		node === undefined
			? []
			: [
					{
						id: node.id,
						level: heartbeatLevel(
							node.heartbeats.map((ago) => -ago),
							elapsed,
						),
					},
				];

	const card = <EngineCard online={node !== undefined} />;

	return (
		<MetricTile
			subsystem="cluster"
			label="Engine"
			icon="engine"
			about={engineAbout(application)}
			identifier={
				node === undefined ? undefined : <Identifier id={node.id} of="engine" />
			}
			href={href}
			accent={node === undefined ? "bad" : undefined}
			value={
				<Popover card content={card}>
					<span>{node === undefined ? <Alarm>Offline</Alarm> : "Online"}</span>
				</Popover>
			}
			detail={null}
			chart={<HeartbeatChart sections={sections} />}
		/>
	);
}
