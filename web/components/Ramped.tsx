import { useRamped } from "../lib/ramped.ts";

/**
 * Ramped shows a number as `format` writes it, and when the number changes, it
 * ramps to the new one. See [useRamped].
 */
export function Ramped({
	value,
	format,
}: {
	value: number;
	format: (n: number) => string;
}) {
	return <>{format(useRamped(value) ?? value)}</>;
}
