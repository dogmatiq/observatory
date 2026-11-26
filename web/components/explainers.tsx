import { cloneElement, isValidElement } from "react";
import { overview } from "../fixtures/overview.ts";
import {
	euWest,
	siteApplications,
	siteOf,
	withSignal,
} from "../fixtures/site.ts";
import { formatCompact } from "../lib/format.ts";
import type {
	Application,
	Counted,
	HandlerData,
	HandlerKind,
	LiveNode,
	OverviewData,
	Site,
	SiteApplication,
	SiteData,
} from "../model.ts";
import { ApplicationName } from "./ApplicationName.tsx";
import type { ExplainerSpec, Note } from "./Explainer.tsx";
import { HandlerDigest } from "./HandlerDigest.tsx";
import {
	ClusterTile,
	countedWords,
	EngineTile,
	EventsTile,
	QueuesTile,
} from "./Overview.tsx";
import {
	ApplicationsTile,
	CompactDigests,
	SiteEventsTile,
	SiteQueuesTile,
} from "./SiteView.tsx";

// The explainers of the cards of the views: the cluster view's vital cards and
// handler digests, the engine tile, and the site view's tiles and compact
// digests. Each explainer draws a copy of its card with made-up figures, so the
// copies here are drawn from fixtures. See the Explainers section of
// docs/ui-design.md.

/**
 * A reminder of what each kind of handler is for, as a sentence that follows the
 * kind, with its article. It says what the handler does for the application
 * first, and then, as a secondary matter, which messages it handles.
 */
const handlerKindReminders: Record<HandlerKind, string> = {
	aggregate:
		"An aggregate enforces the application's business rules for each of its instances, by deciding which events each command produces.",
	process:
		"A process coordinates a workflow that takes place over time, reacting to events by executing commands and scheduling deadlines.",
	integration:
		"An integration interacts with external systems on the application's behalf.",
	projection:
		"A projection builds a view of the application's state in an external system, by applying events as they occur.",
};

export type Which =
	| "events"
	| "queues"
	| "cluster"
	| "handler"
	| "process"
	| "integration"
	| "projection"
	| "compact"
	| "eventsOneStream"
	| "eventsNoRate"
	| "aggregateOneStream"
	| "aggregateNoBindings"
	| "processNoDeadlines"
	| "processOneQueue"
	| "processNoBindings"
	| "integrationNoEvents"
	| "integrationNoNodes"
	| "projectionNoNodes"
	| "compactNoRate"
	| "compactNoMessages"
	| "clusterNoWorkloads"
	| "queuesOneQueue"
	| "queuesNoRate"
	| "queuesRemoved"
	| "queuesCommands"
	| "queuesDeadlines"
	| `queuesRate ${Counted}`;

export const whiches: Which[] = [
	"events",
	"queues",
	"cluster",
	"handler",
	"process",
	"integration",
	"projection",
	"compact",
];

/**
 * The same cards with parts that their engines don't have, whose explainers
 * leave out what the cards leave out.
 */
export const variants: Which[] = [
	"eventsOneStream",
	"eventsNoRate",
	"clusterNoWorkloads",
	"aggregateOneStream",
	"aggregateNoBindings",
	"processNoDeadlines",
	"processOneQueue",
	"processNoBindings",
	"integrationNoEvents",
	"integrationNoNodes",
	"projectionNoNodes",
	"compactNoRate",
	"compactNoMessages",
	"queuesOneQueue",
	"queuesNoRate",
	"queuesRemoved",
	"queuesCommands",
	"queuesDeadlines",
	"queuesRate handled",
	"queuesRate removed",
	"queuesRate commands handled",
	"queuesRate deadlines handled",
];

/**
 * cardExplainers returns the explainer of each card of the cluster view and of a
 * compact digest, by which card it is, for the given application at its site,
 * which the explainers' titles name.
 */
export function cardExplainers(
	atSite: Application & { site?: string },
): Record<Which, ExplainerSpec> {
	const handler = overview.handlers[0] as HandlerData;

	/** The data of the queues tile. */
	type QueuesData = NonNullable<OverviewData["queues"]>;

	/**
	 * The words of the annotations of the queues tile's rate, and of its chart, for
	 * each thing that the rate can count, which is whatever the engine reports.
	 */
	const queuesRateWords: Record<Counted, { rate: string; chart: string }> = {
		handled: {
			rate: "the rate of handled messages, averaged over the last minute",
			chart: "messages handled over the last minute",
		},
		removed: {
			rate: "the rate at which messages leave the queues, handled or not, averaged over the last minute",
			chart: "messages removed from the queues over the last minute",
		},
		"commands handled": {
			rate: "the rate of handled commands, not deadlines, averaged over the last minute",
			chart: "commands handled over the last minute, not deadlines",
		},
		"deadlines handled": {
			rate: "the rate of handled deadlines, not commands, averaged over the last minute",
			chart: "deadlines handled over the last minute, not commands",
		},
	};

	/**
	 * queuesExplainer returns the explainer of a queues tile drawn from the given
	 * data. Its annotations of the rate say what the rate counts, which the card's
	 * own words don't say unless the rate is the headline.
	 */
	function queuesExplainer(label: string, data: QueuesData): ExplainerSpec {
		const counted = data.throughput?.of ?? "removed";
		const words = queuesRateWords[counted];
		return {
			label,
			title: (
				<>
					The messages and queues of the{" "}
					<ApplicationName application={atSite} />
				</>
			),
			width: 360,
			card: <QueuesTile data={data} href={undefined} />,
			notes: [
				{
					at: ".text-4xl",
					text: "the number of messages ready to be delivered now",
					when: { lacks: " per " },
					side: "left",
					atText: "19",
					with: [
						{ at: ":scope > article > span", atText: "messages" },
						{ at: ".text-4xl .text-failing", atText: true, keepInk: true },
					],
					approach: "top-left",
					dy: -40,
				},
				// While no node reports the messages waiting, the rate is the headline,
				// and its label says what it counts.
				{
					at: ".text-4xl",
					text: words.rate,
					when: { has: " per " },
					side: "left",
					atText: true,
					with: [
						{
							at: ":scope > article > span",
							atText: `${countedWords[counted].counted} per minute`,
						},
					],
					approach: "top-left",
					dy: -40,
				},
				{
					at: ".text-4xl .text-failing",
					text: "the number of messages that are failing",
					side: "top",
					wordsLeft: true,
					atText: true,
					keepInk: true,
				},
				{
					at: ":scope > article > span",
					text: "the number of queues the application has",
					side: "top",
					atText: "3 queues",
				},
				{
					at: ":scope > article > span",
					text: words.rate,
					side: "right",
					atText: "442/min",
					dy: -4,
				},
				{
					at: "div.h-2",
					text: "how the ready messages are spread across the queues",
					side: "left",
					dy: 6,
				},
				{
					at: "svg.h-12",
					text: words.chart,
					side: "right",
					into: "chart",
				},
				{ at: "[data-moon]", text: "the moon", side: "right" },
			],
			paragraphs: [
				"Commands and deadlines wait on queues until they are delivered. A command is ready to be delivered as soon as it is queued, and a deadline once its scheduled time arrives.",
				{
					text: "Fewer ready messages is better. If the number keeps rising, messages are becoming ready faster than they are being handled.",
					when: { lacks: " per " },
				},
				{
					key: "queues",
					when: { part: "div.h-2" },
					text: (
						<>
							The <span className="font-semibold text-fg-soft">statements</span>{" "}
							application's engine spreads messages across several queues. An
							even spread is better; a queue that holds more than its fair share
							limits parallel throughput.
						</>
					),
				},
			],
		};
	}

	/**
	 * The data of the cluster vital card, whose last node has just sent a heartbeat,
	 * so that the chart is high at its right end, where its arrow ends. The others
	 * have the heartbeats of the page's fixture in the other order. It has a member
	 * with no signal too, as the worked example of a number set apart.
	 */
	const clusterData = {
		...overview.cluster,
		nodes: [
			...overview.cluster.nodes.map((node, i, nodes) => ({
				...node,
				heartbeats: nodes[nodes.length - 1 - i]?.heartbeats ?? node.heartbeats,
			})),
			{
				id: "fe2b19a7-0000-4000-8000-000000000000",
				heartbeats: [],
				noSignal: true as const,
			},
		],
	};

	/** The application of the compact digest: one whose messages are failing. */
	const compactApp = siteApplications.filter(
		(a) => (a.queues?.failing ?? 0) > 0,
	)[0] as (typeof siteApplications)[number];

	/** The data of the queues vital card, with three queues. */
	const threeQueues: QueuesData = {
		...overview.queues,
		queues: [
			{ id: "113cbdc3", size: 11 },
			{ id: "8f02a6e1", size: 5 },
			{ id: "c41d9b70", size: 3 },
		],
		failing: 3,
		throughput: { perMinute: 442, of: "handled" },
	};

	/** The nodes of the cluster, each with a share of a handler's work. */
	const handlerNodes = overview.cluster.nodes.map((node, i) => ({
		id: node.id,
		rate: [5, 3, 2][i] ?? 1,
	}));

	/**
	 * handlerTitle returns the title of the explainer of a handler's digest, which
	 * names the handler, its kind and where it is.
	 */
	function handlerTitle(name: string, kind: HandlerKind) {
		return (
			<>
				The <span className="font-semibold text-fg">{name}</span> {kind} in the{" "}
				<ApplicationName application={atSite} />
			</>
		);
	}

	/** The annotations of the name and the kind, which every handler's digest has. */
	const handlerIdentityNotes: Note[] = [
		{
			at: "span[id]",
			text: "the handler's name",
			side: "top",
			wordsLeft: true,
			atText: true,
		},
		{
			at: "span.text-2xs",
			text: "the kind of handler",
			side: "left",
			atText: true,
		},
	];

	/** The annotation of the moon, for a digest whose sky has it. */
	const moonNote: Note = { at: "[data-moon]", text: "the moon", side: "right" };

	const processHandler: HandlerData = {
		...(overview.handlers[1] as HandlerData),
		summary: {
			failing: 1,
			queuedMessages: 6,
			unhandledEvents: 12,
			schedulesDeadlines: true,
			bindings: [
				{ id: "113cbdc3", instances: 11 },
				{ id: "8f02a6e1", instances: 6 },
				{ id: "c41d9b70", instances: 3 },
			],
		},
	};

	// The integration's own chart falls to nothing at its right end, so it has the
	// process's chart, which is high there, where the chart's arrow ends.
	const integrationHandler: HandlerData = {
		...(overview.handlers[2] as HandlerData),
		history: (overview.handlers[1] as HandlerData).history,
		summary: { failing: 2, queuedMessages: 9, bindings: [] },
		nodes: handlerNodes,
	};

	const projectionHandler: HandlerData = {
		...(overview.handlers[3] as HandlerData),
		summary: { failing: 0, unhandledEvents: 12, bindings: [] },
		nodes: handlerNodes,
	};

	/**
	 * integrationExplainer returns the explainer of an integration's digest drawn
	 * from the given handler. Its chart's annotation says what the chart counts:
	 * the events that the integration records, or, for one that records none, the
	 * commands that it handles.
	 */
	function integrationExplainer(
		label: string,
		handler: HandlerData,
	): ExplainerSpec {
		return {
			label,
			title: handlerTitle(handler.name, "integration"),
			width: 360,
			card: <HandlerDigest handler={handler} />,
			notes: [
				...handlerIdentityNotes,
				{
					at: "span.cursor-help",
					text: "the handler prefers to handle messages one at a time",
					side: "top",
				},
				{
					at: ".flex-wrap .text-failing",
					text: "the number of commands that are failing",
					side: "right",
					atText: true,
					keepInk: true,
				},
				{
					at: ".flex-wrap",
					text: "the number of commands waiting to be handled",
					side: "right",
					atText: "7",
					with: [
						{ at: ".flex-wrap", atText: "commands" },
						{ at: ".flex-wrap .text-failing", atText: true, keepInk: true },
					],
					approach: "above",
					dy: -40,
				},
				{
					at: "div.h-2",
					text: "how the recently handled commands were spread across the nodes",
					side: "left",
				},
				{
					at: "svg.h-10",
					text:
						handler.charted === "commands"
							? "commands handled over the last minute"
							: "events recorded over the last minute",
					side: "right",
					into: "chart",
				},
				moonNote,
			],
			paragraphs: [handlerKindReminders.integration],
		};
	}

	const base = {
		events: {
			label: "events vital card",
			title: (
				<>
					The events and event streams of the{" "}
					<ApplicationName application={atSite} />
				</>
			),
			width: 360,
			card: <EventsTile data={overview.events} href={undefined} />,
			notes: [
				{
					at: ".text-4xl",
					text: "the rate of new events, averaged over the last minute",
					when: { has: "per minute" },
					side: "left",
					atText: true,
					approach: "top-left",
					dy: -40,
					with: [
						{ at: ":scope > article > span", atText: "events per minute" },
					],
				},
				{
					at: ".text-4xl",
					text: "total number of events on the application's event streams",
					side: "left",
					atText: true,
					with: [{ at: ":scope > article > span", atText: "events" }],
					approach: "top-left",
					dy: -40,
					when: { lacks: "per minute" },
				},
				{
					at: ":scope > article > span",
					text: "the number of event streams the application has",
					side: "right",
					atText: "2 streams",
					bow: "under",
				},
				{
					at: ":scope > article > span",
					text: "total number of events on the application's event streams",
					side: "top",
					atText: "1.2K events",
				},
				{
					at: "div.h-2",
					text: "how the events are spread across the streams",
					side: "left",
					dy: 6,
				},
				{
					at: "svg.h-12",
					text: "events recorded over the last minute",
					side: "right",
					into: "chart",
					dy: 18,
				},
				{ at: "[data-moon]", text: "the moon", side: "right" },
			],
			paragraphs: [
				{
					text: "Events that the application records are written to event streams. Streams store events in the order they are written, so they can be read in that order.",
					when: { has: "stream" },
				},
				{
					key: "streams",
					when: { part: "div.h-2" },
					text: (
						<>
							The <span className="font-semibold text-fg-soft">statements</span>{" "}
							application's engine spreads events across several event streams.
							An even spread is better; a stream that holds more than its fair
							share limits parallel throughput.
						</>
					),
					more: "Each aggregate instance is bound to a single stream so that its events can be read in order.",
				},
			],
		},
		queues: queuesExplainer("queues vital card", threeQueues),
		cluster: {
			label: "cluster vital card",
			title: (
				<>
					The nodes of the cluster that runs the{" "}
					<ApplicationName application={atSite} />
				</>
			),
			width: 360,
			card: <ClusterTile data={clusterData} href={undefined} />,
			notes: [
				{
					at: ".text-4xl",
					text: "the number of nodes sending a signal now",
					side: "left",
					atText: String(overview.cluster.nodes.length),
					with: [
						{ at: ":scope > article > span", atText: "cluster nodes" },
						{ at: ".text-4xl .text-bad", atText: true, keepInk: true },
					],
					approach: "top-left",
					dy: -40,
				},
				{
					at: ".text-4xl .text-bad",
					text: "the number of nodes with no signal",
					side: "top",
					atText: true,
					keepInk: true,
					// Above the annotation of the workloads, which is above the card too.
					dy: -44,
				},
				{
					at: ":scope > article > span",
					text: "the number of workloads in the cluster",
					side: "top",
					atText: "5 workloads",
				},
				{
					at: "div.h-2",
					text: "how the workloads are spread across the nodes",
					side: "left",
					dy: 6,
				},
				{
					at: "canvas",
					text: "how recently each node sent a heartbeat",
					side: "right",
					into: "chart",
				},
			],
			paragraphs: [
				"Each node is a running process of the application's engine, and the nodes share the application's work.",
				{
					text: "The work is divided into ongoing tasks, such as delivering messages to a handler, which are called workloads. Each workload is given to one node at a time. Workloads vary in size, so two nodes with the same number of workloads can have very different amounts of work to do.",
					when: { has: "workload" },
				},
				"Each node sends heartbeats to show that it is running. Its section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
			],
		},
		handler: {
			label: "aggregate digest",
			title: (
				<>
					The <span className="font-semibold text-fg">account</span> aggregate
					in the <ApplicationName application={atSite} />
				</>
			),
			width: 360,
			card: (
				<HandlerDigest
					handler={{
						...handler,
						summary: { ...handler.summary, failing: 2, queuedMessages: 9 },
					}}
				/>
			),
			notes: [
				...handlerIdentityNotes,
				{
					at: ".text-2xl",
					text: "the number of instances of this aggregate",
					when: { has: "instances" },
					side: "left",
					atText: true,
					with: [{ at: ".flex-col .text-xs", atText: "instances" }],
				},
				{
					at: ".ml-auto .text-2xl .text-failing",
					text: "the number of commands that are failing",
					side: "right",
					atText: true,
					keepInk: true,
				},
				{
					at: ".ml-auto .text-2xl",
					text: "the number of commands waiting to be handled",
					side: "top",
					atText: "7",
					with: [
						{ at: ".ml-auto .text-xs", atText: "commands" },
						{ at: ".ml-auto .text-failing", atText: true, keepInk: true },
					],
				},
				{
					at: "div.h-2",
					text: "how this aggregate's instances are spread across the event streams",
					side: "left",
				},
				{
					at: "svg.h-10",
					text: "events recorded over the last minute",
					side: "right",
					into: "chart",
				},
				{ at: "[data-moon]", text: "the moon", side: "right" },
			],
			paragraphs: [
				handlerKindReminders.aggregate,
				{
					key: "streams",
					// "several" is true only when the bar has more than one segment.
					when: { part: "div.h-2 > :nth-child(2)" },
					text: (
						<>
							The <span className="font-semibold text-fg-soft">statements</span>{" "}
							application's engine spreads this aggregate's instances across
							several event streams. Each instance is bound to a single stream
							so that its events can be read in order.
						</>
					),
				},
			],
		},
		process: {
			label: "process digest",
			title: handlerTitle(processHandler.name, "process"),
			width: 360,
			card: <HandlerDigest handler={processHandler} />,
			notes: [
				...handlerIdentityNotes,
				{
					at: ".flex-wrap",
					text: "the number of instances of this process in progress",
					side: "left",
					atText: "20",
					with: [{ at: ".flex-wrap", atText: "in progress" }],
				},
				{
					at: ".flex-wrap",
					text: "the number of events waiting to be handled",
					side: "top",
					atText: "12",
					with: [{ at: ".flex-wrap", atText: "events" }],
				},
				{
					at: ".flex-wrap .text-failing",
					text: "the number of deadlines that are failing",
					side: "right",
					atText: true,
					keepInk: true,
				},
				{
					at: ".flex-wrap",
					text: "the number of deadlines ready to be handled now",
					side: "right",
					atText: "6",
					with: [
						{ at: ".flex-wrap", atText: "deadlines" },
						{ at: ".flex-wrap .text-failing", atText: true, keepInk: true },
					],
					approach: "above",
					dy: -40,
				},
				{
					at: "div.h-2",
					text: "how this process's instances are spread across the deadline queues",
					side: "left",
				},
				{
					at: "svg.h-10",
					text: "events handled over the last minute",
					side: "right",
					into: "chart",
				},
				moonNote,
			],
			paragraphs: [
				handlerKindReminders.process,
				{
					key: "queues",
					// "several" is true only when the bar has more than one segment.
					when: { part: "div.h-2 > :nth-child(2)" },
					text: (
						<>
							The <span className="font-semibold text-fg-soft">statements</span>{" "}
							application's engine spreads this process's instances across
							several deadline queues. Each instance is bound to the queue that
							holds its deadlines.
						</>
					),
				},
			],
		},
		integration: integrationExplainer("integration digest", integrationHandler),
		projection: {
			label: "projection digest",
			title: handlerTitle(projectionHandler.name, "projection"),
			width: 360,
			card: <HandlerDigest handler={projectionHandler} />,
			notes: [
				...handlerIdentityNotes,
				{
					at: ".flex-wrap",
					text: "the number of events waiting to be handled",
					side: "right",
					atText: "12",
					with: [{ at: ".flex-wrap", atText: "events" }],
				},
				{
					at: "div.h-2",
					text: "how the recently handled events were spread across the nodes",
					side: "left",
				},
				{
					at: "svg.h-10",
					text: "events handled over the last minute",
					side: "right",
					into: "chart",
				},
				moonNote,
			],
			paragraphs: [handlerKindReminders.projection],
		},
		compact: {
			label: "compact digest",
			title: (
				<>
					The <span className="font-semibold text-fg">checkout</span>{" "}
					application at the{" "}
					<span className="font-semibold text-fg">eu-west</span> site
				</>
			),
			width: 220,
			card: <CompactDigests data={siteOf([compactApp], euWest)} alert="icon" />,
			notes: [
				{
					at: "span.truncate",
					text: "the application's name",
					side: "left",
					atText: true,
				},
				{
					at: ".tabular-nums > :first-child",
					text: "the rate of new events, averaged over the last minute",
					when: { has: "/min" },
					side: "left",
					atText: true,
					approach: "below",
					dy: 34,
				},
				{
					at: ".tabular-nums > :last-child .text-failing",
					text: "the number of messages that are failing",
					side: "right",
					atText: true,
					keepInk: true,
				},
				{
					at: ".tabular-nums > :last-child",
					text: "the number of messages ready to be delivered now",
					side: "top",
					atText: formatCompact(compactApp.queues?.messages ?? 0),
					with: [
						{
							at: ".tabular-nums > :last-child .text-failing",
							atText: true,
							keepInk: true,
						},
					],
				},
			],
			paragraphs: [
				{
					text: "Commands and deadlines wait on queues until they are delivered. A command is ready to be delivered as soon as it is queued, and a deadline once its scheduled time arrives.",
					when: { part: '.tabular-nums [class*="color-queues"]' },
				},
				{
					text: "Fewer ready messages is better. If the number keeps rising, messages are becoming ready faster than they are being handled.",
					when: { part: '.tabular-nums [class*="color-queues"]' },
				},
			],
		},
	} satisfies Record<string, ExplainerSpec>;

	/**
	 * The queues vital card of an engine that doesn't report the messages waiting,
	 * whose headline is the rate, for each thing that the rate can count.
	 */
	const rateHeadlines = Object.fromEntries(
		(Object.keys(queuesRateWords) as Counted[]).map((of) => [
			rateHeadline(of),
			queuesExplainer(
				`queues vital card of an engine that reports no messages waiting, counting ${countedWords[of].counted}`,
				{
					...overview.queues,
					queues: undefined,
					failing: 0,
					throughput: { perMinute: 442, of },
				},
			),
		]),
	) as Record<ReturnType<typeof rateHeadline>, ExplainerSpec>;

	/** rateHeadline returns which card is the rate-headline queues card for `of`. */
	function rateHeadline(of: Counted) {
		return `queuesRate ${of}` as const;
	}

	const explainers: Record<Which, ExplainerSpec> = {
		...base,
		eventsOneStream: {
			...base.events,
			label: "events vital card of an engine with one event stream",
			card: (
				<EventsTile
					data={{ ...overview.events, oneStream: true }}
					href={undefined}
				/>
			),
		},
		eventsNoRate: {
			...base.events,
			label: "events vital card of an engine that doesn't report its rate",
			card: (
				<EventsTile
					data={{ ...overview.events, rate: undefined, history: undefined }}
					href={undefined}
				/>
			),
		},
		aggregateOneStream: {
			...base.handler,
			label: "aggregate digest whose instances are all on one event stream",
			card: (
				<HandlerDigest
					handler={{
						...handler,
						summary: {
							...handler.summary,
							failing: 2,
							queuedMessages: 9,
							instances: 100,
							bindings: [{ id: "113cbdc3", instances: 100 }],
						},
					}}
				/>
			),
		},
		aggregateNoBindings: {
			...base.handler,
			label: "aggregate digest of an engine that doesn't report its instances",
			card: (
				<HandlerDigest
					handler={{
						...handler,
						summary: {
							...handler.summary,
							failing: 2,
							queuedMessages: 9,
							instances: undefined,
							bindings: undefined,
						},
					}}
				/>
			),
		},
		processNoDeadlines: {
			...base.process,
			label: "process digest of a process that schedules no deadlines",
			card: (
				<HandlerDigest
					handler={{
						...processHandler,
						summary: {
							failing: 0,
							unhandledEvents: 12,
							schedulesDeadlines: false,
							bindings: [{ id: undefined, instances: 20 }],
						},
					}}
				/>
			),
		},
		processOneQueue: {
			...base.process,
			label: "process digest whose instances are all on one deadline queue",
			card: (
				<HandlerDigest
					handler={{
						...processHandler,
						summary: {
							...processHandler.summary,
							bindings: [{ id: "113cbdc3", instances: 20 }],
						},
					}}
				/>
			),
		},
		processNoBindings: {
			...base.process,
			label: "process digest of an engine that doesn't report its instances",
			card: (
				<HandlerDigest
					handler={{
						...processHandler,
						summary: { ...processHandler.summary, bindings: undefined },
					}}
				/>
			),
		},
		integrationNoEvents: integrationExplainer(
			"integration digest of an integration that doesn't record any events",
			{
				...integrationHandler,
				charted: "commands",
				minimizesConcurrency: false,
			},
		),
		integrationNoNodes: integrationExplainer(
			"integration digest of an engine that doesn't report which nodes handled its commands",
			{ ...integrationHandler, nodes: undefined },
		),
		projectionNoNodes: {
			...base.projection,
			label:
				"projection digest of an engine that doesn't report which nodes handled its events",
			card: (
				<HandlerDigest handler={{ ...projectionHandler, nodes: undefined }} />
			),
		},
		compactNoRate: {
			...base.compact,
			label:
				"compact digest of an engine that doesn't report its rate of events",
			card: (
				<CompactDigests
					data={siteOf([{ ...compactApp, events: undefined }], euWest)}
					alert="icon"
				/>
			),
		},
		compactNoMessages: {
			...base.compact,
			label: "compact digest of an engine that doesn't report its messages",
			card: (
				<CompactDigests
					data={siteOf([{ ...compactApp, queues: undefined }], euWest)}
					alert="icon"
				/>
			),
		},
		clusterNoWorkloads: {
			...base.cluster,
			label: "cluster vital card of an engine that doesn't report workloads",
			card: (
				<ClusterTile
					data={{ ...clusterData, reportsWorkloads: false }}
					href={undefined}
				/>
			),
		},
		queuesOneQueue: queuesExplainer(
			"queues vital card of an engine with one queue",
			{
				...threeQueues,
				queues: [{ id: "113cbdc3", size: 19 }],
				oneQueue: true,
			},
		),
		queuesNoRate: queuesExplainer(
			"queues vital card of an engine that doesn't report its rate",
			{ ...threeQueues, throughput: undefined, history: undefined },
		),
		queuesRemoved: queuesExplainer(
			"queues vital card of an engine that counts the messages removed",
			{ ...threeQueues, throughput: { perMinute: 442, of: "removed" } },
		),
		queuesCommands: queuesExplainer(
			"queues vital card of an engine that counts only the commands handled",
			{
				...threeQueues,
				throughput: { perMinute: 442, of: "commands handled" },
			},
		),
		queuesDeadlines: queuesExplainer(
			"queues vital card of an engine that counts only the deadlines handled",
			{
				...threeQueues,
				throughput: { perMinute: 442, of: "deadlines handled" },
			},
		),
		...rateHeadlines,
	};
	return explainers;
}

/**
 * The applications of the site view's fixture, with two with no signal, and two
 * with only some of their nodes sending a signal.
 */
const someOut = withSignal(siteApplications, {
	out: ["kyc", "payroll"],
	partly: { orders: 0.5, payments: 0.67 },
});

/**
 * The site of the explainers of the site view's tiles: six applications sending
 * a signal, two of which have failing messages.
 */
const explainedSite = siteOf(
	siteApplications
		.filter((a) => (a.queues?.failing ?? 0) > 0)
		.slice(0, 2)
		.concat(
			siteApplications
				.filter((a) => (a.queues?.failing ?? 0) === 0)
				.slice(0, 4),
		),
	euWest,
);

/**
 * The site of the applications tile's explainer, with two applications that send
 * no signal.
 */
const explainedOut = siteOf(
	someOut.map((a, i, all) =>
		// Most of the applications have just sent a heartbeat, which keeps their
		// share of the chart full, and some haven't for a while, so that the
		// chart dips here and there and is high at its right end, where its arrow
		// ends.
		[6, 21, 22, 47, 63].includes(i) && i < all.length - 10
			? a
			: { ...a, heartbeats: [1000] },
	),
	euWest,
);

/**
 * siteTitle returns the title of a site tile's explainer: what it is about, at
 * the site with the given name. For the applications at no site, it says nothing
 * of a site, because an operator who has no sites never meets the word.
 */
function siteTitle(what: string, site: string | undefined) {
	return site === undefined ? (
		what
	) : (
		<>
			{what} at the <span className="font-semibold text-fg">{site}</span> site
		</>
	);
}

/**
 * siteExplainers returns the explainers of the site view's tiles, for the site
 * with the given name, or for the applications that run at no site.
 */
export function siteExplainers(site: string | undefined): {
	events: ExplainerSpec;
	queues: ExplainerSpec;
	applications: ExplainerSpec;
} {
	return {
		events: {
			...siteEventsExample,
			title: siteTitle(
				"The events and event streams of the applications",
				site,
			),
		},
		queues: {
			...siteQueuesExample,
			title: siteTitle("The messages and queues of the applications", site),
		},
		applications: {
			...siteApplicationsExample,
			title: siteTitle("The applications", site),
		},
	};
}

const siteEventsExample: ExplainerSpec = {
	label: "events tile",
	// siteExplainers gives the title, which names the site.
	title: null,
	width: 360,
	card: explainedSite.events && (
		<SiteEventsTile data={explainedSite} events={explainedSite.events} />
	),
	notes: [
		{
			at: ".text-4xl",
			text: "the rate of new events across the applications, averaged over the last minute",
			side: "left",
			atText: true,
			with: [{ at: ":scope > article > span", atText: "events per minute" }],
			approach: "top-left",
			dy: -40,
		},
		{
			at: ":scope > article > span",
			text: "total number of events on the applications' event streams",
			side: "top",
			atText: `${formatCompact(explainedSite.events?.streams?.events ?? 0)} events`,
		},
		{
			at: ":scope > article > span",
			text: "the number of event streams the applications have",
			side: "right",
			atText: `${formatCompact(explainedSite.events?.streams?.count ?? 0)} streams`,
			bow: "under",
		},
		{
			at: "div.h-2",
			text: "how fast each application is recording new events, compared with the others",
			side: "left",
			dy: 6,
		},
		{
			at: "svg.h-12",
			text: "events recorded over the last minute",
			side: "right",
			into: "chart",
		},
		{
			at: "[data-moon]",
			text: "the moon",
			side: "right",
		},
	],
	paragraphs: [
		{
			text: "Events that an application records are written to event streams. Streams store events in the order they are written, so they can be read in that order.",
			when: { has: "stream" },
		},
	],
};

const siteQueuesExample: ExplainerSpec = {
	label: "queues tile",
	// siteExplainers gives the title, which names the site.
	title: null,
	width: 360,
	card: explainedSite.queues && (
		<SiteQueuesTile data={explainedSite} queues={explainedSite.queues} />
	),
	notes: [
		{
			at: ".text-4xl",
			text: "the number of messages ready to be delivered now, across the applications",
			side: "left",
			atText: formatCompact(explainedSite.queues?.messages ?? 0),
			with: [
				{ at: ":scope > article > span", atText: "messages" },
				{ at: ".text-4xl .text-failing", atText: true, keepInk: true },
			],
			approach: "top-left",
			dy: -40,
		},
		{
			at: ".text-4xl .text-failing",
			text: "the number of messages that are failing",
			side: "top",
			wordsLeft: true,
			atText: true,
			keepInk: true,
		},
		{
			at: ":scope > article > span",
			text: "the number of queues the applications have",
			side: "top",
			atText: `${formatCompact(explainedSite.queues?.queues ?? 0)} queues`,
		},
		{
			at: ":scope > article > span",
			text: "the rate of handled messages across the applications, averaged over the last minute",
			side: "right",
			atText: "/min",
			dy: -4,
		},
		{
			at: "div.h-2",
			text: "how many ready messages each application has, compared with the others",
			side: "left",
			dy: 6,
		},
		{
			at: "svg.h-12",
			text: "messages handled over the last minute",
			side: "right",
			into: "chart",
		},
		{
			at: "[data-moon]",
			text: "the moon",
			side: "right",
		},
	],
	paragraphs: [
		{
			text: "Commands and deadlines wait on queues until they are delivered. A command is ready to be delivered as soon as it is queued, and a deadline once its scheduled time arrives.",
		},
		{
			text: "Fewer ready messages is better. If the number keeps rising, messages are becoming ready faster than they are being handled.",
		},
	],
};

const siteApplicationsExample: ExplainerSpec = {
	label: "applications tile",
	// siteExplainers gives the title, which names the site.
	title: null,
	width: 360,
	card: <ApplicationsTile data={explainedOut} />,
	notes: [
		{
			at: ".text-4xl",
			text: "the number of applications sending a signal now",
			side: "left",
			atText: String(
				explainedOut.applications.filter((a) => a.nodes > 0).length,
			),
			with: [
				{ at: ":scope > article > span", atText: "applications" },
				{ at: ".text-4xl .text-bad", atText: true, keepInk: true },
			],
			approach: "top-left",
			dy: -40,
		},
		{
			at: ".text-4xl .text-bad",
			text: "the number of applications with no signal",
			side: "top",
			atText: true,
			keepInk: true,
		},
		{
			at: "canvas",
			text: "how recently each application sent a heartbeat",
			side: "right",
			into: "chart",
		},
	],
	paragraphs: [
		{
			text: "Each application's engine sends heartbeats to show that it is running. An application's section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
		},
	],
};

const engineExample: ExplainerSpec = {
	label: "engine tile",
	// engineExplainer gives the title, which names the application.
	title: null,
	width: 360,
	card: (
		<EngineTile
			data={{
				// It has just sent a heartbeat, so that its chart is full.
				node: {
					...(overview.cluster.nodes[0] as LiveNode),
					heartbeats: [1000],
				},
			}}
			href={undefined}
		/>
	),
	notes: [
		{
			at: ".text-4xl",
			text: "whether the engine is sending a signal now",
			side: "left",
			atText: true,
			approach: "top-left",
			dy: -40,
		},
		{
			at: "canvas",
			text: "how recently the engine sent a heartbeat",
			side: "right",
			into: "chart",
		},
	],
	paragraphs: [
		{
			text: "The engine sends heartbeats to show that it is running. The heartbeat chart rises with each heartbeat and falls until the next. If the heartbeats stop, the chart sinks to the bottom, and the card shows the engine as offline.",
		},
	],
};

/**
 * engineExplainer returns the explainer of the engine tile, for the given
 * application at its site, which its title names.
 */
export function engineExplainer(
	atSite: Application & { site?: string },
): ExplainerSpec {
	return {
		...engineExample,
		label: "engine tile",
		title: (
			<>
				The engine that runs the <ApplicationName application={atSite} />
			</>
		),
	};
}

/** The data of the cluster view's tiles. */
type Tiles = OverviewData;

/**
 * eventsExplainerOf returns which explainer the events tile has, for what the
 * tile shows: the card of an engine with one event stream, or of one that
 * doesn't report its rate, leaves out what it doesn't have.
 */
export function eventsExplainerOf(data: NonNullable<Tiles["events"]>): Which {
	if (data.oneStream) {
		return "eventsOneStream";
	}
	return data.rate === undefined ? "eventsNoRate" : "events";
}

/**
 * queuesExplainerOf returns which explainer the queues tile has, for what the
 * tile shows: one queue, no rate, the rate as the headline with no messages
 * waiting, or a rate of something other than the messages handled.
 */
export function queuesExplainerOf(data: NonNullable<Tiles["queues"]>): Which {
	if (data.oneQueue) {
		return "queuesOneQueue";
	}
	if (data.throughput === undefined) {
		return "queuesNoRate";
	}
	const of = data.throughput.of ?? "removed";
	if (data.queues === undefined) {
		return `queuesRate ${of}`;
	}
	switch (of) {
		case "handled":
			return "queues";
		case "removed":
			return "queuesRemoved";
		case "commands handled":
			return "queuesCommands";
		case "deadlines handled":
			return "queuesDeadlines";
	}
}

/**
 * clusterExplainerOf returns which explainer the cluster tile has: the card of
 * an engine that doesn't divide its work leaves out the workloads.
 */
export function clusterExplainerOf(data: NonNullable<Tiles["cluster"]>): Which {
	return data.reportsWorkloads ? "cluster" : "clusterNoWorkloads";
}

/**
 * handlerExplainerOf returns which explainer a handler's digest has, for its
 * kind and for what its engine reports of it.
 */
export function handlerExplainerOf(handler: HandlerData): Which {
	const { summary } = handler;
	switch (handler.kind) {
		case "aggregate":
			if (summary.bindings === undefined) {
				return "aggregateNoBindings";
			}
			return summary.bindings.length === 1 ? "aggregateOneStream" : "handler";
		case "process":
			if (!summary.schedulesDeadlines) {
				return "processNoDeadlines";
			}
			if (summary.bindings === undefined) {
				return "processNoBindings";
			}
			return summary.bindings.filter((b) => b.id !== undefined).length === 1
				? "processOneQueue"
				: "process";
		case "integration":
			if (handler.nodes === undefined) {
				return "integrationNoNodes";
			}
			return handler.charted === "commands"
				? "integrationNoEvents"
				: "integration";
		case "projection":
			return handler.nodes === undefined ? "projectionNoNodes" : "projection";
	}
}

/**
 * compactExplainerOf returns which explainer a compact digest has: the card of
 * an engine that doesn't report a figure leaves it out.
 */
export function compactExplainerOf(app: SiteApplication): Which {
	if (app.events === undefined) {
		return "compactNoRate";
	}
	return app.queues === undefined ? "compactNoMessages" : "compact";
}

/**
 * handlerExplainer returns the explainer of the digest of the given handler of
 * the given application, from the cluster view's explainers, with a title and a
 * label that name the handler.
 */
export function handlerExplainer(
	explainers: Record<Which, ExplainerSpec>,
	application: Application,
	handler: HandlerData,
): ExplainerSpec {
	const spec = explainers[handlerExplainerOf(handler)];
	return {
		...spec,
		// The copy has the example's figures and the live handler's name, so that
		// it reads as this handler's digest.
		card: isValidElement<{ handler: HandlerData }>(spec.card)
			? cloneElement(spec.card, {
					handler: { ...spec.card.props.handler, name: handler.name },
				})
			: spec.card,
		label: `${handler.name} ${handler.kind} digest`,
		title: (
			<>
				The <span className="font-semibold text-fg">{handler.name}</span>{" "}
				{handler.kind} in the <ApplicationName application={application} />
			</>
		),
	};
}

/**
 * compactExplainer returns the explainer of the compact digest of the given
 * application at the given site, or at no site, with a title and a label that
 * name the application, and the site if there is one.
 */
export function compactExplainer(
	explainers: Record<Which, ExplainerSpec>,
	app: SiteApplication,
	site: Site | undefined,
): ExplainerSpec {
	const name = app.application.name;
	const spec = explainers[compactExplainerOf(app)];
	return {
		...spec,
		// The copy has the example's figures and the live application's name, so
		// that it reads as this application's compact digest.
		card: isValidElement<{ data: SiteData }>(spec.card)
			? cloneElement(spec.card, {
					data: {
						...spec.card.props.data,
						applications: spec.card.props.data.applications.map((a) => ({
							...a,
							application: { ...a.application, name },
						})),
					},
				})
			: spec.card,
		label: `${name} compact digest`,
		title:
			site === undefined ? (
				<>
					The <span className="font-semibold text-fg">{name}</span> application
				</>
			) : (
				<>
					The <span className="font-semibold text-fg">{name}</span> application
					at the <span className="font-semibold text-fg">{site.name}</span> site
				</>
			),
	};
}
