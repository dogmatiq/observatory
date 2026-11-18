import {
	countOf,
	formatCompact,
	formatNumber,
	nounFor,
} from "../lib/format.ts";
import { heartbeatLevel } from "../lib/levels.ts";
import { useElapsed } from "../lib/live.tsx";
import {
	nodeSegments,
	queueSegments,
	streamSegments,
} from "../lib/segments.ts";
import type { OverviewData } from "../model.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { HandlerCard } from "./HandlerCard.tsx";
import { HeartbeatChart } from "./HeartbeatChart.tsx";
import { Alarm, Failing, MetricTile, Noun } from "./MetricTile.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { NodeBar, StackedBar } from "./StackedBar.tsx";

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
	data,
	links = {},
}: {
	data: OverviewData;
	links?: OverviewLinks;
}) {
	return (
		<div className="grid gap-8">
			<section
				className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5"
				aria-label="Totals"
			>
				{data.events && (
					<ErrorBoundary>
						<EventsTile data={data.events} href={links.events} />
					</ErrorBoundary>
				)}
				{data.queues && (
					<ErrorBoundary>
						<QueuesTile data={data.queues} href={links.queues} />
					</ErrorBoundary>
				)}
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
							handler={handler}
							href={links.handler?.(handler.key)}
						/>
					</ErrorBoundary>
				))}
			</section>
		</div>
	);
}

function EventsTile({
	data,
	href,
}: {
	data: NonNullable<OverviewData["events"]>;
	href: string | undefined;
}) {
	const total = data.streams.reduce((sum, s) => sum + s.size, 0);

	return (
		<MetricTile
			subsystem="streams"
			label="Events"
			icon="event"
			href={href}
			value={perMinute(data.perMinute)}
			detail={
				<>
					<Noun>events per minute</Noun>
					{", "}
					<span title={formatNumber(total)}>{formatCompact(total)}</span>
					{` ${nounFor(total, "event", "events")} in ${countOf(data.streams.length, "stream", "streams")}`}
				</>
			}
			bar={
				<StackedBar
					subsystem="streams"
					segments={streamSegments(data.streams)}
				/>
			}
			chart={<Sparkline chart={data.history} className="h-12" />}
		/>
	);
}

/**
 * perMinute returns a rate as it is shown, which is rounded, or a question mark
 * if the Observatory doesn't have the rate yet.
 */
function perMinute(rate: number | undefined): string {
	return rate === undefined ? "?" : formatCompact(Math.round(rate));
}

/** The tooltip of the number of messages removed per minute. */
const removedPerMinuteTitle =
	"Messages removed from the queues per minute: those delivered, and deadlines removed when their process instance ended.";

function QueuesTile({
	data,
	href,
}: {
	data: NonNullable<OverviewData["queues"]>;
	href: string | undefined;
}) {
	const messages = data.queues.reduce((sum, q) => sum + q.size, 0);

	// The headline is the messages that aren't failing, and then those that are,
	// as in "24 +1", because the failing ones are part of the queues' messages.
	const healthy = Math.max(0, messages - data.failing);

	return (
		<MetricTile
			subsystem="queues"
			label="Queues"
			icon="queue"
			href={href}
			value={
				<>
					{formatCompact(healthy)}
					<Failing count={data.failing} size="headline" />
				</>
			}
			valueTitle={formatNumber(healthy)}
			detail={
				<>
					<Noun>{`${nounFor(messages, "message", "messages")} pending`}</Noun>
					{` in ${countOf(data.queues.length, "queue", "queues")}, `}
					<span title={removedPerMinuteTitle}>
						{perMinute(data.removedPerMinute)}
					</span>
					/min
				</>
			}
			bar={
				<StackedBar subsystem="queues" segments={queueSegments(data.queues)} />
			}
			chart={<Sparkline chart={data.history} className="h-12" />}
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
	const levels = data.nodes.map((n) =>
		heartbeatLevel(
			n.heartbeats.map((ago) => -ago),
			elapsed,
		),
	);

	return (
		<MetricTile
			subsystem="cluster"
			label="Cluster"
			icon="cluster"
			href={href}
			value={String(data.nodes.length)}
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
			chart={<HeartbeatChart levels={levels} />}
		/>
	);
}
