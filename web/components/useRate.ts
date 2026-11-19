import { useRef } from "react";
import { type RatePer, scaleRate } from "../lib/format.ts";
import { useKept } from "./Figure.tsx";

/**
 * useRate returns what a tile needs to show a rate of things that can't be
 * divided, which it is given per minute and which the Observatory may not have:
 *
 * - `scaled` is the rate as a whole number per minute, or per hour or per day if
 *   it is less than one per minute, and is undefined if there is no rate;
 * - `per` is the unit of time, which is the unit that the rate was last in, so
 *   that a rate that is lost for long enough to be a zero is a zero in that unit;
 * - `state` is whether the rate is known, or lost, which is when it is kept for a
 *   minute at most, or unavailable.
 */
export function useRate(perMinute: number | undefined): {
	scaled: { amount: number; per: RatePer } | undefined;
	per: RatePer;
	state: "known" | "lost" | "unavailable";
} {
	const kept = useKept(perMinute);
	const scaled = perMinute === undefined ? undefined : scaleRate(perMinute);

	const lastPer = useRef<RatePer>("minute");
	if (kept.value !== undefined) {
		lastPer.current = scaleRate(kept.value).per;
	}

	return {
		scaled,
		per: lastPer.current,
		state:
			kept.value === undefined ? "unavailable" : kept.lost ? "lost" : "known",
	};
}
