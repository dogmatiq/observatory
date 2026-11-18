import { useEffect, useRef } from "react";
import { heartbeatLine } from "../lib/heartbeat.ts";

/**
 * HeartbeatChart draws one line across the card, like the charts on the other
 * cards, whose height follows each live node's heartbeats.
 *
 * Each node has an equal share of the width, in the order of `levels`, like the
 * segments of the bar of workloads above it. `levels` has the level of each
 * node's heartbeat, from 0 when it is empty to 1 when the node has just sent
 * one. The chart is drawn again when its levels change, when its size changes,
 * and when the page's colors do.
 *
 * It is positioned along the bottom edge of the nearest ancestor that is
 * positioned, and takes its colors from the `--subsystem` and `--subsystem-soft`
 * custom properties that it inherits. It is decoration, so it is hidden from
 * assistive technology.
 */
export function HeartbeatChart({ levels }: { levels: readonly number[] }) {
	const canvas = useRef<HTMLCanvasElement>(null);

	// The levels change with every frame, so the observers below read the latest
	// ones, and are not made again each time.
	const latest = useRef(levels);

	useEffect(() => {
		latest.current = levels;

		const element = canvas.current;
		if (element !== null) {
			drawHeartbeats(element, levels);
		}
	}, [levels]);

	useEffect(() => {
		const element = canvas.current;
		if (element === null) {
			return;
		}

		const draw = () => drawHeartbeats(element, latest.current);
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
	}, []);

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

function drawHeartbeats(canvas: HTMLCanvasElement, levels: readonly number[]) {
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

	const points = heartbeatLine(levels, width, height, ratio);
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
