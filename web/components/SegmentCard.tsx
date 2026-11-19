import { formatCompact, formatPercent } from "../lib/format.ts";
import type { SegmentAbout } from "../lib/segments.ts";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import { Ramped } from "./Ramped.tsx";

/**
 * SegmentCard is a small card about the thing that a segment of a bar is of,
 * which is the content of the popover of the segment. It says what kind of thing
 * it is, with its ID, how much of the bar it is, and what the bar shows.
 */
export function SegmentCard({ about }: { about: SegmentAbout }) {
	const { events, share, total } = about;

	return (
		<InfoCard
			subsystem="streams"
			icon="event-stream"
			kind="Event stream"
			identifier={<Identifier id={about.id} />}
			figure={{
				value: <Ramped value={events} format={formatCompact} />,
				unit: events === 1 ? "event" : "events",
				aside: <Ramped value={share} format={formatPercent} />,
			}}
		>
			<p>{barSentence(total)}</p>
			{total.streams > 1 && total.events > 1 && (
				<p>
					An even distribution is better. Events on a stream are processed in
					order, so a stream that holds more than its fair share limits
					throughput.
				</p>
			)}
		</InfoCard>
	);
}

/**
 * barSentence says what the bar of a stream's segment shows. One event has no
 * distribution, so the sentence says that the segment is the whole bar.
 */
function barSentence(total: { events: number; streams: number }): string {
	if (total.events === 1) {
		return "The bar shows the distribution of the application's events across its streams, but there is only 1 event so this segment is the whole bar.";
	}

	return total.streams === 1
		? `The bar shows the distribution of the application's ${formatCompact(total.events)} events across its streams. The application only has one stream, so this segment is the whole bar.`
		: `The bar shows the distribution of the application's ${formatCompact(total.events)} events across its ${total.streams} streams.`;
}
