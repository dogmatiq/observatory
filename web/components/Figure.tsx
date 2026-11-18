import { useEffect, useRef, useState } from "react";

/**
 * How long a figure that has been lost is kept, in milliseconds, before it is
 * replaced by a dash.
 */
export const keepTime = 60_000;

/**
 * The dash that stands for a figure that has never been known.
 */
const dash = "—";

/**
 * Figure shows a number that the Observatory may not have, as the text that it
 * is shown as.
 *
 * While there is no text, it shows a dash, if there has never been any. If there
 * was some and it is lost, such as a rate that can't be given for a few seconds
 * when a node joins, it keeps showing the last text, which fades to the muted
 * color, the one of a number that is zero, and is replaced by a dash if it is not
 * found again within a minute. As soon as there is text it is shown in the usual
 * color.
 *
 * Nothing here is about a figure that no node supports. That is not shown at all.
 */
export function Figure({ text }: { text: string | undefined }) {
	const last = useRef<string | undefined>(text);
	const [kept, setKept] = useState(true);

	if (text !== undefined) {
		last.current = text;
	}

	useEffect(() => {
		if (text !== undefined) {
			setKept(true);
			return;
		}

		const timer = window.setTimeout(() => setKept(false), keepTime);
		return () => window.clearTimeout(timer);
	}, [text]);

	if (text !== undefined) {
		return <>{text}</>;
	}

	if (last.current === undefined || !kept) {
		return <span className="text-faint">{dash}</span>;
	}

	return (
		// The fade takes ten seconds, which the keyframes of "stale" say.
		<span className="motion-safe:animate-[stale_10s_linear_forwards] motion-reduce:text-faint">
			{last.current}
		</span>
	);
}
