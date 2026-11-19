import { createContext, useContext } from "react";

/**
 * Readout is what a chart says about the place on it that is pointed at, or
 * anchored: the value there, in the unit that the chart is in, and how long ago.
 */
export interface Readout {
	figure: string;
	unit: string;
	age: string;
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
