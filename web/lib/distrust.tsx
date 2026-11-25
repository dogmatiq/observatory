import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Glitch } from "../components/Glitch.tsx";
import { cn } from "./cn.ts";
import { prefersReducedMotion } from "./ramped.ts";

const Distrust = createContext(false);

/**
 * Distrusted says whether the numbers inside it are not current, such as those of
 * a cluster with no signal, which can only be what they were when a node
 * last reported. Every number that [Ramped], [Figure] and a handler's card
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

const Coverage = createContext(1);

/**
 * Covered says what share of the cluster's nodes, from 0 to 1, the numbers inside
 * it include, which is less than all of them while only some nodes report what
 * they are made from. A number is trusted less the lower its coverage, and is
 * blurrier. See [Trusted].
 */
export function Covered({
	coverage,
	children,
}: {
	coverage: number;
	children: ReactNode;
}) {
	return <Coverage.Provider value={coverage}>{children}</Coverage.Provider>;
}

/** useCoverage returns the share of the cluster's nodes that the numbers here include. */
export function useCoverage(): number {
	return useContext(Coverage);
}

/**
 * How long a number glitches when it loses trust in a step, in milliseconds.
 */
export const dropTime = 500;

/**
 * useTrustDropped returns true for [dropTime] each time the trust in the numbers
 * here falls in a step: when their coverage falls, or when they stop being
 * current, as [Distrusted] says. A gain in trust doesn't count, and nor does a
 * viewer who has asked for less motion.
 */
export function useTrustDropped(): boolean {
	const down = useDistrusted();
	const coverage = useCoverage();
	const trust = down ? 0 : coverage;
	const before = useRef(trust);
	const [dropped, setDropped] = useState(false);

	useEffect(() => {
		const fell = trust < before.current;
		before.current = trust;
		if (!fell || prefersReducedMotion()) {
			return;
		}

		setDropped(true);
		const timer = window.setTimeout(() => setDropped(false), dropTime);
		return () => window.clearTimeout(timer);
	}, [trust]);

	return dropped;
}

/**
 * Trusted shows `text`, a number as it is written, as much as the numbers here
 * are trusted: sharp if they include every node, and blurrier the fewer nodes
 * they include. Each time the trust falls in a step, it glitches for a moment.
 * If the numbers here are not current, it is the zero that is not available,
 * which `className` can add to, such as to fade it.
 */
export function Trusted({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const down = useDistrusted();
	const coverage = useCoverage();
	const distrust = down ? 1 : 1 - coverage;
	const dropped = useTrustDropped();
	const shown = dropped ? (
		<Glitch text={text} distrust={Math.max(distrust, 0.5)} burst={dropTime} />
	) : (
		text
	);

	if (down) {
		return (
			<span
				role="img"
				aria-label="not available"
				className={cn(unavailableClasses, className)}
			>
				{shown}
			</span>
		);
	}

	if (distrust === 0 && !dropped) {
		return <>{text}</>;
	}

	return (
		<span
			className="inline-block distrust-blur transition-[--distrust] duration-500 motion-reduce:transition-none"
			style={{ ["--distrust" as string]: distrust }}
		>
			{shown}
		</span>
	);
}
