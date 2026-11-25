import { cn } from "../lib/cn.ts";
import { Icon } from "./Icon.tsx";
import { Popover } from "./Popover.tsx";
import type { Status } from "./statuses.ts";

/**
 * AlertFlag is the flag that a card shows while one or more of its statuses
 * apply: the alert icon, whose tooltip says each status. It is grey while every
 * status only qualifies the card's figures, and red while any says that
 * something is wrong. With no status, there is no flag, so that it never shows
 * the opposite case.
 *
 * A screen reader reads the statuses where the flag is, because the tooltip only
 * appears to a pointer or a finger.
 */
export function AlertFlag({ statuses }: { statuses: readonly Status[] }) {
	if (statuses.length === 0) {
		return null;
	}

	const bad = statuses.some((s) => s.tone === "bad");

	return (
		<Popover
			content={
				<span className="flex flex-col gap-1.5">
					{statuses.map((s) => (
						<span key={s.text}>{s.text}</span>
					))}
				</span>
			}
		>
			<span
				className={cn(
					"flex size-4 flex-none",
					bad ? "text-bad" : "text-fg-soft",
				)}
			>
				<Icon name="alert" className="size-4" />
				<span className="sr-only">{statuses.map((s) => s.text).join(" ")}</span>
			</span>
		</Popover>
	);
}
