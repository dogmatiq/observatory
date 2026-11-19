import { type ReactNode, useEffect, useState } from "react";
import { application, overview } from "../fixtures/overview.ts";
import { formatCompact } from "../lib/format.ts";
import type { SegmentAbout } from "../lib/segments.ts";
import { chartWindowMs, heightOf, valueAt } from "../lib/sparkline.ts";
import type { Counted, OverviewData } from "../model.ts";
import { Figure, glitchTime, keepTime } from "./Figure.tsx";
import { Glitch } from "./Glitch.tsx";
import { HandlerCard } from "./HandlerCard.tsx";
import { HandlerKindCard } from "./HandlerKindCard.tsx";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import { MessagesWaitingCard } from "./MessagesWaitingCard.tsx";
import { Failing } from "./MetricTile.tsx";
import {
	countedWords,
	EventsTile,
	eventRateWords,
	eventsAbout,
	QueuesTile,
	queuesAbout,
} from "./Overview.tsx";
import { Page } from "./Page.tsx";
import { panelClasses } from "./Popover.tsx";
import { RateCard } from "./RateCard.tsx";
import { SegmentCard } from "./SegmentCard.tsx";
import { CursorDot, CursorLine, CursorMark, Sparkline } from "./Sparkline.tsx";
import { subsystemColors } from "./subsystems.ts";

/**
 * StatesPage shows every state that an element of the cluster view can be in,
 * side by side, so that a person judging the element sees all of them and not
 * only the one that the data happens to be in. Each element that has been looked
 * at has a section here.
 *
 * A popover is drawn where it stands, in the frame of a panel, because a person
 * can't point at several at once.
 */
export function StatesPage() {
	// The states are drawn again, from the start, when it changes, so that an
	// animation can be watched again.
	const [run, setRun] = useState(0);

	return (
		<Page>
			<div className="mb-8 flex items-center justify-between gap-4">
				<p className="text-muted">
					Every state of the elements that have been looked at. Animations play
					when the page opens, and again when they are replayed.
				</p>
				<button
					type="button"
					className="flex-none cursor-pointer rounded-control border border-line bg-panel px-3 py-1.5 text-sm text-fg-soft hover:border-line-strong"
					onClick={() => setRun((n) => n + 1)}
				>
					Replay animations
				</button>
			</div>
			<div key={run} className="grid gap-12">
				<Section
					title="Events tile: the rate"
					note="The headline, and the words beside it, are the events per minute."
				>
					<State label="Known" note="347 events per minute.">
						<EventsTile
							application={application}
							data={eventsTile({ perMinute: 347 })}
							href={undefined}
						/>
					</State>
					<State
						label="Less than one a minute"
						note="A whole number per hour, so 0.4 a minute is 24 per hour."
					>
						<EventsTile
							application={application}
							data={eventsTile({ perMinute: 0.4 })}
							href={undefined}
						/>
					</State>
					<State
						label="Lost"
						note="Live for a second, then lost. It starts as it was, in the same font, and gets blurrier over a minute, as trust in it falls. In the last half second it glitches, and then it ramps down to a blurred zero. When the rate comes back it gets its trust back in a moment."
					>
						<Lost />
					</State>
					<State
						label="Lost, and back"
						note="Lost after a second, and back after thirty, when the digits have lost about half of their trust, so that the return can be seen."
					>
						<Lost backAfter={30000} />
					</State>
					<State
						label="Never known"
						note="A blurred zero in the muted colour, because the Observatory hasn't had the rate yet. It is described as not available."
					>
						<EventsTile
							application={application}
							data={eventsTile({})}
							href={undefined}
						/>
					</State>
					<State
						label="Not supported"
						note="No node reports the rate, so the headline is the number of events, with no chart."
					>
						<EventsTile
							application={application}
							data={eventsTile(undefined)}
							href={undefined}
						/>
					</State>
				</Section>

				<Section
					wide
					title="A lost figure: how it loses trust"
					note="The same digits, in the same font, as they would be 0, 15, 30, 45 and 60 seconds after they were lost, held still. A figure that is lost starts as it was."
				>
					<State label="Blur, which is in use">
						<Ages>
							{(distrust) => (
								<span
									className="distrust-blur inline-block"
									style={{ ["--distrust" as string]: distrust }}
								>
									347
								</span>
							)}
						</Ages>
					</State>
					<State
						label="A glitch"
						note="The top half and the bottom half slip sideways on their own, with red and cyan shadows that drift apart."
					>
						<Ages>
							{(distrust) => <Glitch text="347" distrust={distrust} />}
						</Ages>
					</State>
				</Section>

				<Section
					title="A number that ramps"
					note="A figure, which is a number alone or leading its unit or noun, ramps: it passes through the values in between, quickly, and doesn't skip. A change of one takes a moment, and a change of many takes up to half a second and ends gently. A number inside a sentence changes at once. Press the buttons to do to this one whatever a figure can have done to it."
				>
					<State
						label="A figure, at the size of a headline"
						note="A lost figure glitches in the last half second before its time is up, and then ramps down to a zero. Expire now brings that forward."
					>
						<FigureDemo />
					</State>
				</Section>

				<Section
					title="Failing messages"
					note="The red count after the number of messages that are not failing. It grows in, ramps as it changes, and when it falls to zero it stays at +0 for a second, so that a count that goes up and down doesn't come and go, and then shrinks away."
				>
					<State label="A count, at the size of a headline">
						<FailingDemo />
					</State>
				</Section>

				<Section
					title="Numbers that recede at zero"
					note="The numbers of a handler's card are faint when they are zero. One that falls to zero ramps down to it in the color of the text, and then fades. One that rises from zero gets its color back as it rises."
				>
					<State label="A process, with buttons">
						<ProcessDemo />
					</State>
				</Section>

				<Section
					title="Events tile: the card of the rate"
					note="The popover of the number and of the words beside it."
				>
					<State label="Known">
						<Panel>
							<RateCard {...rateCard} state="known" />
						</Panel>
					</State>
					<State label="Lost">
						<Panel>
							<RateCard {...rateCard} state="lost" />
						</Panel>
					</State>
					<State label="Unavailable">
						<Panel>
							<RateCard {...rateCard} state="unavailable" />
						</Panel>
					</State>
				</Section>

				<Section
					title="Events tile: the card of the tile"
					note="The popover of the tile's icon, the help card. It says what the tile is about in general, and not what the tile shows, which depends on what the nodes can tell it. It names the application in its prose, and has no scope line, because that would repeat the title bar."
				>
					<State label="The card">
						<Panel>
							<InfoCard subsystem="streams" icon="event" kind="Events">
								{eventsAbout(application)}
							</InfoCard>
						</Panel>
					</State>
				</Section>

				<Section
					title="Identifiers"
					note="An ID is shown only in a popover, never in the body of the page or in a sentence, as its first eight characters with a button that copies it. The ID of a thing that has no name is its identity, so it is in the color of the text. The ID of a thing that has a name, which the page shows, is in the color of muted text."
				>
					<State
						label="A thing with no name"
						note="An event stream or a queue is known by its ID alone."
					>
						<div className="grid gap-4">
							<Panel>
								<InfoCard
									subsystem="streams"
									icon="event-stream"
									kind="Event stream"
									identifier={
										<Identifier id="9f3a7c1e-5b2d-4e8a-a1c6-0d4b8e2f7a93" />
									}
								/>
							</Panel>
							<Panel>
								<InfoCard
									subsystem="queues"
									icon="queue"
									kind="Queue"
									identifier={
										<Identifier id="3b6d2f90-84c1-4a57-9e0b-72a5c1d8f346" />
									}
								/>
							</Panel>
						</div>
					</State>
					<State
						label="A thing with a name"
						note="An application is known by its name, which is in the scope that a card of something narrower than the page has, such as a node. Its key is there to be copied."
					>
						<Panel>
							<InfoCard
								subsystem="streams"
								icon="event"
								kind="Events"
								scope={{
									preposition: "within",
									kind: "application",
									name: application.name,
									id: application.key,
								}}
							/>
						</Panel>
					</State>
				</Section>

				<Section
					title="Handler card: the card of the kind icon"
					note="The popover of the icon at the top right of a handler's card. It says which handler it is and of what kind, and the application, so that it is clear whatever the handler is named, and then reminds the reader what that kind of handler does."
				>
					{(
						[
							["aggregate", "account"],
							["process", "statement-schedule"],
							["integration", "mailer"],
							["projection", "balances"],
							["aggregate", "aggregate"],
						] as const
					).map(([kind, name]) => (
						<State
							key={name}
							label={name === kind ? `${kind}, named "${name}"` : kind}
							note={
								name === kind
									? "A name that says nothing, so the card has to."
									: undefined
							}
						>
							<Panel>
								<HandlerKindCard
									application={application}
									name={name}
									kind={kind}
								/>
							</Panel>
						</State>
					))}
				</Section>

				<Section
					title="Sparkline: the cursor"
					note="The cursor of a chart is a faint line that fades out at both ends, and a round dot where it meets the chart's line, of which only the center pixel has the full color of the text. The first is the one in use, and the others are the sizes that it was chosen from."
				>
					<State label="5 px" note="In use.">
						<CursorSample />
					</State>
					{([3, 4, 6, 7] as const).map((size) => (
						<State key={size} label={`${size} px`}>
							<CursorSample size={size} />
						</State>
					))}
				</Section>

				<Section
					title="Queues tile: the rate"
					note="The words beside the headline, and the headline itself when no node says how many messages wait, are the messages removed per minute."
				>
					<State label="Known" note="442 messages removed per minute.">
						<QueuesTile
							application={application}
							data={queuesTile({ perMinute: 442, of: "removed" })}
							href={undefined}
						/>
					</State>
					<State
						label="Less than one a minute"
						note="A whole number per hour, so 0.4 a minute is 24 per hour."
					>
						<QueuesTile
							application={application}
							data={queuesTile({ perMinute: 0.4, of: "removed" })}
							href={undefined}
						/>
					</State>
					<State
						label="Never known"
						note="A blurred zero in the muted colour, because the Observatory hasn't had the rate yet."
					>
						<QueuesTile
							application={application}
							data={queuesTile({ of: "removed" })}
							href={undefined}
						/>
					</State>
					<State
						label="Rate not supported"
						note="No node reports the removals, so the words beside the headline have no rate, and there is no chart."
					>
						<QueuesTile
							application={application}
							data={queuesTile(undefined)}
							href={undefined}
						/>
					</State>
					<State
						label="Number of messages not supported"
						note="No node says how many messages wait, so the headline is the rate of removal, and there is no bar."
					>
						<QueuesTile
							application={application}
							data={queuesTile(
								{ perMinute: 442, of: "removed" },
								{ queues: false },
							)}
							href={undefined}
						/>
					</State>
					<State
						label="Handled"
						note="The rate, and the chart, are of the messages that handlers have handled, whether or not nodes report the removals, and the words say so."
					>
						<QueuesTile
							application={application}
							data={queuesTile({ perMinute: 442, of: "handled" })}
							href={undefined}
						/>
					</State>
					<State
						label="Only the commands handled"
						note="Handlers' commands are reported, and not their deadlines, or the removals, so the rate is of part of the messages, and the card says so."
					>
						<QueuesTile
							application={application}
							data={queuesTile({ perMinute: 442, of: "commands handled" })}
							href={undefined}
						/>
					</State>
					<State
						label="Only the deadlines handled"
						note="Likewise, for the deadlines."
					>
						<QueuesTile
							application={application}
							data={queuesTile({ perMinute: 442, of: "deadlines handled" })}
							href={undefined}
						/>
					</State>
					<State
						label="Handled, and no queue sizes"
						note="The headline is the rate, and says which."
					>
						<QueuesTile
							application={application}
							data={queuesTile(
								{ perMinute: 442, of: "handled" },
								{ queues: false },
							)}
							href={undefined}
						/>
					</State>
					<State
						label="Messages failing"
						note="The failing messages are part of those that wait, and are counted after the others."
					>
						<QueuesTile
							application={application}
							data={queuesTile(
								{ perMinute: 442, of: "removed" },
								{ failing: 3 },
							)}
							href={undefined}
						/>
					</State>
				</Section>

				<Section
					title="Queues tile: the card of the rate"
					note="The popover of the figure of removals, and of the words beside it."
				>
					{(["known", "lost", "unavailable"] as const).map((state) => (
						<State key={state} label={state}>
							<Panel>
								<RateCard
									subsystem="queues"
									icon="message"
									kind={countedWords.removed.kind}
									description={countedWords.removed.description}
									note={countedWords.removed.note}
									state={state}
								/>
							</Panel>
						</State>
					))}
					{(["handled", "commands handled", "deadlines handled"] as const).map(
						(counted) => (
							<State key={counted} label={countedWords[counted].kind}>
								<Panel>
									<RateCard
										subsystem="queues"
										icon="message"
										kind={countedWords[counted].kind}
										description={countedWords[counted].description}
										note={countedWords[counted].note}
										state="known"
									/>
								</Panel>
							</State>
						),
					)}
				</Section>

				<Section
					title="Queues tile: the card of the headline"
					note="The popover of the number of messages that wait, and of the count of failing messages after it, which are one headline."
				>
					<State label="Messages waiting">
						<Panel>
							<MessagesWaitingCard />
						</Panel>
					</State>
				</Section>

				<Section
					title="Queues tile: the card of the tile"
					note="The popover of the tile's icon, which is about the tile in general, and names the application."
				>
					<State label="The card">
						<Panel>
							<InfoCard subsystem="queues" icon="message" kind="Queues">
								{queuesAbout(application)}
							</InfoCard>
						</Panel>
					</State>
				</Section>

				<Section
					title="Queues tile: the card of a queue"
					note="The popover of a segment of the bar."
				>
					{(
						[
							["Several queues", 12, 0.6, 3],
							["One queue", 19, 1, 1],
							["A small share", 2, 0.04, 5],
							["One message", 1, 1, 1],
						] as const
					).map(([label, amount, share, things]) => (
						<State key={label} label={label}>
							<Panel>
								<SegmentCard
									about={{
										thing: "queue",
										id: "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93",
										amount,
										share,
										total: { amount: Math.round(amount / share), things },
									}}
								/>
							</Panel>
						</State>
					))}
				</Section>

				<Section
					title="Events tile: the card of an event stream"
					note="The popover of a segment of the bar."
				>
					<State label="Several streams">
						<Panel>
							<SegmentCard
								about={stream({ events: 11_500, share: 0.63, streams: 2 })}
							/>
						</Panel>
					</State>
					<State label="One stream">
						<Panel>
							<SegmentCard
								about={stream({ events: 470, share: 1, streams: 1 })}
							/>
						</Panel>
					</State>
					<State label="A small share">
						<Panel>
							<SegmentCard
								about={stream({ events: 12, share: 0.004, streams: 5 })}
							/>
						</Panel>
					</State>
					<State label="One event">
						<Panel>
							<SegmentCard
								about={stream({ events: 1, share: 1, streams: 1 })}
							/>
						</Panel>
					</State>
				</Section>
			</div>
		</Page>
	);
}

const rateCard = {
	subsystem: "streams",
	icon: "event",
	...eventRateWords,
} as const;

/** The data of the events tile, with the given rate, or without one. */
function eventsTile(
	rate: { perMinute?: number } | undefined,
): NonNullable<OverviewData["events"]> {
	const { history, streams } = overview.events ?? {};

	return {
		rate,
		streams,
		history: rate === undefined ? undefined : history,
	};
}

/**
 * An events tile whose rate is known at first, and is lost a second later, and
 * is known again after `backAfter` milliseconds, if it is given.
 */
function Lost({ backAfter }: { backAfter?: number }) {
	const [rate, setRate] = useState<{ perMinute?: number }>({ perMinute: 347 });

	useEffect(() => {
		const timers = [window.setTimeout(() => setRate({}), 1000)];
		if (backAfter !== undefined) {
			timers.push(
				window.setTimeout(() => setRate({ perMinute: 351 }), backAfter),
			);
		}

		return () => {
			for (const timer of timers) {
				window.clearTimeout(timer);
			}
		};
	}, [backAfter]);

	return (
		<EventsTile
			application={application}
			data={eventsTile(rate)}
			href={undefined}
		/>
	);
}

/**
 * The data of the queues tile, with the given rate of removal, or without one,
 * and, if it is said, without the number of messages in the queues or with
 * failing messages.
 */
function queuesTile(
	throughput: { perMinute?: number; of: Counted } | undefined,
	options: { queues?: boolean; failing?: number } = {},
): NonNullable<OverviewData["queues"]> {
	const { queues, history } = overview.queues ?? {};

	return {
		queues: options.queues === false ? undefined : queues,
		failing: options.failing ?? 0,
		throughput,
		history: throughput === undefined ? undefined : history,
	};
}

function stream(parts: {
	events: number;
	share: number;
	streams: number;
}): SegmentAbout {
	return {
		thing: "event-stream",
		id: "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10",
		amount: parts.events,
		share: parts.share,
		total: {
			amount: Math.round(parts.events / parts.share),
			things: parts.streams,
		},
	};
}

/** A figure at the size of a headline, with buttons that do things to it. */
function FigureDemo() {
	const [n, setN] = useState(347);
	const [lost, setLost] = useState(false);
	const [neverKnown, setNeverKnown] = useState(false);
	const [keep, setKeep] = useState(keepTime);

	// A figure that has never been known is drawn again from nothing, so that it
	// is as new.
	const [run, setRun] = useState(0);

	const button =
		"cursor-pointer rounded-control border border-line bg-panel px-2.5 py-1 text-xs text-fg-soft hover:border-line-strong disabled:cursor-default disabled:opacity-40 disabled:hover:border-line";

	const change = (to: (v: number) => number) => () => {
		setN(to);
		setLost(false);
		setNeverKnown(false);
		setKeep(keepTime);
	};

	return (
		<div className="flex flex-col gap-4 rounded-card bg-panel p-5">
			<span className="text-4xl leading-none font-bold tabular-nums">
				<Figure
					key={run}
					number={neverKnown || lost ? undefined : n}
					format={formatCompact}
					keep={keep}
				/>
			</span>
			<div className="flex flex-wrap gap-2">
				{[
					["+1", (v: number) => v + 1],
					["+25", (v: number) => v + 25],
					["\u22127", (v: number) => Math.max(0, v - 7)],
					["+500", (v: number) => v + 500],
					["To 0", () => 0],
					["To 120,000", () => 120_000],
				].map(([label, to]) => (
					<button
						key={label as string}
						type="button"
						className={button}
						onClick={change(to as (v: number) => number)}
					>
						{label as string}
					</button>
				))}
			</div>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className={button}
					disabled={lost || neverKnown}
					onClick={() => {
						setKeep(keepTime);
						setLost(true);
					}}
				>
					Lose it
				</button>
				<button
					type="button"
					className={button}
					disabled={!lost || keep === glitchTime}
					onClick={() => setKeep(glitchTime)}
				>
					Expire now
				</button>
				<button
					type="button"
					className={button}
					disabled={!lost && !neverKnown}
					onClick={change((v) => v)}
				>
					Bring it back
				</button>
				<button
					type="button"
					className={button}
					disabled={neverKnown}
					onClick={() => {
						setKeep(keepTime);
						setLost(false);
						setNeverKnown(true);
						setRun((r) => r + 1);
					}}
				>
					Never known
				</button>
			</div>
		</div>
	);
}

/**
 * A chart with its cursor held at one place. With no `size`, it has the cursor in
 * use. Otherwise it has the line of it and a dot of that size, so that sizes of
 * the dot can be compared.
 */
function CursorSample({ size }: { size?: number }) {
	const chart = overview.events?.history ?? { end: 0, points: [] };
	const x = 0.55;
	const y = heightOf(
		chart,
		valueAt(chart, chart.end - (1 - x) * chartWindowMs) ?? 0,
	);

	return (
		<div
			className={`relative h-16 w-72 overflow-hidden rounded-card bg-panel ${subsystemColors.streams}`}
		>
			<div className="absolute inset-x-0 bottom-0 h-12">
				<Sparkline chart={chart} className="h-12" />
				{size === undefined ? (
					<CursorMark x={x} y={y} />
				) : (
					<>
						<CursorLine x={x} y={y} />
						<CursorDot x={x} y={y} size={size} />
					</>
				)}
			</div>
		</div>
	);
}

/** A card of a process, with buttons that change the numbers on it. */
function ProcessDemo() {
	const [n, setN] = useState(12);
	const [failing, setFailing] = useState(0);

	const button =
		"cursor-pointer rounded-control border border-line bg-panel px-2.5 py-1 text-xs text-fg-soft hover:border-line-strong";

	return (
		<div className="flex flex-col gap-4">
			<HandlerCard
				application={application}
				handler={{
					key: "demo",
					name: "example.process",
					kind: "process",
					summary: {
						failing,
						queuedMessages: n + failing,
						unhandledEvents: n,
						schedulesDeadlines: true,
						bindings: [{ id: "aaaaaaaa", instances: n }],
					},
				}}
			/>
			<div className="flex flex-wrap gap-2">
				{[
					["+3", () => setN((v) => v + 3)],
					["+40", () => setN((v) => v + 40)],
					["To 0", () => setN(0)],
					["Fail one", () => setFailing((v) => v + 1)],
					["Clear failing", () => setFailing(0)],
				].map(([label, act]) => (
					<button
						key={label as string}
						type="button"
						className={button}
						onClick={act as () => void}
					>
						{label as string}
					</button>
				))}
			</div>
		</div>
	);
}

/** A count of failing messages after a number, with buttons that change it. */
function FailingDemo() {
	const [n, setN] = useState(0);

	return (
		<div className="flex flex-col gap-4 rounded-card bg-panel p-5">
			<span className="text-4xl leading-none font-bold tabular-nums">
				24
				<Failing count={n} size="headline" />
			</span>
			<div className="flex flex-wrap gap-2">
				{[
					["+1", (v: number) => v + 1],
					["+5", (v: number) => v + 5],
					["\u22121", (v: number) => Math.max(0, v - 1)],
					["Clear", () => 0],
				].map(([label, change]) => (
					<button
						key={label as string}
						type="button"
						className="cursor-pointer rounded-control border border-line bg-panel px-2.5 py-1 text-xs text-fg-soft hover:border-line-strong"
						onClick={() => setN(change as (v: number) => number)}
					>
						{label as string}
					</button>
				))}
			</div>
		</div>
	);
}

/** The same digits at five ages after they were lost, as `children` draws them. */
function Ages({ children }: { children: (distrust: number) => ReactNode }) {
	return (
		<div className="flex gap-x-8 rounded-card bg-panel p-5">
			{[0, 15, 30, 45, 60].map((seconds) => (
				<div key={seconds} className="flex flex-col gap-2">
					<span className="text-4xl leading-none font-bold">
						{children(seconds / 60)}
					</span>
					<span className="text-xs text-muted">{seconds} s</span>
				</div>
			))}
		</div>
	);
}

function Section({
	title,
	note,
	wide,
	children,
}: {
	title: string;
	note: string;

	/** True if each state needs more room than a card does. */
	wide?: boolean;
	children: ReactNode;
}) {
	return (
		<section>
			<h2 className="text-lg font-semibold">{title}</h2>
			<p className="mb-4 text-muted">{note}</p>
			<div
				className={`grid items-start gap-6 ${wide ? "grid-cols-[repeat(auto-fill,minmax(560px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(280px,1fr))]"}`}
			>
				{children}
			</div>
		</section>
	);
}

function State({
	label,
	note,
	children,
}: {
	label: string;
	note?: string;
	children: ReactNode;
}) {
	return (
		<figure className="flex flex-col gap-2">
			<figcaption>
				<span className="font-semibold">{label}</span>
				{note && <span className="block text-xs text-muted">{note}</span>}
			</figcaption>
			{children}
		</figure>
	);
}

/** A popover where it stands, in the frame of a panel. */
function Panel({ children }: { children: ReactNode }) {
	return <div className={`w-fit ${panelClasses}`}>{children}</div>;
}
