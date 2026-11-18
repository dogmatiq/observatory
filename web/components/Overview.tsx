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
import { Figure } from "./Figure.tsx";
import { HandlerCard } from "./HandlerCard.tsx";
import { HeartbeatChart } from "./HeartbeatChart.tsx";
import { Alarm, Failing, MetricTile, Noun } from "./MetricTile.tsx";
import { Presence } from "./Presence.tsx";
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
				<Presence shape="fade">
					{data.events && (
						<ErrorBoundary>
							<EventsTile data={data.events} href={links.events} />
						</ErrorBoundary>
					)}
				</Presence>
				<Presence shape="fade">
					{data.queues && (
						<ErrorBoundary>
							<QueuesTile data={data.queues} href={links.queues} />
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
	const { rate, streams } = data;
	const total = streams?.reduce((sum, s) => sum + s.size, 0) ?? 0;

	// The tile shows what the nodes can tell it. Its headline is the events per
	// minute, or, if no node supports that, how many events there are.
	return (
		<MetricTile
			subsystem="streams"
			label="Events"
			icon="event"
			href={href}
			value={
				rate ? (
					<Figure text={perMinute(rate.perMinute)} />
				) : (
					formatCompact(total)
				)
			}
			valueTitle={rate ? undefined : formatNumber(total)}
			detail={
				rate ? (
					<>
						<Noun>events per minute</Noun>
						{streams && (
							<>
								{", "}
								<span title={formatNumber(total)}>{formatCompact(total)}</span>
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
				data.history && <Sparkline chart={data.history} className="h-12" />
			}
		/>
	);
}

/**
 * perMinute returns a rate as it is shown, which is rounded, or undefined if the
 * Observatory doesn't have the rate yet.
 */
function perMinute(rate: number | undefined): string | undefined {
	return rate === undefined ? undefined : formatCompact(Math.round(rate));
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
	const { queues, removed } = data;
	const messages = queues?.reduce((sum, q) => sum + q.size, 0) ?? 0;

	// The headline is the messages that aren't failing, and then those that are,
	// as in "24 +1", because the failing ones are part of the queues' messages. If
	// no node supports the messages in queues, it is the messages that are removed
	// per minute.
	const healthy = Math.max(0, messages - data.failing);

	return (
		<MetricTile
			subsystem="queues"
			label="Queues"
			icon="queue"
			href={href}
			value={
				queues ? (
					<>
						{formatCompact(healthy)}
						<Failing count={data.failing} size="headline" />
					</>
				) : (
					<span title={removedPerMinuteTitle}>
						<Figure text={perMinute(removed?.perMinute)} />
					</span>
				)
			}
			valueTitle={queues ? formatNumber(healthy) : undefined}
			detail={
				queues ? (
					<>
						<Noun>{nounFor(messages, "message", "messages")}</Noun>
						{` in ${countOf(queues.length, "queue", "queues")}`}
						{removed && (
							<>
								{", "}
								<span title={removedPerMinuteTitle}>
									<Figure text={perMinute(removed.perMinute)} />
								</span>
								/min
							</>
						)}
					</>
				) : (
					<Noun>messages removed per minute</Noun>
				)
			}
			bar={
				queues && (
					<StackedBar subsystem="queues" segments={queueSegments(queues)} />
				)
			}
			chart={
				data.history && <Sparkline chart={data.history} className="h-12" />
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
			chart={<HeartbeatChart sections={sections} />}
		/>
	);
}
