import { useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import type { Readout } from "../lib/readout.tsx";
import { subsystemColors } from "./subsystems.ts";

/**
 * useReadoutPlace returns what a card's place for readouts shows: `readout`, the
 * readout that is given now, if any; `shown`, the one to draw, which is the last
 * one given, kept for the moment that it takes to go; and `setReadout`, which a
 * card gives its charts and bars through `ReadoutContext`.
 */
export function useReadoutPlace() {
	const [readout, setReadout] = useState<Readout>();
	const last = useRef(readout);
	if (readout) {
		last.current = readout;
	}

	return { readout, shown: readout ?? last.current, setReadout };
}

/**
 * ReadoutLines draws a readout, right-aligned, as at most two lines: the subject
 * or nothing, then the figure, with its label before it and its unit and share
 * after it, then the age or nothing. The figure and the share are in the color of
 * the readout's subsystem, if it has one, or else of the card's, and the rest is
 * muted.
 *
 * It is what a pointer shows, and the same figures are given as text elsewhere,
 * so it is hidden from assistive technology by whatever holds it.
 */
export function ReadoutLines({ readout }: { readout: Readout }) {
	return (
		<>
			{readout.subject !== undefined && (
				<span className="text-muted">{readout.subject}</span>
			)}
			<span
				className={cn(
					"font-semibold text-(--subsystem)",
					readout.subsystem && subsystemColors[readout.subsystem],
				)}
			>
				{readout.label !== undefined && (
					<span className="font-normal text-muted">{readout.label} </span>
				)}
				{readout.figure}
				{readout.unit !== undefined && (
					<span className="font-normal text-muted"> {readout.unit}</span>
				)}
				{readout.share !== undefined && (
					<>
						<span className="font-normal text-muted">, </span>
						{readout.share}
					</>
				)}
			</span>
			{readout.age !== undefined && (
				<span className="text-muted">{readout.age}</span>
			)}
		</>
	);
}
