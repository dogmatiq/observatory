import { cn } from "../lib/cn.ts";
import {
	unavailableClasses,
	useCurrent,
	useDistrusted,
} from "../lib/distrust.tsx";
import { useRamped } from "../lib/ramped.ts";

/**
 * Ramped shows a number as `format` writes it, and when the number changes, it
 * ramps to the new one. See [useRamped]. If the numbers around it are not current,
 * it is a zero that is not available. See [Distrusted].
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
	const text = format(ramped);

	return useDistrusted() ? (
		<span
			role="img"
			aria-label="not available"
			className={cn(
				unavailableClasses,
				"transition-colors duration-500",
				ramped === 0 && "text-muted",
			)}
		>
			{text}
		</span>
	) : (
		text
	);
}
