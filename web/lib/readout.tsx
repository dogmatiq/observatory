import { createContext, useContext } from "react";

/**
 * Readout is what a chart says about the place on it that is pointed at, or
 * anchored: the value there, in the unit that the chart is in, and how long ago.
 * A chart of things rather than of a number, such as the heartbeat chart, gives
 * the thing that is pointed at as the figure, after the kind of thing that it
 * is, and says how long ago something happened to it.
 */
export interface Readout {
	/** The kind of thing that the figure names, such as "node", if it names one. */
	kind?: string;

	figure: string;

	/** The unit of the figure, if it is a number. */
	unit?: string;

	/** How long ago the figure was, if it isn't itself a time. */
	age?: string;
}

/**
 * ReadoutContext is how a chart gives its readout to the part of the page that
 * shows it, which is not the chart. The value is the function that sets it, or
 * nothing outside a part of the page that shows one.
 */
export const ReadoutContext = createContext<
	((readout: Readout | undefined) => void) | undefined
>(undefined);

/**
 * useSetReadout returns the function that sets the readout that the page shows,
 * or undefined if no part of the page shows one.
 */
export function useSetReadout() {
	return useContext(ReadoutContext);
}
