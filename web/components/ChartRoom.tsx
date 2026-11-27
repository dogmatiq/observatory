import type { ReactNode } from "react";
import { isIdle } from "../lib/sparkline.ts";
import type { Chart } from "../model.ts";
import { Presence } from "./Presence.tsx";
import { Sky } from "./Sky.tsx";
import { useChartScroll } from "./Sparkline.tsx";

/**
 * ChartRoom fills the room along the bottom of a card with the card's chart, or
 * with the sky when there is nothing to chart: when the card has no chart, or
 * when its chart has been at zero for the whole of the minute that it shows.
 *
 * The chart comes back with the first value above zero, and stays for at least
 * a minute, until that value has scrolled out of it. The chart and the sky fade
 * into each other when one takes the other's place.
 */
export function ChartRoom({
	chart,
	skyHeight,
	children,
}: {
	chart: Chart | undefined;

	/** The height of the sky, in pixels, as [Sky] has it. */
	skyHeight?: number;

	/** Draws the chart. */
	children: (chart: Chart) => ReactNode;
}) {
	const scroll = useChartScroll();
	const shown =
		chart && !isIdle({ ...chart, end: chart.end + scroll }) ? chart : undefined;

	return (
		<>
			<Presence shape="fade" className="absolute inset-x-0 bottom-0">
				{!shown && <Sky height={skyHeight} />}
			</Presence>
			<Presence shape="fade" className="absolute inset-x-0 bottom-0">
				{shown && children(shown)}
			</Presence>
		</>
	);
}
