/**
 * The hues of the palette of color marks, in degrees, spaced evenly around the
 * color wheel.
 */
const hues = 24;

/**
 * markOf returns where an identifier's color mark is in the palette: a hue, and
 * which of the two lightnesses it has. The palette has 48 colors, and the same
 * identifier always has the same one.
 */
export function markOf(id: string): { hue: number; light: boolean } {
	// FNV-1a, which spreads similar strings over the whole range.
	let hash = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		hash ^= id.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	hash >>>= 0;

	return {
		hue: (hash % hues) * (360 / hues),
		light: ((hash >>> 8) & 1) === 1,
	};
}
