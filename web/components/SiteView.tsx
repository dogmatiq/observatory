import { type CSSProperties, useId, useMemo } from "react";
import { cn } from "../lib/cn.ts";
import { Covered, Distrusted } from "../lib/distrust.tsx";
import { formatCompact, inUnit, nounFor, shortPer } from "../lib/format.ts";
import { levelOf } from "../lib/levels.ts";
import { useElapsed } from "../lib/live.tsx";
import { applicationAtSitePath } from "../lib/route.ts";
import { applicationSegments } from "../lib/segments.ts";
import type { SiteApplication, SiteData } from "../model.ts";
import { AlertFlag } from "./AlertFlag.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Explained } from "./Explainer.tsx";
import {
	cardExplainers,
	compactExplainer,
	siteExplainers,
} from "./explainers.tsx";
import { Figure } from "./Figure.tsx";
import { HeartbeatChart } from "./HeartbeatChart.tsx";
import { Icon } from "./Icon.tsx";
import { InfoCard } from "./InfoCard.tsx";
import {
	Alarm,
	accentClasses,
	cardClasses,
	Failing,
	MetricTile,
	NoSignal,
	Noun,
	raisedClasses,
} from "./MetricTile.tsx";
import { NameLink } from "./NameLink.tsx";
import { Popover } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import { Ramped } from "./Ramped.tsx";
import { Sky } from "./Sky.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { StackedBar } from "./StackedBar.tsx";
import {
	noSignalFromApplications,
	rateStatuses,
	type Status,
	someApplicationNodesReport,
	someApplicationsReport,
} from "./statuses.ts";
import { subsystemColors } from "./subsystems.ts";
import { useRate } from "./useRate.ts";

/**
 * Breakdown is how the site view lays out its applications below its tiles:
 * `compact-digests`, a grid of compact digests, each with the application's name
 * and figures,
 * or `squares`, a grid of small squares in the manner of a contribution graph,
 * each of which names its application only when it is pointed at.
 */
export type Breakdown = "compact-digests" | "squares";

/**
 * SiteOverview is the site view: the totals of the applications at a site, or at
 * no site, as three tiles across the top, the same size as the cluster view's,
 * and each application below them, in the order of their names, so that an
 * application keeps its place. Each application links to its application view.
 */
export function SiteOverview({ data }: { data: SiteData }) {
	return (
		<div className="grid gap-8">
			<SiteTotals data={data} />
			<SiteBreakdown data={data} breakdown="compact-digests" />
		</div>
	);
}

/**
 * SiteBreakdown is the part of the site view below its tiles, which is each of
 * its applications, laid out as `breakdown` says.
 */
export function SiteBreakdown({
	data,
	breakdown,
}: {
	data: SiteData;
	breakdown: Breakdown;
}) {
	return (
		<section aria-label="Applications">
			{breakdown === "compact-digests" ? (
				<CompactDigests data={data} alert="icon" explained />
			) : (
				<ApplicationSquares data={data} />
			)}
		</section>
	);
}

/**
 * SiteTotals is the three tiles of the site view, laid out as the cluster view's
 * are. A tile whose metrics no application's engine supports is not there.
 */
export function SiteTotals({ data }: { data: SiteData }) {
	// There is no signal from any of the applications, so the totals are what they were when
	// a node last reported, and are not trusted.
	const down = data.applications.every((a) => a.nodes === 0);
	const explainers = useMemo(
		() => siteExplainers(data.site?.name),
		[data.site?.name],
	);

	return (
		<section
			className="flex flex-wrap gap-5 [&>*]:min-w-0 [&>*]:flex-[1_1_260px]"
			aria-label="Totals"
		>
			<Presence shape="fade">
				{data.events && (
					<ErrorBoundary>
						<Explained spec={explainers.events}>
							<Distrusted value={down}>
								<Covered coverage={data.events.coverage ?? 1}>
									<SiteEventsTile data={data} events={data.events} />
								</Covered>
							</Distrusted>
						</Explained>
					</ErrorBoundary>
				)}
			</Presence>
			<Presence shape="fade">
				{data.queues && (
					<ErrorBoundary>
						<Explained spec={explainers.queues}>
							<Distrusted value={down}>
								<Covered coverage={data.queues.coverage ?? 1}>
									<SiteQueuesTile data={data} queues={data.queues} />
								</Covered>
							</Distrusted>
						</Explained>
					</ErrorBoundary>
				)}
			</Presence>
			<ErrorBoundary>
				<Explained spec={explainers.applications}>
					<ApplicationsTile data={data} />
				</Explained>
			</ErrorBoundary>
		</section>
	);
}

/**
 * SiteEventsTile is the site's events tile, whose headline is the events per
 * minute across the applications, whose detail line gives the events on the
 * event streams of all the applications together, and how many streams there
 * are, as the cluster view's does, and whose bar shows which
 * applications record the most.
 */
export function SiteEventsTile({
	data,
	events,
}: {
	data: SiteData;
	events: NonNullable<SiteData["events"]>;
}) {
	const { scaled, per, state } = useRate(events.rate.perMinute);

	return (
		<MetricTile
			subsystem="streams"
			label="Events"
			icon="event"
			statuses={[
				...(events.coverage === undefined ? [] : [someApplicationsReport]),
				...rateStatuses(state),
			]}
			value={
				<span>
					<Figure number={scaled?.amount} format={formatCompact} unit={per} />
				</span>
			}
			detail={
				<>
					<span>
						<Noun>{`events per ${per}`}</Noun>
					</span>
					{events.streams !== undefined && (
						<>
							{", "}
							<Ramped value={events.streams.events} format={formatCompact} />
							{` ${nounFor(events.streams.events, "event", "events")} on `}
							<Ramped value={events.streams.count} format={formatCompact} />
							{` ${nounFor(events.streams.count, "stream", "streams")}`}
						</>
					)}
				</>
			}
			bar={
				<StackedBar
					subsystem="streams"
					segments={applicationSegments(
						data.applications.map((a) => ({
							application: a.application,
							amount: a.events?.perMinute ?? 0,
						})),
						"events",
					)}
				/>
			}
			chart={
				events.history ? (
					<Sparkline
						chart={events.history}
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
 * SiteQueuesTile is the site's queues tile, whose headline is the messages that
 * wait across the applications, with those that are failing, whose detail line
 * gives the number of queues of all the applications together, and whose bar
 * shows which applications have the most waiting.
 */
export function SiteQueuesTile({
	data,
	queues,
}: {
	data: SiteData;
	queues: NonNullable<SiteData["queues"]>;
}) {
	const { scaled, per, state } = useRate(queues.throughput?.perMinute);
	const healthy = Math.max(0, queues.messages - queues.failing);

	return (
		<MetricTile
			subsystem="queues"
			label="Queues"
			icon="message"
			statuses={[
				...(queues.coverage === undefined ? [] : [someApplicationsReport]),
				...(queues.throughput ? rateStatuses(state) : []),
			]}
			accent={queues.failing > 0 ? "failing" : undefined}
			value={
				<span>
					<Ramped value={healthy} format={formatCompact} />
					<Failing count={queues.failing} size="headline" />
				</span>
			}
			detail={
				<>
					<Noun>{nounFor(queues.messages, "message", "messages")}</Noun>
					{queues.queues !== undefined && (
						<>
							{" in "}
							<Ramped value={queues.queues} format={formatCompact} />
							{` ${nounFor(queues.queues, "queue", "queues")}`}
						</>
					)}
					{queues.throughput && (
						<>
							{", "}
							<span>
								<Figure
									number={scaled?.amount}
									format={formatCompact}
									unit={per}
								/>
								{shortPer[per]}
							</span>
						</>
					)}
				</>
			}
			bar={
				<StackedBar
					subsystem="queues"
					segments={applicationSegments(
						data.applications.map((a) => ({
							application: a.application,
							amount: a.queues?.messages ?? 0,
						})),
						"messages",
					)}
				/>
			}
			chart={
				queues.history ? (
					<Sparkline
						chart={queues.history}
						className="h-12"
						describe={(value) => ({
							figure: formatCompact(inUnit(value, per)),
							unit: `handled${shortPer[per]}`,
						})}
					/>
				) : (
					<Sky missing="the rate at which messages are handled" />
				)
			}
		/>
	);
}

/**
 * ApplicationsTile is the site's applications tile, whose headline is the number
 * of applications sending a signal, followed by the number with no signal, set
 * apart in red, such as "94 +2", as the queues tile sets apart its failing
 * messages. When there is no signal from any of the applications, the headline
 * is a red "0" alone. Its chart is the heartbeat of each application that is
 * sending a signal, which drains to the application's deadline if it has one.
 * It has no bar.
 *
 * While there is no signal from any application, the tile has the red accent,
 * because an application with no signal is one that nothing shows to be working,
 * unlike a node, whose cluster's other nodes carry on.
 */
export function ApplicationsTile({ data }: { data: SiteData }) {
	const live = data.applications.filter((a) => a.nodes > 0);
	const out = data.applications.length - live.length;

	// The levels drain between updates, so they are worked out again with each
	// frame from the time that has passed.
	const elapsed = useElapsed();
	const sections = live.map((a) => ({
		id: a.application.key,
		level: levelOf(a, elapsed),
	}));

	return (
		<MetricTile
			subsystem="cluster"
			label="Applications"
			icon="application"
			statuses={live.length === 0 ? [noSignalFromApplications] : []}
			accent={out > 0 ? "bad" : undefined}
			value={
				<span>
					{live.length === 0 ? (
						<Alarm>
							<Ramped value={0} format={String} />
						</Alarm>
					) : (
						<Ramped value={live.length} format={String} />
					)}
					{/* When there is no signal from any of the applications, there is
						nothing to set them apart from, so the headline is the red zero
						alone, as the cluster tile's is when there is no signal from any of
						the nodes. */}
					<NoSignal count={live.length === 0 ? 0 : out} of="applications" />
				</span>
			}
			detail={
				<span>
					<Noun>
						{nounFor(data.applications.length, "application", "applications")}
					</Noun>
				</span>
			}
			chart={<HeartbeatChart sections={sections} />}
		/>
	);
}

/**
 * DigestAlert is how a compact digest says that there is no signal from its application: by an
 * alert icon at the right of its name, whose popover says what is wrong, or by
 * words beside its name.
 */
export type DigestAlert = "icon" | { words: string };

/**
 * CompactDigests is the breakdown of the site view as a grid of compact
 * digests, one for each application, in the order of the applications. Each
 * compact digest names its application, gives its events per minute and its messages
 * waiting, and links to its application view.
 */
export function CompactDigests({
	data,
	alert,
	explained = false,
}: {
	data: SiteData;

	/** How a compact digest says that there is no signal from its application. */
	alert: DigestAlert;

	/**
	 * True if each compact digest has the "?" that opens its explainer, as on the
	 * site view, and not in the copy of a compact digest that an explainer draws.
	 */
	explained?: boolean;
}) {
	const explainers = useMemo(
		() => (explained ? cardExplainers({ name: "", key: "" }) : undefined),
		[explained],
	);

	return (
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
			{data.applications.map((a) => (
				<li key={a.application.key} className="min-w-0">
					<ErrorBoundary>
						{explainers ? (
							<Explained spec={compactExplainer(explainers, a, data.site)}>
								<CompactDigest site={data.site} app={a} alert={alert} />
							</Explained>
						) : (
							<CompactDigest site={data.site} app={a} alert={alert} />
						)}
					</ErrorBoundary>
				</li>
			))}
		</ul>
	);
}

/**
 * CompactDigest is the compact digest of one application in [CompactDigests]. Its
 * name is the link to its application view, and is the only part of it that is a
 * link. An
 * application with no signal has the red accent along its top, and says so in
 * red at the right of its name, as `alert` says. Its figures keep their places,
 * as zeros that are not available, which glitch when the signal stops, so that
 * the blur alone says how far a figure is trusted and the red alone says that
 * there is no signal. An application with failing messages has the orange
 * accent. While only some of its nodes are sending a signal, its figures are
 * blurred by how few are, by the coverage rule.
 */
function CompactDigest({
	site,
	app,
	alert,
}: {
	site: SiteData["site"];
	app: SiteApplication;
	alert: DigestAlert;
}) {
	const out = app.nodes === 0;
	const failing = app.queues?.failing ?? 0;
	const accent = out ? "bad" : failing > 0 ? "failing" : undefined;

	const nameId = useId();

	// With no signal, the figures are the last ones, so the flag says only that.
	// Otherwise it says whether only some of the application's nodes report its
	// figures, and whether the rate of events can be given, if the engine
	// reports one.
	const { state } = useRate(app.events?.perMinute);
	const statuses: Status[] = out
		? [{ text: noSignalText, tone: "bad" }]
		: [
				...(app.coverage === undefined ? [] : [someApplicationNodesReport]),
				...(app.events ? rateStatuses(state) : []),
			];

	return (
		<article
			aria-labelledby={nameId}
			className={cn(
				cardClasses,
				accent ? accentClasses[accent] : raisedClasses,
				"group/digest flex flex-col gap-1.5 px-3.5 pt-3 pb-2.5 text-fg",
			)}
		>
			<span className="relative flex items-center gap-2">
				<NameLink
					id={nameId}
					href={applicationAtSitePath(site?.key, app.application.key)}
					className="text-xs font-bold tracking-[0.04em] uppercase"
				>
					<span className="min-w-0 truncate">{app.application.name}</span>
				</NameLink>
				{alert === "icon" ? (
					// The flag is always placed, so that it can fade out.
					<span className="ml-auto flex flex-none self-center">
						<AlertFlag statuses={statuses} />
					</span>
				) : (
					out && (
						<span className="ml-auto flex-none text-xs text-bad">
							{alert.words}
						</span>
					)
				)}
			</span>
			<Distrusted value={out}>
				<Covered coverage={app.coverage ?? 1}>
					<ApplicationFigures app={app} />
				</Covered>
			</Distrusted>
		</article>
	);
}

/**
 * noSignalText is the tooltip of the alert flag of a compact digest whose
 * application has no signal, in the form of the engine card's status, about
 * the application.
 */
export const noSignalText =
	"There is no signal from the application, so it's unknown whether it is working.";

/**
 * ApplicationFigures is the events per minute and the messages waiting of one
 * application, each with the icon of what it counts, in the colors of its
 * subsystem, for whichever of them the application's engine supports.
 */
function ApplicationFigures({ app }: { app: SiteApplication }) {
	return (
		<span className="flex items-baseline gap-4 text-sm tabular-nums">
			{app.events && (
				<span
					className={cn(
						"inline-flex items-baseline gap-1",
						subsystemColors.streams,
					)}
				>
					<Icon
						name="event"
						className="size-3.5 self-center text-(--subsystem)"
					/>
					<span>
						<Figure
							number={app.events.perMinute}
							format={formatCompact}
							unit="minute"
						/>
						<span className="text-muted">/min</span>
					</span>
				</span>
			)}
			{app.queues && (
				<span
					className={cn(
						"inline-flex items-baseline gap-1",
						subsystemColors.queues,
					)}
				>
					<Icon
						name="message"
						className="size-3.5 self-center text-(--subsystem)"
					/>
					<span>
						<Figure
							number={app.queues.messages - app.queues.failing}
							format={formatCompact}
						/>
						<Failing count={app.queues.failing} size="stat" />
					</span>
				</span>
			)}
		</span>
	);
}

/**
 * ApplicationSquares is the breakdown of the site view as a grid of small
 * squares, one for each application, in the order of the applications, in the
 * manner of a contribution graph. A square's shade is how busy its application
 * is, by its events per minute, in four steps. A square is orange while the
 * application has failing messages, and an outline while there is no signal from it.
 * Pointing at a square shows the card of its application, and the square links
 * to its application view.
 */
function ApplicationSquares({ data }: { data: SiteData }) {
	const busiest = Math.max(
		1,
		...data.applications.map((a) => a.events?.perMinute ?? 0),
	);

	return (
		<ul
			className={cn(
				"flex flex-wrap gap-1.5 rounded-card bg-panel p-4 [box-shadow:var(--shadow-raised)]",
				subsystemColors.cluster,
			)}
		>
			{data.applications.map((a) => {
				const out = a.nodes === 0;
				const failing = (a.queues?.failing ?? 0) > 0;
				const busy = (a.events?.perMinute ?? 0) / busiest;
				const step = busy === 0 ? 0 : busy < 0.05 ? 1 : busy < 0.25 ? 2 : 3;

				return (
					<li key={a.application.key}>
						<Popover card content={<ApplicationCard app={a} />}>
							<a
								href={applicationAtSitePath(data.site?.key, a.application.key)}
								className={cn(
									"block size-5 rounded-[4px] transition-transform duration-150 hover:scale-125 motion-reduce:transition-none",
									out
										? "border-2 border-dashed border-bad"
										: failing
											? "bg-failing"
											: "bg-(--subsystem)",
									!out &&
										!failing &&
										["opacity-25", "opacity-45", "opacity-70", ""][step],
									a.coverage !== undefined && "distrust-blur",
								)}
								style={
									a.coverage === undefined
										? undefined
										: ({ "--distrust": 1 - a.coverage } as CSSProperties)
								}
							>
								<span className="sr-only">{a.application.name}</span>
							</a>
						</Popover>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * ApplicationCard is the card of a square of [ApplicationSquares]. It names the
 * application and gives its figures, or says, as a status, that there is no
 * signal from it.
 */
export function ApplicationCard({ app }: { app: SiteApplication }) {
	const out = app.nodes === 0;

	return (
		<InfoCard
			subsystem="cluster"
			icon="application"
			kind="Application"
			name={app.application.name}
			status={
				out
					? {
							icon: "alert",
							text: noSignalText,
						}
					: undefined
			}
		>
			{!out && (
				<Covered coverage={app.coverage ?? 1}>
					<ApplicationFigures app={app} />
				</Covered>
			)}
		</InfoCard>
	);
}
