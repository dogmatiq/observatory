import { formatCompact, formatPercent } from "../lib/format.ts";
import type { SegmentAbout } from "../lib/segments.ts";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import { Ramped } from "./Ramped.tsx";

/**
 * What each kind of thing that a bar's segments can be of is called, and what
 * the bar counts in it.
 */
const things = {
	"event-stream": {
		subsystem: "streams",
		icon: "event-stream",
		kind: "Event stream",
		thing: ["stream", "streams"],
		amount: ["event", "events"],
		advice:
			"An even distribution is better. Events on a stream are processed in order, so a stream that holds more than its fair share limits throughput.",
	},
	queue: {
		subsystem: "queues",
		icon: "queue",
		kind: "Queue",
		thing: ["queue", "queues"],
		amount: ["message", "messages"],
		advice:
			"An even distribution is better, because it lets the messages that are waiting be worked through in parallel.",
	},
} as const;

/**
 * SegmentCard is a small card about the thing that a segment of a bar is of,
 * which is the content of the popover of the segment. It says what kind of thing
 * it is, with its ID, how much of the bar it is, and what the bar shows.
 */
export function SegmentCard({ about }: { about: SegmentAbout }) {
	const { amount, share, total } = about;
	const of = things[about.thing];

	return (
		<InfoCard
			subsystem={of.subsystem}
			icon={of.icon}
			kind={of.kind}
			identifier={<Identifier id={about.id} />}
			figure={{
				value: <Ramped value={amount} format={formatCompact} />,
				unit: of.amount[amount === 1 ? 0 : 1],
				aside: <Ramped value={share} format={formatPercent} />,
			}}
		>
			<p>{barSentence(of, total)}</p>
			{total.things > 1 && total.amount > 1 && <p>{of.advice}</p>}
		</InfoCard>
	);
}

/**
 * barSentence says what the bar of a segment shows. One event or message has no
 * distribution, so the sentence says that the segment is the whole bar.
 */
function barSentence(
	of: (typeof things)[keyof typeof things],
	total: { amount: number; things: number },
): string {
	const [oneThing, manyThings] = of.thing;
	const [oneAmount, manyAmount] = of.amount;

	if (total.amount === 1) {
		return `The bar shows the distribution of the application's ${manyAmount} across its ${manyThings}, but there is only 1 ${oneAmount} so this segment is the whole bar.`;
	}

	const count = formatCompact(total.amount);
	return total.things === 1
		? `The bar shows the distribution of the application's ${count} ${manyAmount} across its ${manyThings}. The application only has one ${oneThing}, so this segment is the whole bar.`
		: `The bar shows the distribution of the application's ${count} ${manyAmount} across its ${total.things} ${manyThings}.`;
}
