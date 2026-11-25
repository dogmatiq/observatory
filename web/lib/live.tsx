import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

/**
 * Clock tells the time on a scale of milliseconds that only goes forward.
 */
export interface Clock {
	now(): number;
}

/**
 * The browser's own clock, which is not changed by a change of the system time.
 */
export const browserClock: Clock = { now: () => performance.now() };

/**
 * The time since the data that the page shows arrived, in milliseconds.
 *
 * Without a {@link LiveData} around it, a page shows its data as it was at the
 * moment that it arrived, and nothing moves.
 */
const ElapsedContext = createContext({ elapsed: 0, reduced: false });

/**
 * usePrefersReducedMotion returns true if the viewer has asked for less
 * movement on the page.
 */
export function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const changed = () => setReduced(query.matches);
		query.addEventListener("change", changed);
		return () => query.removeEventListener("change", changed);
	}, []);

	return reduced;
}

/**
 * LiveData makes the time since the data of a page arrived available to the
 * parts of the page that move between updates, and keeps it up to date.
 *
 * The time moves on with every frame that the browser draws. If the viewer
 * prefers reduced motion it moves on once a second, which is enough for the
 * parts that are still drawn between updates.
 *
 * Change `receivedAt`, which is the time that the data arrived on the clock's
 * scale, each time that new data arrives.
 */
export function LiveData({
	receivedAt,
	clock = browserClock,
	children,
}: {
	receivedAt: number;
	clock?: Clock;
	children: ReactNode;
}) {
	const reduced = usePrefersReducedMotion();
	// The time is read while rendering, and not kept in state, so that the render
	// that shows new data also has the time since that data arrived. Data that
	// is shown with the time of the data before it makes the parts that move
	// jump for a frame.
	const [, setFrames] = useState(0);
	const elapsed = Math.max(0, clock.now() - receivedAt);

	useEffect(() => {
		const update = () => setFrames((n) => n + 1);

		if (reduced) {
			const timer = window.setInterval(update, 1000);
			return () => window.clearInterval(timer);
		}

		let frame = window.requestAnimationFrame(function tick() {
			update();
			frame = window.requestAnimationFrame(tick);
		});
		return () => window.cancelAnimationFrame(frame);
	}, [reduced]);

	return (
		<ElapsedContext.Provider value={{ elapsed, reduced }}>
			{children}
		</ElapsedContext.Provider>
	);
}

/**
 * Still shows its children as they were at the moment that their data arrived,
 * even inside {@link LiveData}, so that nothing in them moves with time, such as
 * the copy of a card in an explainer, whose made-up figures are fixed.
 */
export function Still({ children }: { children: ReactNode }) {
	const { reduced } = useContext(ElapsedContext);
	return (
		<ElapsedContext.Provider value={{ elapsed: 0, reduced }}>
			{children}
		</ElapsedContext.Provider>
	);
}

/**
 * useElapsed returns the time since the page's data arrived, in milliseconds,
 * which changes as time passes. It is 0 outside {@link LiveData}.
 */
export function useElapsed(): number {
	return useContext(ElapsedContext).elapsed;
}

/**
 * useScrolled returns how far a chart has scrolled since the page's data
 * arrived, as a time in milliseconds. It is the same as {@link useElapsed},
 * except that it is always 0 if the viewer prefers reduced motion, because
 * then the charts do not scroll.
 */
export function useScrolled(): number {
	const { elapsed, reduced } = useContext(ElapsedContext);
	return reduced ? 0 : elapsed;
}
