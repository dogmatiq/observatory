import { useContext } from "react";
import { formatCompact, formatPercent } from "../lib/format.ts";
import type { SegmentAbout } from "../lib/segments.ts";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import { VersionsContext, versionsSentence } from "./partial.ts";
import { Ramped } from "./Ramped.tsx";

/**
 * What each kind of thing that a bar's segments can be of is called, what the bar
 * counts in it, and what the card says about the bar, about how the bar is best
 * spread, if anything is promised about that, and about how not to misread it, if
 * there is a likely misreading.
 */
const things = {
	"event-stream": {
		subsystem: "streams",
		icon: "event-stream",
		kind: "Event stream",
		amount: ["event", "events"],
		bar: "This bar shows how the application's events are spread across its streams.",
		advice:
			"An even distribution is better. Events on a stream are processed in order, so a stream that holds more than its fair share limits throughput.",
	},
	queue: {
		subsystem: "queues",
		icon: "queue",
		kind: "Queue",
		amount: ["message", "messages"],
		bar: "This bar shows how the application's messages are spread across its queues.",
		advice:
			"An even distribution is better, because it lets the messages that are waiting be worked through in parallel.",
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
 * nothing is promised about how an even distribution of workloads serves it.
 */
export function SegmentCard({ about }: { about: SegmentAbout }) {
	const versions = useContext(VersionsContext);
	const of = things[about.thing];

	// A node that doesn't report its workloads while others do has a share that
	// isn't known, so its card says only which node it is, and why, as a status.
	if (about.total === undefined) {
		return (
			<InfoCard
				subsystem={of.subsystem}
				icon={of.icon}
				kind={of.kind}
				identifier={<Identifier id={about.id} of={of.kind.toLowerCase()} />}
				status={{
					icon: "alert",
					text: `This node's workloads are unknown, but other nodes in the cluster report their workloads.${versionsSentence(versions, "This node")}`,
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
			identifier={<Identifier id={about.id} of={of.kind.toLowerCase()} />}
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
			<p>{of.bar}</p>
			{"reading" in of && <p>{of.reading}</p>}
			{/* The advice is about how the bar is spread, so it is only there when
			the bar can be spread unevenly. */}
			{"advice" in of && total.things > 1 && total.amount > 1 && (
				<p>{of.advice}</p>
			)}
		</InfoCard>
	);
}
