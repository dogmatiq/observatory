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
