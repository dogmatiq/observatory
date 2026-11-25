import { formatCompact, formatPercent } from "../lib/format.ts";
import {
	type ApplicationAbout,
	applicationAmounts,
	type SegmentAbout,
} from "../lib/segments.ts";
import { InfoCard } from "./InfoCard.tsx";
import { Ramped } from "./Ramped.tsx";

/**
 * What each kind of thing that a bar's segments can be of is called, and what the
 * bar counts in it.
 */
export const things = {
	"event-stream": {
		subsystem: "streams",
		icon: "event-stream",
		kind: "Event stream",
		amount: ["event", "events"],
	},
	queue: {
		subsystem: "queues",
		icon: "queue",
		kind: "Queue",
		amount: ["message", "messages"],
	},
	node: {
		subsystem: "cluster",
		icon: "node",
		kind: "Node",
		amount: ["workload", "workloads"],
	},
} as const;

/**
 * SegmentCard is a small card about the thing that a segment of a bar is of,
 * which is the content of the popover of the segment. It drills down: it says what
 * kind of thing it is, with its ID, and how much of the bar it is, as its figures,
 * which vary. What the bar shows is in its card's explainer.
 */
export function SegmentCard({ about }: { about: SegmentAbout }) {
	if (about.thing === "application") {
		return <ApplicationSegmentCard about={about} />;
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

	const { amount, share } = about;

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
		/>
	);
}

/** The subsystem whose colors the card of a segment of each bar of a site's applications has. */
const applicationBars = {
	events: "streams",
	messages: "queues",
} as const;

/**
 * ApplicationSegmentCard is the card of a segment of a bar of a site's
 * applications. It drills down, as the card of a stream does: it names the
 * application, and gives its amount and its share as its figures.
 */
function ApplicationSegmentCard({ about }: { about: ApplicationAbout }) {
	const subsystem = applicationBars[about.of];
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
		/>
	);
}
