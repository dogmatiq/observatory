import { createContext, useContext, useEffect } from "react";
import type { Subsystem } from "../components/subsystems.ts";

/**
 * Readout is what a card says about the place on its chart or its bar that is
 * pointed at, beside the card's icon. Its figure is the measurement there, which
 * is shown in the card's color, and the rest is shown in the muted color: the
 * unit of the figure, and how long ago the measurement was, for a chart of a
 * number; or the thing that the measurement is of, and a label that says what is
 * measured, for a chart of things, such as "node 3f8e2a10" over "heartbeat 3 s
 * ago"; or the thing that a segment of a bar is of, over its amount and its share
 * of the bar, such as "queue 113cbdc3" over "12 messages, 63%".
 *
 * A readout is two lines at most: the line of the figure, and either the subject
 * above it or the age below it, never both, so that it never makes the card's
 * top row taller.
 */
export type Readout = (
	| {
			/**
			 * The thing that the measurement is of, such as "node 3f8e2a10", for a
			 * chart or a bar of more than one thing. It is shown above the figure.
			 */
			subject: string;
			age?: never;
	  }
	| {
			subject?: never;

			/** How long ago the figure was, if it isn't itself a time. */
			age?: string;
	  }
) & {
	/** What the figure measures, such as "heartbeat", shown before it. */
	label?: string;

	figure: string;

	/** The unit of the figure, if it is a number. */
	unit?: string;

	/**
	 * The share of the whole that the figure is, such as "63%", which is a
	 * measurement too, so it is shown after the unit in the card's color.
	 */
	share?: string;

	/**
	 * The subsystem whose color the figure and the share have, if it isn't the
	 * card's: that of the bar or the chart that is pointed at, on a card whose bars
	 * and charts have colors of their own, such as a handler's digest.
	 */
	subsystem?: Subsystem;
};

/**
 * readoutKey returns a string that is the same for two readouts that say the
 * same, so that a part of the page that gives a readout gives it again only when
 * it changes.
 */
export function readoutKey(readout: Readout | undefined): string | undefined {
	return (
		readout &&
		[
			readout.subject,
			readout.label,
			readout.figure,
			readout.unit,
			readout.share,
			readout.age,
			readout.subsystem,
		].join("|")
	);
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

/**
 * useGiveReadout gives the part of the page that shows readouts `readout`, while
 * something is pointed at, or nothing, each time that what it says changes, and
 * takes it away when the part that gives it goes.
 */
export function useGiveReadout(readout: Readout | undefined) {
	const setReadout = useSetReadout();
	const key = readoutKey(readout);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is the readout.
	useEffect(() => {
		setReadout?.(readout);
	}, [key, setReadout]);
	useEffect(() => () => setReadout?.(undefined), [setReadout]);
}
