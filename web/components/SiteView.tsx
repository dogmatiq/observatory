import {
	type ComponentProps,
	type CSSProperties,
	type ReactNode,
	useId,
} from "react";
import { cn } from "../lib/cn.ts";
import { Covered, Distrusted } from "../lib/distrust.tsx";
import { formatCompact, inUnit, nounFor, shortPer } from "../lib/format.ts";
import { levelOf } from "../lib/levels.ts";
import { useElapsed } from "../lib/live.tsx";
import { applicationAtSitePath } from "../lib/route.ts";
import { applicationSegments } from "../lib/segments.ts";
import type { SiteApplication, SiteData } from "../model.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Figure } from "./Figure.tsx";
import { HeartbeatChart } from "./HeartbeatChart.tsx";
import { Icon } from "./Icon.tsx";
import { InfoCard } from "./InfoCard.tsx";
import {
	MessagesWaitingCard,
	SetApartExample,
} from "./MessagesWaitingCard.tsx";
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
import { eventRateWords } from "./Overview.tsx";
import { describedClasses, Popover } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import { Ramped } from "./Ramped.tsx";
import { RateCard, type RateWords } from "./RateCard.tsx";
import { Sky } from "./Sky.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { StackedBar } from "./StackedBar.tsx";
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
				<CompactDigests data={data} alert="icon" />
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
								<SiteEventsTile data={data} events={data.events} />
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
								<SiteQueuesTile data={data} queues={data.queues} />
							</Covered>
						</Distrusted>
					</ErrorBoundary>
				)}
			</Presence>
			<ErrorBoundary>
				<ApplicationsTile data={data} />
			</ErrorBoundary>
		</section>
	);
}

/**
 * TheApplications names the applications that the site view is of, in a
 * sentence: "the applications at the **eu-west** site", or, for the
 * applications at no site, "the applications", because an operator who has no
 * sites never meets the word "site". The word "the" is its own.
 */
function TheApplications({ site }: { site: SiteData["site"] }) {
	return site === undefined ? (
		<>the applications</>
	) : (
		<>
			the applications at the{" "}
			<span className="font-semibold text-fg">{site.name}</span> site
		</>
	);
}

/**
 * siteAbout returns what the card of each of the site view's tiles says, which
 * is what the part of the view is about, as the cluster view's do.
 */
export const siteAbout = {
	events: (site: SiteData["site"]) => (
		<p>
			This section shows information about the events and event streams{" "}
			<AtTheSite site={site} />.
		</p>
	),
	queues: (site: SiteData["site"]) => (
		<p>
			This section shows information about the messages and queues{" "}
			<AtTheSite site={site} />.
		</p>
	),
	applications: (site: SiteData["site"]) => (
		<p>
			This section shows information about <TheApplications site={site} />.
		</p>
	),
};

/**
 * AtTheSite says where the things in a sentence are: "at the **eu-west** site",
 * or, for the applications at no site, "of the applications", as
 * [TheApplications] does.
 */
function AtTheSite({ site }: { site: SiteData["site"] }) {
	return site === undefined ? (
		<>of the applications</>
	) : (
		<>
			at the <span className="font-semibold text-fg">{site.name}</span> site
		</>
	);
}

/**
 * sitePartialStatus is the status of the card of a tile's icon while only some of
 * the applications report what the tile shows in full: some of their nodes, or
 * all of them, don't report it, or have no signal. Its numbers can then only
 * appear lower than they really are. See [partialStatus] for a cluster's.
 */
export const sitePartialStatus = {
	icon: "alert",
	text: "Only some of the applications fully report the metrics shown in this section, so the numbers may appear lower than they really are.",
} as const;

/** What the card of the rate of the site's events tile says. */
export const siteEventRateWords: RateWords = {
	kind: "Event rate",
	description: "The rate at which the applications are recording new events",
};

/** What the card of the rate of the site's queues tile says. */
export const siteHandlingWords: RateWords = {
	kind: "Message handling rate",
	description:
		"The rate at which the applications are handling commands and deadlines",
};

/**
 * SiteEventsTile is the site's events tile, whose headline is the events per
 * minute across the applications, whose detail line gives the events in the
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
	const rateCard = (
		<RateCard
			subsystem="streams"
			icon="event"
			words={siteEventRateWords}
			state={state}
		/>
	);

	return (
		<MetricTile
			subsystem="streams"
			label="Events"
			icon="event"
			about={siteAbout.events(data.site)}
			aboutStatus={
				events.coverage === undefined ? undefined : sitePartialStatus
			}
			value={
				<Popover card content={rateCard}>
					<span>
						<Figure number={scaled?.amount} format={formatCompact} unit={per} />
					</span>
				</Popover>
			}
			detail={
				<>
					<Popover card content={rateCard}>
						<span className={describedClasses}>
							<Noun>{`events per ${per}`}</Noun>
						</span>
					</Popover>
					{events.streams !== undefined && (
						<>
							{", "}
							<Ramped value={events.streams.events} format={formatCompact} />
							{` ${nounFor(events.streams.events, "event", "events")} in `}
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

	const rateCard = (
		<RateCard
			subsystem="queues"
			icon="message"
			words={siteHandlingWords}
			state={state}
		/>
	);

	return (
		<MetricTile
			subsystem="queues"
			label="Queues"
			icon="message"
			about={siteAbout.queues(data.site)}
			aboutStatus={
				queues.coverage === undefined ? undefined : sitePartialStatus
			}
			accent={queues.failing > 0 ? "failing" : undefined}
			value={
				<Popover card content={<MessagesWaitingCard />}>
					<span>
						<Ramped value={healthy} format={formatCompact} />
						<Failing count={queues.failing} size="headline" />
					</span>
				</Popover>
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
							<Popover card content={rateCard}>
								<span className={describedClasses}>
									<Figure
										number={scaled?.amount}
										format={formatCompact}
										unit={per}
									/>
									{shortPer[per]}
								</span>
							</Popover>
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
 * ApplicationsCard is the card of the headline of the applications tile, and of
 * the words of its detail line. It says what the number counts, and what it is
 * for an application to be sending a signal, for an engine that clusters and for
 * one that doesn't. If no applications are sending a signal, it says so, as a
 * status.
 */
export function ApplicationsCard({ live }: { live: number }) {
	return (
		<InfoCard
			subsystem="cluster"
			icon="application"
			kind="Applications"
			status={
				live === 0
					? {
							icon: "alert",
							text: "There is no signal from any of the applications, so it's unknown whether any of them are working.",
						}
					: undefined
			}
		>
			<p>
				The number of applications that are sending a signal now. If there is no
				signal from some applications, they are shown separately.
			</p>
			<SetApartExample
				rest="sending a signal"
				part="with no signal"
				partInk="text-bad"
			/>
		</InfoCard>
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

	const card = <ApplicationsCard live={live.length} />;

	return (
		<MetricTile
			subsystem="cluster"
			label="Applications"
			icon="application"
			about={siteAbout.applications(data.site)}
			accent={out > 0 ? "bad" : undefined}
			value={
				<Popover card content={card}>
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
						<NoSignal count={live.length === 0 ? 0 : out} />
					</span>
				</Popover>
			}
			detail={
				<Popover card content={card}>
					<span className={describedClasses}>
						<Noun>
							{nounFor(data.applications.length, "application", "applications")}
						</Noun>
					</span>
				</Popover>
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
}: {
	data: SiteData;

	/** How a compact digest says that there is no signal from its application. */
	alert: DigestAlert;
}) {
	return (
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
			{data.applications.map((a) => (
				<li key={a.application.key} className="min-w-0">
					<ErrorBoundary>
						<CompactDigest site={data.site} app={a} alert={alert} />
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
				{out &&
					(alert === "icon" ? (
						<Popover content={noSignalText}>
							<span className="ml-auto flex-none self-center text-bad">
								<Icon name="alert" className="size-4" />
								<span className="sr-only">No signal</span>
							</span>
						</Popover>
					) : (
						<span className="ml-auto flex-none text-xs text-bad">
							{alert.words}
						</span>
					))}
			</span>
			<Distrusted value={out}>
				<Covered coverage={app.coverage ?? 1}>
					<ApplicationFigures app={app} explained />
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
function ApplicationFigures({
	app,
	explained,
}: {
	app: SiteApplication;

	/**
	 * True if each figure has the card that explains it, as its popover. A figure
	 * inside a popover has none, because only one popover is open at a time.
	 */
	explained: boolean;
}) {
	const { state } = useRate(app.events?.perMinute);
	const explain = (
		card: ReactNode,
		figure: ComponentProps<typeof Popover>["children"],
	) =>
		explained ? (
			<Popover card content={card}>
				{figure}
			</Popover>
		) : (
			figure
		);

	return (
		<span className="flex items-baseline gap-4 text-sm tabular-nums">
			{app.events &&
				explain(
					<RateCard
						subsystem="streams"
						icon="event"
						words={eventRateWords}
						state={state}
					/>,
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
					</span>,
				)}
			{app.queues &&
				explain(
					<MessagesWaitingCard />,
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
					</span>,
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
					<ApplicationFigures app={app} explained={false} />
				</Covered>
			)}
		</InfoCard>
	);
}
