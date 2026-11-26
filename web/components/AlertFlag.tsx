import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { useExampleData } from "../lib/distrust.tsx";
import { prefersReducedMotion } from "../lib/ramped.ts";
import { Icon } from "./Icon.tsx";
import { Popover } from "./Popover.tsx";
import { Presence } from "./Presence.tsx";
import type { Status } from "./statuses.ts";

/** How long the flag glitches for when it appears, in milliseconds. */
const appearGlitchTime = 500;

/**
 * AlertFlag is the flag that a card shows while one or more of its statuses
 * apply: the alert icon, whose tooltip says each status. It is grey while every
 * status only qualifies the card's figures, and red while any says that
 * something is wrong. With no status, there is no flag, so that it never shows
 * the opposite case.
 *
 * When a status begins to apply, the flag fades in with a short glitch, so that
 * the eye goes to it, and when the last one stops, it fades out. It doesn't
 * move when the page first draws, nor for a viewer who asks for less motion.
 *
 * A screen reader reads the statuses where the flag is, because the tooltip only
 * appears to a pointer or a finger. In an explainer's copy of a card, the flag
 * shows only the statuses that say that something is wrong.
 */
export function AlertFlag({
	statuses: given,
}: {
	statuses: readonly Status[];
}) {
	// An explainer's copy of a card shows only what says something is wrong. See
	// [ExampleData].
	const example = useExampleData();
	const statuses = example ? given.filter((s) => s.tone === "bad") : given;
	const shown = statuses.length > 0;
	const glitching = useGlitchOnAppearing(shown);
	const bad = statuses.some((s) => s.tone === "bad");

	return (
		<Presence shape="fade" className="flex-none">
			{shown && (
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
						{glitching ? (
							<GlitchingIcon />
						) : (
							<Icon name="alert" className="size-4" />
						)}
						<span className="sr-only">
							{statuses.map((s) => s.text).join(" ")}
						</span>
					</span>
				</Popover>
			)}
		</Presence>
	);
}

/**
 * useGlitchOnAppearing returns true for a moment after `shown` becomes true, but
 * not when it is true from the start, nor for a viewer who asks for less
 * motion.
 */
function useGlitchOnAppearing(shown: boolean): boolean {
	const [glitching, setGlitching] = useState(false);
	const was = useRef(shown);

	useEffect(() => {
		if (was.current === shown) {
			return;
		}
		was.current = shown;
		if (!shown || prefersReducedMotion()) {
			setGlitching(false);
			return;
		}

		setGlitching(true);
		const timer = window.setTimeout(
			() => setGlitching(false),
			appearGlitchTime,
		);
		return () => window.clearTimeout(timer);
	}, [shown]);

	return glitching;
}

/**
 * GlitchingIcon is the alert icon breaking up once, as a figure does when it
 * loses trust: its top half and its bottom half slip sideways on their own, with
 * a red and a cyan shadow. See the glitch rules in index.css.
 */
function GlitchingIcon() {
	return (
		<span
			className="glitch glitch-burst glitch-icon"
			style={
				{
					["--distrust" as string]: 1,
					["--glitch-burst" as string]: `${appearGlitchTime}ms`,
				} as CSSProperties
			}
		>
			<Icon name="alert" className="glitch-room size-4" />
			<span aria-hidden="true" className="glitch-half glitch-top">
				<Icon name="alert" className="size-4" />
			</span>
			<span aria-hidden="true" className="glitch-half glitch-bottom">
				<Icon name="alert" className="size-4" />
			</span>
		</span>
	);
}
