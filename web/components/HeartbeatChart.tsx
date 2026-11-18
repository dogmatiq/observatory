import { useCallback, useEffect, useRef } from "react";
import { heartbeatLine } from "../lib/heartbeat.ts";

/**
 * How long a node's share of the chart takes to grow from nothing when it joins,
 * and to shrink away when it leaves, in milliseconds. It is the time that the
 * segments of the bar above it take.
 */
const shareTime = 500;

/**
 * Section is a node's share of the chart.
 */
interface Section {
	id: string;

	/** The level of the node's heartbeat, from 0 when it is empty to 1 when full. */
	level: number;
}

/**
 * Share is what the chart draws for one node, which includes a node that has
 * left and whose share is shrinking away.
 */
interface Share {
	id: string;
	level: number;

	/** How much of its full share the node has, from 0 to 1. */
	size: number;

	/** The size that it is moving towards: 1 for a node that is live, else 0. */
	target: number;
}

/**
 * HeartbeatChart draws one line across the card, like the charts on the other
 * cards, whose height follows each live node's heartbeats.
 *
 * Each node has an equal share of the width, in the order of `sections`, which
 * must be sorted by ID, like the segments of the bar of workloads above it. A
 * section has the level of its node's heartbeat, from 0 when it is empty to 1
 * when the node has just sent one. A node's share grows from nothing when it
 * joins and shrinks away when it leaves, so that the line doesn't jump. The chart
 * is drawn again when its levels change, when its size changes, and when the
 * page's colors do.
 *
 * It is positioned along the bottom edge of the nearest ancestor that is
 * positioned, and takes its colors from the `--subsystem` and `--subsystem-soft`
 * custom properties that it inherits. It is decoration, so it is hidden from
 * assistive technology.
 */
export function HeartbeatChart({ sections }: { sections: readonly Section[] }) {
	const canvas = useRef<HTMLCanvasElement>(null);

	// The levels change with every frame, so the observers below read the latest
	// shares, and are not made again each time.
	const shares = useRef<Share[]>([]);
	const frame = useRef<number>(0);

	const draw = useCallback(() => {
		const element = canvas.current;
		if (element !== null) {
			drawHeartbeats(element, shares.current);
		}
	}, []);

	useEffect(() => {
		const known = new Map(shares.current.map((s) => [s.id, s]));
		const live = new Set(sections.map((s) => s.id));

		const next: Share[] = sections.map((s) => ({
			id: s.id,
			level: s.level,
			// A node that is new has no share yet, and the first sections that the
			// chart is given have all of theirs.
			size: known.get(s.id)?.size ?? (shares.current.length === 0 ? 1 : 0),
			target: 1,
		}));

		// A node that has gone keeps the level that it had as its share shrinks.
		for (const old of shares.current) {
			if (!live.has(old.id)) {
				next.push({ ...old, target: 0 });
			}
		}

		next.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		shares.current = next;

		draw();

		if (next.some((s) => s.size !== s.target) && frame.current === 0) {
			let before = performance.now();

			const step = (now: number) => {
				const moved = (now - before) / shareTime;
				before = now;

				shares.current = shares.current
					.map((s) => ({
						...s,
						size:
							s.target > s.size
								? Math.min(s.target, s.size + moved)
								: Math.max(s.target, s.size - moved),
					}))
					.filter((s) => s.target > 0 || s.size > 0);

				draw();

				frame.current = shares.current.some((s) => s.size !== s.target)
					? requestAnimationFrame(step)
					: 0;
			};

			frame.current = requestAnimationFrame(step);
		}
	}, [sections, draw]);

	useEffect(
		() => () => {
			cancelAnimationFrame(frame.current);
			frame.current = 0;
		},
		[],
	);

	useEffect(() => {
		const element = canvas.current;
		if (element === null) {
			return;
		}

		draw();

		const resized = new ResizeObserver(draw);
		resized.observe(element);

		// The colors change with the viewer's choice of color mode, which is an
		// attribute of the root element, and with the browser's preference.
		const recolored = new MutationObserver(draw);
		recolored.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});

		const preference = window.matchMedia("(prefers-color-scheme: dark)");
		preference.addEventListener("change", draw);

		return () => {
			resized.disconnect();
			recolored.disconnect();
			preference.removeEventListener("change", draw);
		};
	}, [draw]);

	return (
		<>
			{/* A canvas is not focusable, which is what the rule assumes of it. */}
			{/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: see above */}
			<canvas
				ref={canvas}
				className="absolute inset-x-0 bottom-0 h-12 w-full text-(--subsystem)"
				aria-hidden="true"
			/>
		</>
	);
}

function drawHeartbeats(canvas: HTMLCanvasElement, shares: readonly Share[]) {
	const ratio = window.devicePixelRatio || 1;
	const width = Math.round(canvas.clientWidth * ratio);
	const height = Math.round(canvas.clientHeight * ratio);

	// Setting the size also clears the canvas.
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}

	const g = canvas.getContext("2d");
	if (g === null) {
		return;
	}

	g.clearRect(0, 0, width, height);

	// A share eases in and out, so that it takes the line smoothly.
	const points = heartbeatLine(
		shares.map((s) => s.level),
		width,
		height,
		ratio,
		shares.map((s) => s.size * s.size * (3 - 2 * s.size)),
	);
	if (points.length === 0) {
		return;
	}

	const style = window.getComputedStyle(canvas);

	g.beginPath();
	g.moveTo(0, height);
	for (const [x, y] of points) {
		g.lineTo(x, y);
	}
	g.lineTo(width, height);
	g.closePath();
	g.fillStyle = style.getPropertyValue("--subsystem-soft").trim();
	g.fill();

	g.beginPath();
	for (const [i, [x, y]] of points.entries()) {
		if (i === 0) {
			g.moveTo(x, y);
		} else {
			g.lineTo(x, y);
		}
	}
	g.strokeStyle = style.color;
	g.lineWidth = 1.5 * ratio;
	g.stroke();
}
