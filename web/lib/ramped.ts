import { useEffect, useRef, useState } from "react";

/** The shortest time that a number takes to ramp to a new value, in milliseconds. */
const minTime = 160;

/** The longest, however far it has to go. */
const maxTime = 500;

/** The time that a number takes for each whole step that it ramps through, up to the longest. */
const stepTime = 40;

/** How often the number that is shown is worked out, in milliseconds. */
const frame = 16;

/**
 * useRamped returns the number to show for a number that changes. The number
 * that it returns ramps to a new value: it passes through the values in between,
 * quickly, and does not skip from the old one to the new one. A change of one
 * takes a moment, and a change of many takes up to half a second, and ends
 * gently.
 *
 * Nothing passes through when the number is first shown, when it has no value to
 * come from, when `key` has changed, such as when a number is now in other units,
 * and for a viewer who asks for less motion. A number that is undefined is
 * returned as undefined, and the next number ramps from the last that was shown.
 * A whole number ramps through whole numbers.
 */
export function useRamped(
	target: number | undefined,
	key?: string,
): number | undefined {
	const [shown, setShown] = useState(target);

	// What is shown now, which a ramp that is under way has got to.
	const current = useRef(target);
	const lastKey = useRef(key);

	useEffect(() => {
		const changedKey = lastKey.current !== key;
		lastKey.current = key;

		if (target === undefined) {
			return;
		}

		const from = current.current;
		if (
			from === undefined ||
			from === target ||
			changedKey ||
			prefersReducedMotion()
		) {
			current.current = target;
			setShown(target);
			return;
		}

		const whole = Number.isInteger(from) && Number.isInteger(target);
		const time = Math.min(
			maxTime,
			Math.max(minTime, Math.abs(target - from) * stepTime),
		);
		const began = Date.now();

		const timer = window.setInterval(() => {
			const done = Math.min(1, (Date.now() - began) / time);
			const eased = 1 - (1 - done) ** 2;
			const value = from + (target - from) * eased;

			current.current = done === 1 ? target : whole ? Math.round(value) : value;
			setShown(current.current);

			if (done === 1) {
				window.clearInterval(timer);
			}
		}, frame);

		return () => window.clearInterval(timer);
	}, [target, key]);

	return target === undefined ? undefined : (shown ?? target);
}

/** Whether the viewer has asked for less motion. */
export function prefersReducedMotion(): boolean {
	return (
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
	);
}
