import type { CSSProperties } from "react";

/**
 * Glitch draws a figure as a signal that is breaking up: its top half and its
 * bottom half slip sideways on their own, as they do in a glitch effect, each
 * with a red and a cyan shadow that drift apart. How far they slip and drift
 * grows with `distrust`, from 0 to 1.
 *
 * It slips again and again, unless `burst` says how long, in milliseconds, one
 * burst of slipping lasts, and then it slips once and stops.
 *
 * The halves are copies of the text and are hidden from assistive technology, and
 * the text itself takes up the room and is read.
 */
export function Glitch({
	text,
	distrust,
	burst,
}: {
	text: string;
	distrust: number;
	burst?: number;
}) {
	return (
		<span
			className={burst === undefined ? "glitch" : "glitch glitch-burst"}
			style={
				{
					["--distrust" as string]: distrust,
					...(burst !== undefined && {
						["--glitch-burst" as string]: `${burst}ms`,
					}),
				} as CSSProperties
			}
		>
			<span className="glitch-room">{text}</span>
			<span aria-hidden="true" className="glitch-half glitch-top">
				{text}
			</span>
			<span aria-hidden="true" className="glitch-half glitch-bottom">
				{text}
			</span>
		</span>
	);
}
