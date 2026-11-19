import { createContext, type ReactNode, useContext } from "react";

const Distrust = createContext(false);

/**
 * Distrusted says whether the numbers inside it are not current, such as those of
 * a cluster that has no node reporting, which can only be what they were when a
 * node last reported. Every number that [Ramped], [Figure] and a handler's card
 * show is then a zero that is not available, as a figure that has been lost for a
 * while is, so that what is shown depends on the state of the cluster, and not on
 * how the page got there.
 */
export function Distrusted({
	value,
	children,
}: {
	value: boolean;
	children: ReactNode;
}) {
	return <Distrust.Provider value={value}>{children}</Distrust.Provider>;
}

/** useDistrusted returns whether the numbers here are not current. */
export function useDistrusted(): boolean {
	return useContext(Distrust);
}

/**
 * useCurrent returns the number that is current here: `value`, or zero if the
 * numbers here are not current.
 */
export function useCurrent(value: number): number {
	return useDistrusted() ? 0 : value;
}

/**
 * The classes of a number that is not available, which is a zero, blurred by as
 * much as a figure that has been lost for a minute is. See the styles of
 * `distrust` in the stylesheet.
 */
export const unavailableClasses = "inline-block distrust-blur [--distrust:1]";
