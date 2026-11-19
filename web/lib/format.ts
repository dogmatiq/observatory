/**
 * Formats numbers and counted nouns as the cluster view shows them.
 */

const grouped = new Intl.NumberFormat("en-US");

/**
 * formatNumber returns n with a comma between each group of three digits.
 */
export function formatNumber(n: number): string {
	return grouped.format(n);
}

const compactUnits = [
	{ size: 1e3, suffix: "K" },
	{ size: 1e6, suffix: "M" },
	{ size: 1e9, suffix: "B" },
];

/**
 * formatCompact returns n as it is if it is below 1,000, and otherwise with one
 * decimal place in the largest unit that keeps it below 1,000, such as "1.0K"
 * or "12.3M".
 */
export function formatCompact(n: number): string {
	if (n < 1000) {
		return formatNumber(n);
	}

	for (const [i, unit] of compactUnits.entries()) {
		const v = n / unit.size;

		// A value that would round up to 1000.0 moves to the next unit, unless
		// there is none.
		if (v < 999.95 || i === compactUnits.length - 1) {
			return roundToTenth(v) + unit.suffix;
		}
	}

	return formatNumber(n);
}

/**
 * roundToTenth returns v with one decimal place, rounding a value that is
 * exactly halfway between two tenths to the even one. That is how the
 * prototype rounds, and "toFixed" rounds it up.
 */
function roundToTenth(v: number): string {
	const tenths = v * 10;

	// Only a multiple of a quarter can be exactly halfway, because the others
	// are not exact in binary.
	if (Number.isInteger(v * 4) && tenths % 1 === 0.5) {
		const down = Math.floor(tenths);
		return ((down % 2 === 0 ? down : down + 1) / 10).toFixed(1);
	}

	return v.toFixed(1);
}

/**
 * formatPercent returns a share, from 0 to 1, as a percentage that is a whole
 * number, or has one decimal place below 10%. A share that is above 0 is never
 * shown as 0%, and one that is below 1 is never shown as 100%, so that they say
 * that there is something else.
 */
export function formatPercent(share: number): string {
	const percent = share * 100;

	if (share >= 1) {
		return "100%";
	}
	if (share > 0 && percent < 1) {
		return "<1%";
	}
	if (percent >= 99.5) {
		return ">99%";
	}
	if (Math.round(percent * 10) / 10 < 10) {
		return `${(Math.round(percent * 10) / 10).toFixed(1)}%`;
	}
	return `${Math.round(percent)}%`;
}

/** The unit of time that a rate is given per. */
export type RatePer = "minute" | "hour" | "day";

/** How many of each unit of time there are in a minute, as a factor. */
const perMinuteIn: Record<RatePer, number> = {
	minute: 1,
	hour: 60,
	day: 1440,
};

/**
 * inUnit returns a rate of things that can't be divided, which is given per
 * minute, as a whole number per the unit of time `per`.
 */
export function inUnit(perMinute: number, per: RatePer): number {
	return Math.round(perMinute * perMinuteIn[per]);
}

/** The short form of a unit of time, as in "347/min". */
export const shortPer: Record<RatePer, string> = {
	minute: "/min",
	hour: "/hr",
	day: "/day",
};

/**
 * scaleRate returns a rate of things that can't be divided, such as events, as a
 * whole number per minute, or, if that would be less than one, per hour, or, if
 * that would be less than one too, per day. A rate is never a fraction of a thing:
 * the unit of time is scaled instead. A rate of none is "0 per minute".
 */
export function scaleRate(perMinute: number): { amount: number; per: RatePer } {
	for (const per of ["minute", "hour", "day"] as const) {
		const amount = inUnit(perMinute, per);
		if (amount >= 1) {
			return { amount, per };
		}
	}

	return { amount: 0, per: "minute" };
}

/**
 * nounFor returns the singular form of a noun if n is 1, and the plural form
 * otherwise.
 */
export function nounFor(n: number, singular: string, plural: string): string {
	return n === 1 ? singular : plural;
}

/**
 * countOf returns n followed by the singular or plural form of a noun, such as
 * "1 event" or "2 events".
 */
export function countOf(n: number, singular: string, plural: string): string {
	return n === 1 ? `1 ${singular}` : `${formatNumber(n)} ${plural}`;
}

/**
 * shortId returns the first eight characters of an ID, which is enough to tell
 * the IDs on one page apart.
 */
export function shortId(id: string): string {
	return id.slice(0, 8);
}
