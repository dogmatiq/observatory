import type { IconName } from "./Icon.tsx";
import { InfoCard } from "./InfoCard.tsx";
import type { Subsystem } from "./subsystems.ts";

/**
 * RateCard is a small card about a figure that is a rate, such as the events per
 * minute of the events tile, which is the content of the popover of the figure.
 * It says what the rate is of, and the time that it is averaged over. It doesn't
 * repeat the figure, which is what is pointed at.
 *
 * `state` is whether the rate is known, or lost, which is when the figure shows
 * the last value that it had, or isn't available, which is when the figure is a
 * rounded block of dots.
 */
export function RateCard({
	subsystem,
	icon,
	kind,
	description,
	note,
	state,
}: {
	subsystem: Subsystem;
	icon: IconName;

	/** What the rate is of, such as "Event rate". */
	kind: string;

	/**
	 * What the rate is of, as a clause with no full stop, such as "The rate at
	 * which the application is recording new events".
	 */
	description: string;

	/**
	 * A sentence that says more, if the rate needs it, such as that it is built from
	 * other statistics.
	 */
	note?: string;

	state: "known" | "lost" | "unavailable";
}) {
	return (
		<InfoCard
			subsystem={subsystem}
			icon={icon}
			kind={kind}
			status={
				state === "known"
					? undefined
					: {
							icon: "spinner",
							busy: true,
							text:
								state === "lost"
									? "No new samples are arriving, so this average is out of date."
									: "There aren't enough samples yet, so the average can't be calculated.",
						}
			}
		>
			<p>{description}, averaged over the last minute.</p>
			{note && <p>{note}</p>}
		</InfoCard>
	);
}
