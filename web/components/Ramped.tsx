import { cn } from "../lib/cn.ts";
import { Trusted, useCurrent } from "../lib/distrust.tsx";
import { useRamped } from "../lib/ramped.ts";

/**
 * Ramped shows a number as `format` writes it, and when the number changes, it
 * ramps to the new one. See [useRamped]. It is as sharp as the numbers around it
 * are trusted, and if they are not current, it is a zero that is not available.
 * See [Trusted].
 */
export function Ramped({
	value,
	format,
}: {
	value: number;
	format: (n: number) => string;
}) {
	const current = useCurrent(value);
	const ramped = useRamped(current) ?? current;

	return (
		<Trusted
			text={format(ramped)}
			className={cn(
				"transition-colors duration-500",
				ramped === 0 && "text-muted",
			)}
		/>
	);
}
