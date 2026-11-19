/** The length of a lunar month, from one new moon to the next, in days. */
const lunarMonth = 29.530588853;

/** A new moon, in milliseconds since 1970: 6 January 2000, 18:14 UTC. */
const newMoon = Date.UTC(2000, 0, 6, 18, 14);

/**
 * moonPhase returns how far the moon is through its month at the given time, from
 * 0 at the new moon, through 0.5 at the full moon, to just under 1.
 */
export function moonPhase(at: Date): number {
	const days = (at.getTime() - newMoon) / 86_400_000;
	return (((days / lunarMonth) % 1) + 1) % 1;
}

/**
 * moonName returns what the phase is called, for a phase that [moonPhase]
 * returns: the new moon, the quarters and the full moon are each a few days, and
 * the crescents and gibbous moons are the rest.
 */
export function moonName(phase: number): string {
	const eighths: [number, string][] = [
		[0.03, "new moon"],
		[0.22, "waxing crescent"],
		[0.28, "first quarter"],
		[0.47, "waxing gibbous"],
		[0.53, "full moon"],
		[0.72, "waning gibbous"],
		[0.78, "last quarter"],
		[0.97, "waning crescent"],
	];

	return eighths.find(([until]) => phase < until)?.[1] ?? "new moon";
}
