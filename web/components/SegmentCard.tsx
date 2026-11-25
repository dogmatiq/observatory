import { formatCompact, formatPercent } from "../lib/format.ts";
import {
	type ApplicationAbout,
	applicationAmounts,
	type SegmentAbout,
} from "../lib/segments.ts";
import { InfoCard } from "./InfoCard.tsx";
import { Ramped } from "./Ramped.tsx";

/**
 * What each kind of thing that a bar's segments can be of is called, what the bar
 * counts in it, and what the card says about the bar, about how the bar is best
 * spread, if anything is promised about that, and about how not to misread it, if
 * there is a likely misreading.
 */
export const things = {
	"event-stream": {
		subsystem: "streams",
		icon: "event-stream",
		kind: "Event stream",
		amount: ["event", "events"],
		bar: "This bar shows how the application's events are spread across its streams.",
		advice:
			"An even spread is better. Events on a stream are processed in order, so a stream that holds more than its fair share limits throughput.",
	},
	queue: {
		subsystem: "queues",
		icon: "queue",
		kind: "Queue",
		amount: ["message", "messages"],
		bar: "This bar shows how the application's messages are spread across its queues.",
		advice:
			"An even spread is better, because it lets the messages that are waiting be worked through in parallel.",
	},
	node: {
		subsystem: "cluster",
		icon: "node",
		kind: "Node",
		amount: ["workload", "workloads"],
		bar: "This bar shows how the cluster's workloads are spread across its nodes.",
		reading:
			"Workloads vary in size, so two nodes with the same number of workloads can have very different amounts of work to do.",
	},
} as const;

/**
 * SegmentCard is a small card about the thing that a segment of a bar is of,
 * which is the content of the popover of the segment. It drills down: it says what
 * kind of thing it is, with its ID, and how much of the bar it is, as its figures,
 * which vary. What it says about the bar explains, so it is the same words each
 * time, and has no figures in it. The advice about how the bar is best spread is
 * there only when the bar can be spread unevenly, which is when there is more than
 * one thing, and more than one of what is spread. A node has no advice, because
 * nothing is promised about how an even spread of workloads serves it.
 *
 * Without `paragraphs`, the card leaves out what it says about the bar and its
 * advice, as every segment's card will once the explainers are in the views.
 * Only /review leaves them out, until then.
 */
export function SegmentCard({
	about,
	paragraphs = true,
}: {
	about: SegmentAbout;
	paragraphs?: boolean;
}) {
	if (about.thing === "application") {
		return <ApplicationSegmentCard about={about} paragraphs={paragraphs} />;
	}

	const of = things[about.thing];

	// A node that doesn't report its workloads while others do has a share that
	// isn't known, so its card says only which node it is, and why, as a status.
	if (about.total === undefined) {
		return (
			<InfoCard
				subsystem={of.subsystem}
				icon={of.icon}
				kind={of.kind}
				id={{ id: about.id, what: `${of.kind.toLowerCase()} ID` }}
				status={{
					icon: "alert",
					text: "This node's workloads are unknown, but other nodes in the cluster report their workloads.",
				}}
			/>
		);
	}

	const { amount, share, total } = about;

	return (
		<InfoCard
			subsystem={of.subsystem}
			icon={of.icon}
			kind={of.kind}
			id={{ id: about.id, what: `${of.kind.toLowerCase()} ID` }}
			figure={{
				value: <Ramped value={amount} format={formatCompact} />,
				unit: of.amount[amount === 1 ? 0 : 1],
				// A thing that has none has no share of the bar.
				aside:
					amount === 0 ? undefined : (
						<Ramped value={share} format={formatPercent} />
					),
			}}
		>
			{paragraphs && (
				<>
					<p>{of.bar}</p>
					{"reading" in of && <p>{of.reading}</p>}
					{/* The advice is about how the bar is spread, so it is only there
					when the bar can be spread unevenly. */}
					{"advice" in of && total.things > 1 && total.amount > 1 && (
						<p>{of.advice}</p>
					)}
				</>
			)}
		</InfoCard>
	);
}

/**
 * What the card of a segment of each bar of a site's applications says about the
 * bar, and the subsystem whose colors it has.
 */
const applicationBars = {
	events: {
		subsystem: "streams",
		bar: "This bar shows which applications are recording the most events.",
	},
	messages: {
		subsystem: "queues",
		bar: "This bar shows which applications have the most messages waiting.",
	},
} as const;

/**
 * ApplicationSegmentCard is the card of a segment of a bar of a site's
 * applications. It drills down, as the card of a stream does: it names the
 * application, gives its amount and its share as its figures, and says what the
 * bar shows. It gives no advice, because nothing is promised about how the
 * applications at a site are best spread.
 */
function ApplicationSegmentCard({
	about,
	paragraphs,
}: {
	about: ApplicationAbout;
	paragraphs: boolean;
}) {
	const { subsystem, bar } = applicationBars[about.of];
	const [singular, plural] = applicationAmounts[about.of];

	return (
		<InfoCard
			subsystem={subsystem}
			icon="application"
			kind="Application"
			name={about.application.name}
			figure={{
				value: <Ramped value={about.amount} format={formatCompact} />,
				unit: about.amount === 1 ? singular : plural,
				aside: <Ramped value={about.share} format={formatPercent} />,
			}}
		>
			{paragraphs && <p>{bar}</p>}
		</InfoCard>
	);
}
