import { useId, useState } from "react";
import { cn } from "../lib/cn.ts";
import { InfoCard } from "./InfoCard.tsx";

/**
 * MessagesWaitingCard is the content of the popover of the headline of the queues
 * tile, which is the number of messages that wait, and the count of those that
 * fail after it. It explains how the two go together with an example, which
 * has numbers of its own and is in shades of gray, in a dashed box, so that it
 * is not mistaken for the figure that is pointed at. Arrows point from a label to
 * each of its two numbers. The words say only that the failing messages are shown
 * separately, and the example shows how, which is by a plus sign and by smaller
 * type, and not by color alone, which a reader may not see.
 *
 * Pointing at a number, or at its label or its arrow, shows all three in the
 * color that the number has on the tile, which is a hint and not what the card
 * says.
 */
export function MessagesWaitingCard() {
	const [pointed, setPointed] = useState<"waiting" | "failing">();

	// What points at a number, or is one, makes the three show the number's own
	// color.
	const hint = (which: "waiting" | "failing") => ({
		onPointerEnter: () => setPointed(which),
		onPointerLeave: () => setPointed(undefined),
	});
	const ink = (which: "waiting" | "failing") =>
		pointed !== which
			? "text-fg-soft"
			: which === "waiting"
				? "text-fg"
				: "text-failing";

	return (
		<InfoCard subsystem="queues" icon="message" kind="Messages waiting">
			<p>
				The number of messages that are waiting to be delivered. If there are
				any failing messages, they are shown separately.
			</p>
			<div aria-hidden="true" className="flex items-start justify-center py-1">
				<span
					className={cn(
						"mt-[1.5px] -rotate-6 text-lg leading-5 whitespace-nowrap transition-colors duration-150 [font-family:var(--font-hand)] tracking-[-0.04em]",
						ink("waiting"),
					)}
					{...hint("waiting")}
				>
					waiting
				</span>
				<Scribble
					className={cn("mt-1.5 -mr-2 ml-1", ink("waiting"))}
					{...hint("waiting")}
				/>
				{/* The example is laid out as the headline is. It is 30px, and the headline
				    is 36px, so the space before the count is 5px, and not 6px. */}
				<div className="rounded-control border border-dashed border-line-strong px-2.5 py-2.5 text-3xl leading-none font-bold tabular-nums">
					<span
						className={cn(
							"transition-colors duration-150",
							pointed === "waiting" ? "text-fg" : "text-muted",
						)}
						{...hint("waiting")}
					>
						24
					</span>
					<span
						className={cn(
							"pl-[5px] align-[0.43em] text-[0.62em] font-semibold transition-colors duration-150",
							pointed === "failing" ? "text-failing" : "text-muted",
						)}
						{...hint("failing")}
					>
						+1
					</span>
				</div>
				{/* The count is raised, so what points at it is too, by the same amount. */}
				<Scribble
					flip
					className={cn("-ml-2 mr-1", ink("failing"))}
					{...hint("failing")}
				/>
				<span
					className={cn(
						"-mt-[4.5px] rotate-6 text-lg leading-5 whitespace-nowrap transition-colors duration-150 [font-family:var(--font-hand)] tracking-[-0.04em]",
						ink("failing"),
					)}
					{...hint("failing")}
				>
					failing
				</span>
			</div>
			<p>
				Lower is better. If the number keeps rising, messages are arriving
				faster than they are being handled.
			</p>
		</InfoCard>
	);
}

/**
 * Scribble is an arrow that arcs out of the side of a label at its left and
 * down to the example at its right, drawn as if by hand over the example: its
 * line wavers, and its head is two strokes that don't quite meet. `flip` mirrors
 * it, so that it arcs out of a label at its right and down to the left.
 */
function Scribble({
	flip = false,
	className,
	onPointerEnter,
	onPointerLeave,
}: {
	flip?: boolean;
	className?: string;
	onPointerEnter?: () => void;
	onPointerLeave?: () => void;
}) {
	const id = useId();

	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 30 16"
			className={cn(
				"relative h-4 w-7.5 flex-none transition-colors duration-150",
				flip && "-scale-x-100",
				className,
			)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ filter: `url(#${id})` }}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
		>
			<defs>
				<filter id={id} x="-20%" y="-20%" width="140%" height="140%">
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.06"
						numOctaves="2"
						seed="4"
						result="noise"
					/>
					<feDisplacementMap in="SourceGraphic" in2="noise" scale="2" />
				</filter>
			</defs>
			<path d="M1.5 4C8 1.5 15 3 20.5 7.5C22.5 9.3 24.2 11 26 13" />
			<path d="M20.3 11.3C22.5 11.4 24.5 12 26 13C25.2 11 24.7 9.4 24.3 7.3" />
		</svg>
	);
}
