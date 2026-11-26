import { createContext, useContext } from "react";

/**
 * Readout is what a chart says about the place on it that is pointed at, or
 * anchored. Its figure is the measurement there, which is shown in the color of
 * the chart, and the rest is shown in the muted color: the unit of the figure,
 * and how long ago the measurement was, for a chart of a number; or the thing
 * that the measurement is of, and a label that says what is measured, for a
 * chart of things, such as "node 3f8e2a10" over "heartbeat 3 s ago".
 */
export interface Readout {
	/**
	 * The thing that the measurement is of, such as "node 3f8e2a10", for a chart
	 * of more than one thing. It is shown above the figure.
	 */
	subject?: string;

	/** What the figure measures, such as "heartbeat", shown before it. */
	label?: string;

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
