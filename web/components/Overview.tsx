import { useRef } from "react";
import {
	countOf,
	formatCompact,
	formatNumber,
	nounFor,
	type RatePer,
	scaleRate,
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
import { Figure, useKept } from "./Figure.tsx";
import { HandlerCard } from "./HandlerCard.tsx";
import { HeartbeatChart } from "./HeartbeatChart.tsx";
import { Alarm, Failing, MetricTile, Noun } from "./MetricTile.tsx";
import { Popover } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import { Ramped } from "./Ramped.tsx";
import { RateCard } from "./RateCard.tsx";
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
	const { rate, streams } = data;
	const total = streams?.reduce((sum, s) => sum + s.size, 0) ?? 0;

	// A rate is a whole number of events per minute, or per hour or per day if it
	// is less than one per minute, and is lost, as the figure shows it, for a
	// minute at most. When it has been lost for that long, its zero is in the unit
	// that it was in, so that the figure can ramp down to it.
	const kept = useKept(rate?.perMinute);
	const scaled =
		rate?.perMinute === undefined ? undefined : scaleRate(rate.perMinute);
	const lastPer = useRef<RatePer>("minute");
	if (kept.value !== undefined) {
		lastPer.current = scaleRate(kept.value).per;
	}
	const per = lastPer.current;

	// The number and the words beside it both have the card of the rate.
	const rateCard = (
		<RateCard
			subsystem="streams"
			icon="event"
			kind="Event rate"
			description="The rate at which the application is recording new events"
			state={
				kept.value === undefined ? "unavailable" : kept.lost ? "lost" : "known"
			}
		/>
	);

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
			valueTitle={rate ? undefined : formatNumber(total)}
			detail={
				rate ? (
					<>
						<Popover card content={rateCard}>
							<span>
								<Noun>{`events per ${per}`}</Noun>
							</span>
						</Popover>
						{streams && (
							<>
								{", "}
								<Popover content={formatNumber(total)}>
									<span>
										<Ramped value={total} format={formatCompact} />
									</span>
								</Popover>
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

/** What the popover of the number of messages removed per minute says. */
const removedPerMinuteText =
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

	// The rate of removal is a whole number.
	const removedRate =
		removed?.perMinute === undefined
			? undefined
			: Math.round(removed.perMinute);

	return (
		<MetricTile
			subsystem="queues"
			label="Queues"
			icon="queue"
			href={href}
			value={
				queues ? (
					<>
						<Ramped value={healthy} format={formatCompact} />
						<Failing count={data.failing} size="headline" />
					</>
				) : (
					<Popover content={removedPerMinuteText}>
						<span>
							<Figure number={removedRate} format={formatCompact} />
						</span>
					</Popover>
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
								<Popover content={removedPerMinuteText}>
									<span>
										<Figure number={removedRate} format={formatCompact} />
									</span>
								</Popover>
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
