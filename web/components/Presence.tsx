import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";

/**
 * How long a part takes to grow in and to shrink away, in milliseconds.
 */
export const presenceTime = 400;

/**
 * Presence draws a part of the page that is there only while the nodes support
 * what it is made from, which can begin and end while the page is open.
 *
 * While `children` is nothing it draws nothing. When children appear they grow
 * in, and when they go the part that was there is kept for a moment and shrinks
 * away, so that the page doesn't jump. It doesn't animate what is there when it
 * first draws, nor for a viewer who asks for less motion.
 *
 * `shape` is how the part makes room: "block" grows and shrinks in height, and
 * "fade" only fades, for a part that is placed by something else.
 */
export function Presence({
	children,
	shape = "block",
	className,
}: {
	children?: ReactNode;
	shape?: "block" | "fade";

	/** Classes for the box that holds the part, which is a grid. */
	className?: string;
}) {
	const present =
		children !== undefined && children !== null && children !== false;

	// What was there last, which is what shrinks away.
	const kept = useRef<ReactNode>(children);
	if (present) {
		kept.current = children;
	}

	const [mounted, setMounted] = useState(present);
	const [open, setOpen] = useState(present);

	useEffect(() => {
		if (present) {
			setMounted(true);
			setOpen(true);
			return;
		}

		setOpen(false);
		const timer = window.setTimeout(() => setMounted(false), presenceTime);
		return () => window.clearTimeout(timer);
	}, [present]);

	if (!present && !mounted) {
		return null;
	}

	const motion = "ease-out motion-reduce:transition-none duration-400";

	if (shape === "fade") {
		return (
			<div
				className={cn(
					"grid transition-opacity",
					motion,
					open ? "opacity-100" : "opacity-0",
					className,
				)}
			>
				{kept.current}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"grid transition-[grid-template-rows,opacity]",
				motion,
				open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
				className,
			)}
		>
			<div className="min-h-0 overflow-hidden">{kept.current}</div>
		</div>
	);
}
