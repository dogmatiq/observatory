/**
 * cn joins class names, leaving out the ones that are not given.
 */
export function cn(...names: (string | false | null | undefined)[]): string {
	return names.filter(Boolean).join(" ");
}
