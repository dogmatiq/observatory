import { useEffect, useRef, useState } from "react";
import {
	dropTime,
	Trusted,
	useCoverage,
	useDistrusted,
	useTrustDropped,
} from "../lib/distrust.tsx";
import { prefersReducedMotion, useRamped } from "../lib/ramped.ts";
import { Glitch } from "./Glitch.tsx";

/**
 * How long a figure that has been lost is kept, in milliseconds, before it is
 * replaced by a zero with no trust.
 */
export const keepTime = 60_000;

/**
 * How long a figure that is about to expire glitches, in milliseconds, which is
 * the last of the time that it is kept.
 */
export const glitchTime = 500;

/**
 * useKept returns a value that may be lost, which the Observatory may not have,
 * and whether it is lost.
 *
 * While there is no value, it returns undefined if there has never been any. If
 * there was some, it returns the last one, with `lost` true, for `keep`, which is
 * [keepTime] unless it says otherwise, and then returns undefined. As soon as
 * there is a value it returns it.
 */
export function useKept<T>(
	value: T | undefined,
	keep = keepTime,
): {
	value: T | undefined;
	lost: boolean;
} {
	const last = useRef<T | undefined>(value);
	const [expired, setExpired] = useState(false);

	if (value !== undefined) {
		last.current = value;
	}

	useEffect(() => {
		if (value !== undefined) {
			setExpired(false);
			return;
		}

		const timer = window.setTimeout(() => setExpired(true), keep);
		return () => window.clearTimeout(timer);
	}, [value, keep]);

	if (value !== undefined) {
		return { value, lost: false };
	}
	if (last.current === undefined || expired) {
		return { value: undefined, lost: false };
	}
	return { value: last.current, lost: true };
}

/**
 * How long a figure that has come back takes to get its trust back, in
 * milliseconds.
 */
const settleTime = 400;

/**
 * The look of a figure that is not fully trusted: it gets blurry, by how little
 * it is trusted. See the styles of `distrust` in the stylesheet.
 */
const untrusted = "distrust-blur";

/**
 * Figure shows a number that the Observatory may not have, as `format` writes
 * it. The figure ramps to a new number, as [useRamped] says, and doesn't when
 * `unit` has changed.
 *
 * While there is no number, it shows a zero in the color of muted text, with as
 * little trust as there is, if there has never been any. If there was one and it
 * is lost, such as a rate that has stopped being updated, it keeps showing the
 * last number, which starts as it was and loses trust steadily over `keep`, which
 * is [keepTime] unless it says otherwise, so it gets blurrier. In the last
 * [glitchTime] of that time it glitches, and when the time is up it ramps down to
 * the zero, which has the color of the text while the figure ramps down to it, and
 * then fades to the color of muted text. When there is a number again it gets its
 * trust back in a moment.
 *
 * The zero is described to assistive technology as "not available", because it
 * isn't a measure.
 *
 * In a cluster that is down, as [Distrusted] says, no figure has a number: each is
 * the zero with no trust, as it is when the page loads with the cluster down, and a
 * figure that was showing a number ramps down to it.
 *
 * Nothing here is about a figure that no node supports. That is not shown at all.
 */
export function Figure({
	number,
	format,
	unit,
	keep = keepTime,
}: {
	number: number | undefined;
	format: (n: number) => string;

	/** What the number is in, such as events per minute. */
	unit?: string;

	/** How long the figure is kept when it is lost, in milliseconds. */
	keep?: number;
}) {
	const kept = useKept(number, keep);

	// What a figure shows depends on the state of the cluster, and not on how the
	// page got there. A cluster that is down has no number that is current, so the
	// figures that are worked out from what its nodes report are not available,
	// whether they were showing a number when the cluster went down, or the page
	// has just loaded with it down.
	const down = useDistrusted();
	const value = down ? undefined : kept.value;
	const lost = down ? false : kept.lost;

	// A figure that covers only some of the nodes starts from as little trust as
	// its coverage gives it, and glitches for a moment each time it loses trust in
	// a step, such as when the signal from the cluster stops.
	const coverage = useCoverage();
	const dropped = useTrustDropped();

	// A figure with no number is a zero, which a lost figure ramps down to.
	const ramped = useRamped(value ?? 0, unit) ?? 0;
	const text = format(ramped);

	// A figure that is lost glitches in the last of the time that it is kept, unless
	// the viewer has asked for less motion.
	const [glitching, setGlitching] = useState(false);
	useEffect(() => {
		if (!lost || prefersReducedMotion()) {
			setGlitching(false);
			return;
		}

		const timer = window.setTimeout(
			() => setGlitching(true),
			Math.max(0, keep - glitchTime),
		);
		return () => window.clearTimeout(timer);
	}, [lost, keep]);

	// A figure that has just come back keeps its treatment for a moment, as it
	// gets its trust back.
	const [wasLost, setWasLost] = useState(lost);
	const [settling, setSettling] = useState(false);
	if (lost !== wasLost) {
		setWasLost(lost);
		if (wasLost && value !== undefined) {
			setSettling(true);
		}
	}

	useEffect(() => {
		if (!settling) {
			return;
		}

		const timer = window.setTimeout(() => setSettling(false), settleTime);
		return () => window.clearTimeout(timer);
	}, [settling]);

	if (value === undefined) {
		return (
			<span
				role="img"
				aria-label="not available"
				className={`inline-block transition-colors duration-500 [--distrust:1] ${untrusted} ${ramped === 0 ? "text-muted" : ""}`}
			>
				{dropped ? <Glitch text={text} distrust={1} burst={dropTime} /> : text}
			</span>
		);
	}

	if (lost && glitching) {
		return (
			<span
				className={`inline-block ${untrusted}`}
				style={{ ["--distrust" as string]: 1 }}
			>
				<Glitch text={text} distrust={1} burst={glitchTime} />
			</span>
		);
	}

	if (lost) {
		return (
			<span
				className={`inline-block motion-safe:animate-[distrust_linear_forwards] ${untrusted}`}
				style={{
					animationDuration: `${keep}ms`,
					["--distrust-from" as string]: 1 - coverage,
				}}
			>
				{text}
			</span>
		);
	}

	if (settling) {
		return (
			<span
				className={`inline-block ${untrusted}`}
				style={{
					["--distrust" as string]: 1 - coverage,
					transition: `--distrust ${settleTime}ms ease-out`,
				}}
			>
				{text}
			</span>
		);
	}

	return <Trusted text={text} />;
}
