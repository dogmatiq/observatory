import { type ReactNode, useMemo } from "react";
import { Covered, Distrusted, useCurrent } from "../lib/distrust.tsx";
import {
	formatCompact,
	inUnit,
	nounFor,
	shortId,
	shortPer,
} from "../lib/format.ts";
import { heartbeatAge } from "../lib/heartbeat-age.ts";
import { levelOf } from "../lib/levels.ts";
import { useElapsed } from "../lib/live.tsx";
import type { Readout } from "../lib/readout.tsx";
import {
	nodeSegments,
	queueSegments,
	streamSegments,
} from "../lib/segments.ts";
import type { Application, Counted, LiveNode, OverviewData } from "../model.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Explained, type ExplainerSpec } from "./Explainer.tsx";
import {
	cardExplainers,
	clusterExplainerOf,
	engineExplainer,
	eventsExplainerOf,
	handlerExplainer,
	queuesExplainerOf,
} from "./explainers.tsx";
import { Figure } from "./Figure.tsx";
import { HandlerDigest } from "./HandlerDigest.tsx";
import { HeartbeatChart, type Section } from "./HeartbeatChart.tsx";
import { Alarm, Failing, MetricTile, NoSignal, Noun } from "./MetricTile.tsx";
import { Presence } from "./Presence.tsx";
import { Ramped } from "./Ramped.tsx";
import { Sky } from "./Sky.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { NodeBar, StackedBar } from "./StackedBar.tsx";
import {
	noSignalFromEngine,
	noSignalFromNodes,
	rateStatuses,
	someNodesReport,
	someNodesReportWorkloads,
} from "./statuses.ts";
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
	down = false,
}: {
	application: Application;
	data: OverviewData;
	links?: OverviewLinks;
	down?: boolean;
}) {
	const explainers = useExplainers(application);
	const { events, queues, cluster } = data;

	return (
		<section
			className="flex flex-wrap gap-5 [&>*]:min-w-0 [&>*]:flex-[1_1_260px]"
			aria-label="Totals"
		>
			<Presence shape="fade">
				{events && (
					<ErrorBoundary>
						<Explaining
							spec={() => ({
								...explainers[eventsExplainerOf(events)],
								label: "events tile",
							})}
						>
							<Distrusted value={down}>
								<Covered coverage={events.coverage ?? 1}>
									<EventsTile data={events} href={links.events} />
								</Covered>
							</Distrusted>
						</Explaining>
					</ErrorBoundary>
				)}
			</Presence>
			<Presence shape="fade">
				{queues && (
					<ErrorBoundary>
						<Explaining
							spec={() => ({
								...explainers[queuesExplainerOf(queues)],
								label: "queues tile",
							})}
						>
							<Distrusted value={down}>
								<Covered coverage={queues.coverage ?? 1}>
									<QueuesTile data={queues} href={links.queues} />
								</Covered>
							</Distrusted>
						</Explaining>
					</ErrorBoundary>
				)}
			</Presence>
			{cluster && (
				<ErrorBoundary>
					<Explaining
						spec={() => ({
							...explainers[clusterExplainerOf(cluster)],
							label: "cluster tile",
						})}
					>
						<ClusterTile data={cluster} href={links.cluster} />
					</Explaining>
				</ErrorBoundary>
			)}
			{data.engine && (
				<ErrorBoundary>
					<Explaining spec={() => engineExplainer(application)}>
						<EngineTile data={data.engine} href={links.engine} />
					</Explaining>
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
	down = false,
}: {
	application: Application;
	data: OverviewData;
	links?: OverviewLinks;

	/** True if no node of the cluster is reporting, so its numbers are not trusted. */
	down?: boolean;
}) {
	const explainers = useExplainers(application);

	return (
		<div className="grid gap-8">
			<Totals application={application} data={data} links={links} down={down} />
			<section
				className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5"
				aria-label="Handlers"
			>
				{data.handlers.map((handler) => (
					<ErrorBoundary key={handler.key}>
						<Explaining
							spec={() => handlerExplainer(explainers, application, handler)}
						>
							<Distrusted value={down}>
								<Covered coverage={handler.coverage ?? 1}>
									<HandlerDigest
										handler={handler}
										href={links.handler?.(handler.key)}
									/>
								</Covered>
							</Distrusted>
						</Explaining>
					</ErrorBoundary>
				))}
			</section>
		</div>
	);
}

/**
 * Explaining is a card with the "?" that opens its explainer, which `spec` gives.
 * The explainer is worked out as the card is drawn, so that a card whose data
 * can't be read fails inside its own error boundary, as the card itself would.
 */
function Explaining({
	spec,
	children,
}: {
	spec: () => ExplainerSpec;
	children: ReactNode;
}) {
	return <Explained spec={spec()}>{children}</Explained>;
}

/**
 * useExplainers returns the explainers of the cluster view's cards, for the given
 * application, which their titles name. They are made again only when the
 * application changes.
 */
function useExplainers(application: Application) {
	return useMemo(() => cardExplainers(application), [application]);
}

/**
 * EventsTile is the events tile, whose headline is the events per minute, or the
 * number of events if no node reports the rate.
 */
export function EventsTile({
	data,
	href,
}: {
	data: NonNullable<OverviewData["events"]>;
	href: string | undefined;
}) {
	const { rate, streams, oneStream } = data;
	const total = streams?.reduce((sum, s) => sum + s.size, 0) ?? 0;

	// An engine that appends every event to one stream has no streams to count,
	// and no spread of events across them to show.
	const onStreams =
		streams === undefined || oneStream ? null : (
			<>
				{" on "}
				<Ramped value={streams.length} format={String} />
				{` ${nounFor(streams.length, "stream", "streams")}`}
			</>
		);

	// A rate is a whole number of events per minute, or per hour or per day if it
	// is less than one per minute, and is lost, as the figure shows it, for a
	// minute at most.
	const { scaled, per, state } = useRate(rate?.perMinute, rate?.measuring);

	// The tile shows what the nodes can tell it. Its headline is the events per
	// minute, or, if no node supports that, how many events there are.
	return (
		<MetricTile
			subsystem="streams"
			label="Events"
			icon="event"
			href={href}
			statuses={[
				...(data.coverage === undefined ? [] : [someNodesReport]),
				...(rate ? rateStatuses(state) : []),
			]}
			value={
				rate ? (
					<span>
						<Figure number={scaled?.amount} format={formatCompact} unit={per} />
					</span>
				) : (
					<Ramped value={total} format={formatCompact} />
				)
			}
			detail={
				rate ? (
					<>
						<span>
							<Noun>{`events per ${per}`}</Noun>
						</span>
						{streams && (
							<>
								{", "}
								<Ramped value={total} format={formatCompact} />
								{` ${nounFor(total, "event", "events")}`}
								{onStreams}
							</>
						)}
					</>
				) : (
					<>
						<Noun>{nounFor(total, "event", "events")}</Noun>
						{oneStream ? null : (
							<>
								{" on "}
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
 * QueuesTile is the queues tile, whose headline is the messages that wait in the
 * queues, or the rate at which they get through the queues, if no node reports how
 * many wait, which is the messages that handlers have handled, or those that are
 * removed, or only some kinds of the first. See [countedWords].
 */
export function QueuesTile({
	data,
	href,
}: {
	data: NonNullable<OverviewData["queues"]>;
	href: string | undefined;
}) {
	const { queues, throughput, oneQueue } = data;
	const messages = queues?.reduce((sum, q) => sum + q.size, 0) ?? 0;

	// The headline is the messages that are ready to be delivered now, and then
	// those that are failing, as in "24 +1". A failing message may or may not be
	// ready, as it waits for its next attempt, so the failing ones are counted
	// beside the ready ones, not taken out of them. If no node supports the
	// messages in queues that are ready, it is the messages that are removed per
	// minute.
	const failing = useCurrent(data.failing);

	// The rate of removal is a whole number per minute, or per hour or per day if
	// it is less than one per minute, as the rate of events is.
	const { scaled, per, state } = useRate(
		throughput?.perMinute,
		throughput?.measuring,
	);

	// What the rate counts, which is the messages that handlers have handled, or
	// those that are removed from the queues, or only the commands, or only the
	// deadlines, that handlers have handled. The card says which, because it is
	// built from the statistics of the nodes.
	const counted = throughput?.of ?? "removed";
	const wording = countedWords[counted];

	// The number and its detail line both have the card of the rate.

	const rate = (
		<Figure number={scaled?.amount} format={formatCompact} unit={per} />
	);

	return (
		<MetricTile
			subsystem="queues"
			label="Queues"
			icon="message"
			href={href}
			statuses={[
				...(data.coverage === undefined ? [] : [someNodesReport]),
				...(throughput ? rateStatuses(state) : []),
			]}
			accent={failing > 0 ? "failing" : undefined}
			value={
				queues ? (
					<span>
						<Ramped value={messages} format={formatCompact} />
						<Failing count={data.failing} size="headline" />
					</span>
				) : (
					<span>{rate}</span>
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
								<span>
									{rate}
									{shortPer[per]}
								</span>
							</>
						)}
					</>
				) : (
					<span>
						<Noun>{`${wording.counted} per ${per}`}</Noun>
					</span>
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
 * ClusterTile is the cluster tile, whose headline is the number of nodes that are
 * sending a signal, with the members of the cluster that there is no signal
 * from set apart in red after it, and the workloads that the nodes own, and a bar
 * of how those are shared. If no node says that it reports its workloads, the
 * tile leaves them out, and has no bar.
 *
 * A member with no signal counts as a node that doesn't report its workloads, so
 * the number of workloads, which is of the nodes that report them, is blurred by
 * how few they are. The bar and the heartbeat chart are of the nodes sending a
 * signal.
 */
export function ClusterTile({
	data,
	href,
}: {
	data: NonNullable<OverviewData["cluster"]>;
	href: string | undefined;
}) {
	const divided = data.reportsWorkloads === true;
	const live = data.nodes.filter((n) => n.noSignal !== true);
	const out = data.nodes.length - live.length;

	// While a member doesn't report its workloads and others do, the number of
	// workloads is of the nodes that do, which covers only some of the cluster.
	const reporting = live.filter((n) => n.workloads !== undefined).length;
	const coverage = data.nodes.length === 0 ? 1 : reporting / data.nodes.length;
	const workloads = live.reduce((sum, n) => sum + (n.workloads ?? 0), 0);

	// The levels drain between updates, so they are worked out again with each
	// frame from the time that has passed.
	const elapsed = useElapsed();
	const sections = live.map((n) =>
		sectionOf(n, elapsed, (id, age) => ({
			subject: `node ${shortId(id)}`,
			label: "heartbeat",
			figure: age,
		})),
	);

	return (
		<MetricTile
			subsystem="cluster"
			label="Cluster"
			icon="cluster"
			href={href}
			statuses={
				live.length === 0
					? [noSignalFromNodes]
					: divided && coverage < 1
						? [someNodesReportWorkloads]
						: []
			}
			// The red accent is for when no node is sending a signal. While some are,
			// the cluster still works, and the red count says what is missing.
			accent={live.length === 0 ? "bad" : undefined}
			value={
				<span>
					{live.length === 0 ? (
						<Alarm>
							<Ramped value={0} format={String} />
						</Alarm>
					) : (
						<Ramped value={live.length} format={String} />
					)}
					{/* When there is no signal from any of the nodes, there is nothing to
						set the members with no signal apart from, so the headline is the
						red zero alone. */}
					<NoSignal count={live.length === 0 ? 0 : out} of="nodes" />
				</span>
			}
			detail={
				<>
					<span>
						<Noun>
							{nounFor(data.nodes.length, "cluster node", "cluster nodes")}
						</Noun>
					</span>
					{divided && (
						<>
							{", "}
							<span>
								<Covered coverage={coverage}>
									<Figure number={workloads} format={String} />
								</Covered>{" "}
								{nounFor(workloads, "workload", "workloads")}
							</span>
						</>
					)}
				</>
			}
			// The bar is of how the workloads are shared, so an engine that doesn't
			// divide its work has none. A cluster with no live node has the empty
			// track of a bar, because its engine can't be known.
			bar={
				divided || live.length === 0 ? (
					<NodeBar segments={nodeSegments(live)} />
				) : undefined
			}
			chart={<HeartbeatChart sections={sections} />}
		/>
	);
}

/**
 * EngineTile is the tile of an engine that doesn't cluster, which always runs as a
 * single process, in place of the cluster tile. Its headline says whether the
 * process is online, which is whether it is reporting, and its chart is the process's heartbeat. It has no bar,
 * because there is nothing to share between processes.
 */
export function EngineTile({
	data,
	href,
}: {
	data: NonNullable<OverviewData["engine"]>;
	href: string | undefined;
}) {
	const { node } = data;

	// The level drains between updates, so it is worked out again with each frame
	// from the time that has passed. The engine runs as one process, so its
	// readout needn't say which one: it says when its latest heartbeat arrived.
	const elapsed = useElapsed();
	const sections =
		node === undefined
			? []
			: [
					sectionOf(node, elapsed, (_, age) => ({
						label: "heartbeat",
						figure: age,
					})),
				];

	return (
		<MetricTile
			subsystem="cluster"
			label="Engine"
			icon="engine"
			href={href}
			statuses={node === undefined ? [noSignalFromEngine] : []}
			accent={node === undefined ? "bad" : undefined}
			value={
				<span>{node === undefined ? <Alarm>Offline</Alarm> : "Online"}</span>
			}
			detail={null}
			chart={<HeartbeatChart sections={sections} />}
		/>
	);
}

/**
 * sectionOf returns the section of the heartbeat chart of a node, `elapsed`
 * milliseconds after its data arrived: the level of its heartbeat, and what the
 * tile says about it while its share is pointed at, which `readout` gives from
 * the node's ID and when its latest heartbeat arrived, such as "4 s ago".
 */
function sectionOf(
	node: LiveNode,
	elapsed: number,
	readout: (id: string, age: string) => Readout,
): Section {
	const age = heartbeatAge(node, elapsed);
	return {
		id: node.id,
		level: levelOf(node, elapsed),
		...(age !== undefined && { readout: readout(node.id, age) }),
	};
}
