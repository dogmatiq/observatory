import { useCallback, useEffect, useRef, useState } from "react";
import {
	type Flatline,
	type Frame,
	flatlineAt,
	frameAt,
	type Sighting,
	sightingAt,
	sightingFrameAt,
} from "../lib/flatline.ts";
import { heartbeatLine, levelY } from "../lib/heartbeat.ts";
import { prefersReducedMotion } from "../lib/ramped.ts";
import { type Readout, useSetReadout } from "../lib/readout.tsx";

/**
 * How long a node's share of the chart takes to grow from nothing when it joins,
 * and to shrink away when it leaves, in milliseconds. It is the time that the
 * segments of the bar above it take.
 */
const shareTime = 500;

/**
 * How long the line takes to settle to the height of the flat line when the last
 * node leaves, in milliseconds.
 */
const leaveTime = 700;

/**
 * How long a node's line takes to widen when its share is pointed at, and to
 * narrow again when it isn't, in milliseconds.
 */
const widenTime = 220;

/** How wide the line is, in CSS pixels, and how wide it gets when pointed at. */
const lineWidth = 1.5;
const widenedWidth = 4;

/**
 * How far past each edge of a share its line tapers back to its usual width, and
 * its stronger shade fades out, as a share of the share's width.
 */
const widenReach = 0.2;

/**
 * Section is a node's share of the chart.
 */
export interface Section {
	id: string;

	/** The level of the node's heartbeat, from 0 when it is empty to 1 when full. */
	level: number;

	/**
	 * How late the node's next heartbeat is, from just above 0 when it is first
	 * late to 1 when the latest expires, as {@link latenessOf} gives it. It is
	 * absent while the next heartbeat isn't late.
	 *
	 * [latenessOf]: ../lib/lateness.ts
	 */
	late?: number;

	/**
	 * What the tile says about the node while its share is pointed at. A chart
	 * whose sections have none can't be pointed at.
	 */
	readout?: Readout;
}

/**
 * Share is what the chart draws for one node, which includes a node that has
 * left and whose share is shrinking away.
 */
interface Share {
	id: string;
	level: number;
	late?: number;

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
 * With no node live the line is flat, at the height of a full heartbeat, in gray.
 *
 * While a node's next heartbeat is late, its section glitches, as a figure does,
 * turned on its side: the left and the right half of the section slip up and
 * down on their own, with a red and a cyan shadow, by more the later it is.
 *
 * If the sections have readouts, pointing at a node's share widens its line and
 * strengthens its shade, and gives the tile the section's readout to show. On a
 * screen that is touched, a tap on a share does the same, and a tap on it again,
 * or anywhere else, ends it.
 *
 * It is positioned along the bottom edge of the nearest ancestor that is
 * positioned, and takes its colors from the `--subsystem` and `--subsystem-soft`
 * custom properties that it inherits. It is decoration, so it is hidden from
 * assistive technology.
 */
export function HeartbeatChart({ sections }: { sections: readonly Section[] }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const area = useRef<HTMLDivElement>(null);

	// The node whose share is pointed at, and how far the line of each share has
	// widened, which moves on with time towards 1 for the share that is pointed
	// at and towards 0 for the others.
	const [pointed, setPointed] = useState<string>();
	const pointedRef = useRef(pointed);
	const widening = useRef(new Map<string, Widening>());
	const widenFrame = useRef<number>(0);

	// A share that is pointed at was tapped, rather than pointed at by a mouse.
	const tapped = useRef(false);

	// The levels change with every frame, so the observers below read the latest
	// shares, and are not made again each time.
	const shares = useRef<Share[]>([]);
	const frame = useRef<number>(0);

	// The flat line of a cluster with no live node moves, so it is drawn on its own
	// clock. It is undefined while there are nodes, and for a viewer who asks for
	// less motion, whose flat line is still.
	const flat = useRef<Flatline | undefined>(undefined);
	const flatFrame = useRef<number>(0);

	// The flat line that was drawn when the first node came back, which the sighting
	// starts from, and the sighting itself, which is drawn on its own clock too.
	const departed = useRef<Flatline | undefined>(undefined);
	const sighted = useRef<Sighting | undefined>(undefined);
	const sightingFrame = useRef<number>(0);

	// The shares of the last nodes of the cluster, as they were when the last of them
	// left, while the line that they drew settles to the height of the flat line.
	const leaving = useRef<{ start: number; shares: Share[] } | undefined>(
		undefined,
	);
	const leaveFrame = useRef<number>(0);

	const draw = useCallback(() => {
		const element = canvas.current;
		if (element === null) {
			return;
		}

		const now = performance.now();
		const line = flat.current;
		const c = sighted.current;
		const l = leaving.current;

		if (l !== undefined) {
			const reveal = 1 - Math.min(1, (now - l.start) / leaveTime);
			drawHeartbeats(element, l.shares, undefined, reveal);
		} else if (c !== undefined) {
			const f = sightingFrameAt(c, now);
			drawHeartbeats(
				element,
				shares.current,
				{ burst: f.burst, scan: f.scan },
				f.reveal,
				{ from: c.found, size: c.fromSize },
			);
		} else {
			drawHeartbeats(
				element,
				shares.current,
				line === undefined ? undefined : frameAt(line, now),
				undefined,
				undefined,
				{
					now,
					widened: (id) => widenedAt(widening.current.get(id), now),
					still: prefersReducedMotion(),
				},
			);
		}
	}, []);

	// Pointing at a share, or at none, widens its line and narrows the line of the
	// share that was pointed at before, each from where it was.
	const point = useCallback(
		(id: string | undefined) => {
			const before = pointedRef.current;
			if (id === before) {
				return;
			}

			const now = performance.now();
			const instant = prefersReducedMotion();
			for (const [key, to] of [
				[before, 0],
				[id, 1],
			] as const) {
				if (key !== undefined) {
					const from = instant ? to : widenedAt(widening.current.get(key), now);
					widening.current.set(key, { from, to, at: now });
				}
			}
			pointedRef.current = id;
			setPointed(id);

			// The line widens and narrows on its own clock, so that it moves smoothly
			// however often the chart is given new levels.
			if (widenFrame.current === 0) {
				const step = () => {
					draw();
					const moving = [...widening.current.values()].some(
						(w) => performance.now() - w.at < widenTime,
					);
					widenFrame.current = moving ? requestAnimationFrame(step) : 0;
				};
				widenFrame.current = requestAnimationFrame(step);
			}
		},
		[draw],
	);

	// The tile shows what the section that is pointed at says about its node.
	const setReadout = useSetReadout();
	const readout = sections.find((s) => s.id === pointed)?.readout;
	const readoutKey =
		readout &&
		`${readout.kind}|${readout.figure}|${readout.unit}|${readout.age}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is the readout.
	useEffect(() => {
		setReadout?.(readout);
	}, [readoutKey, setReadout]);
	useEffect(() => () => setReadout?.(undefined), [setReadout]);

	// A node that leaves while its share is pointed at is pointed at no more.
	const pointable = sections.some((s) => s.readout !== undefined);
	const gone =
		pointed !== undefined &&
		(!pointable || !sections.some((s) => s.id === pointed));
	useEffect(() => {
		if (gone) {
			point(undefined);
		}
	}, [gone, point]);

	// A tap anywhere but the chart ends what a tap on it began.
	useEffect(() => {
		if (pointed === undefined) {
			return;
		}

		const onPointerDown = (event: globalThis.PointerEvent) => {
			if (
				event.pointerType === "touch" &&
				!area.current?.contains(event.target as Node)
			) {
				tapped.current = false;
				point(undefined);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [pointed, point]);

	useEffect(() => {
		const known = new Map(shares.current.map((s) => [s.id, s]));
		const live = new Set(sections.map((s) => s.id));

		// The last node leaving does not make the line vanish: it settles to the
		// height that the flat line has.
		const going = shares.current.filter((s) => s.target > 0);
		if (sections.length === 0 && going.length > 0 && !prefersReducedMotion()) {
			leaving.current = {
				start: performance.now(),
				shares: going.map((s) => ({ ...s, size: 1, target: 1 })),
			};

			const step = () => {
				const l = leaving.current;
				if (l === undefined) {
					return;
				}

				if (performance.now() - l.start >= leaveTime) {
					leaving.current = undefined;
					leaveFrame.current = 0;
					draw();
					return;
				}

				draw();
				leaveFrame.current = requestAnimationFrame(step);
			};
			leaveFrame.current = requestAnimationFrame(step);
		} else if (sections.length > 0) {
			leaving.current = undefined;
			cancelAnimationFrame(leaveFrame.current);
		}

		const next: Share[] = sections.map((s) => ({
			id: s.id,
			level: s.level,
			late: s.late,
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

		// The first node coming back to a cluster that had none ends the scan: static,
		// and then the lens finds the heartbeat.
		const line = departed.current;
		departed.current = undefined;
		if (line !== undefined && next.length > 0) {
			sighted.current = sightingAt(line, performance.now());

			const step = () => {
				const c = sighted.current;
				if (c === undefined) {
					return;
				}

				if (sightingFrameAt(c, performance.now()).done) {
					sighted.current = undefined;
					sightingFrame.current = 0;
					draw();
					return;
				}

				draw();
				sightingFrame.current = requestAnimationFrame(step);
			};
			sightingFrame.current = requestAnimationFrame(step);
		}

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

	// With no node live the line moves, until a node comes back.
	const empty = sections.length === 0;
	useEffect(() => {
		if (!empty || prefersReducedMotion()) {
			flat.current = undefined;
			return;
		}

		// A sighting that is under way ends, because the cluster has no node again.
		sighted.current = undefined;
		cancelAnimationFrame(sightingFrame.current);

		flat.current = flatlineAt(performance.now());
		const step = () => {
			draw();
			flatFrame.current = requestAnimationFrame(step);
		};
		flatFrame.current = requestAnimationFrame(step);

		return () => {
			cancelAnimationFrame(flatFrame.current);
			departed.current = flat.current;
			flat.current = undefined;
		};
	}, [empty, draw]);

	useEffect(
		() => () => {
			cancelAnimationFrame(frame.current);
			frame.current = 0;
			cancelAnimationFrame(sightingFrame.current);
			sighted.current = undefined;
			cancelAnimationFrame(leaveFrame.current);
			leaving.current = undefined;
			cancelAnimationFrame(widenFrame.current);
			widenFrame.current = 0;
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
			{pointable && (
				// The shares are named beside the tile's icon as they are pointed at,
				// and each node is listed in words elsewhere, so this is only for the
				// pointer.
				<div
					ref={area}
					aria-hidden="true"
					className="absolute inset-x-0 bottom-0 h-12"
					onPointerMove={(event) => {
						if (event.pointerType === "touch") {
							return;
						}
						point(shareAt(shares.current, event));
					}}
					onPointerLeave={(event) => {
						// A finger leaves the chart as it lifts, which doesn't end what
						// the tap began.
						if (event.pointerType !== "touch") {
							point(undefined);
						}
					}}
					onPointerDown={(event) => {
						tapped.current = event.pointerType === "touch";
						if (!tapped.current) {
							return;
						}
						const id = shareAt(shares.current, event);
						point(id === pointedRef.current ? undefined : id);
					}}
					onClick={(event) => {
						// A tap on the chart of a tile that is a link points at a share,
						// and doesn't follow the link.
						if (tapped.current) {
							event.preventDefault();
						}
					}}
				/>
			)}
		</>
	);
}

/**
 * drawHeartbeats draws the chart. `flat` is how the flat line of a cluster with no
 * node looks. The flat line and the heartbeat are one line that changes its height
 * and its color, and `reveal` is how far it has changed, from 0 when it is the flat
 * line to 1 when it is the heartbeat. If `growth` is given, which is a place along
 * the chart from 0 to 1, a wave spreads out of that place to both ends, and the
 * line takes its color as the wave reaches it, and flows to its own height behind it.
 */
function drawHeartbeats(
	canvas: HTMLCanvasElement,
	shares: readonly Share[],
	flat?: Frame,
	reveal?: number,
	growth?: { from: number; size: number },
	moving?: Moving,
) {
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

	const style = window.getComputedStyle(canvas);

	// With no node live there is no heartbeat, and the line is flat, at the height
	// of a full heartbeat, and in gray. The tile says what is wrong in words and by its accent,
	// so the line only has to be quiet: it is not a heartbeat that is low, and not a
	// metric that is missing, but nothing to measure.
	if (shares.length === 0) {
		drawFlat(g, style, width, height, ratio, flat);
		return;
	}

	if (growth !== undefined && reveal !== undefined) {
		// A wave spreads out of the place, in a window that widens from it, and in the
		// window the grey line is gone. The wave is a ripple on the line, which takes the
		// color of the heartbeats as it goes, and behind the ripple the line flows to the
		// height that the heartbeats put it at, which is the height of the flat line
		// for a node that has just beat, so that the wave leads straight into the
		// heartbeat.
		// The wave grows out of the lens, which is where it is drawn, and not where it
		// would be if it were not kept inside the chart.
		const center = fitLens(growth.from, growth.size, width, height, ratio).x;
		const feather = 0.35 * width;
		// It rises from the line, and not at once, then spreads, and then slows as it
		// reaches the ends, and it is wide enough at the end that the wave is all behind
		// the ends.
		const out = reveal * reveal * (3 - 2 * reveal);
		const half =
			out * (Math.max(center, width - center) + feather * (1 + softness));

		drawFlat(g, style, width, height, ratio, flat, 1, [
			center - half,
			center + half,
		]);
		if (half > 0) {
			drawLine(g, style, shares, width, height, ratio, 0, 1, {
				center,
				half,
				feather,
				// The wave dies away behind its front, and what is left of it dies away
				// entirely over the last of the time that it spreads, so that nothing of it
				// is left when it is done.
				calm: 1 - smooth(Math.min(1, Math.max(0, (reveal - 0.5) / 0.5))),
			});
		}
		return;
	}

	if (reveal === undefined || reveal >= 1) {
		drawLine(g, style, shares, width, height, ratio, 0, 1);
		if (moving !== undefined) {
			drawMoving(g, style, shares, width, height, ratio, moving);
		}
		return;
	}

	// There is one line, and not a heartbeat and a flat line that fade into each
	// other: it settles to the height of the flat line, as it takes its color.
	const eased = reveal * reveal * (3 - 2 * reveal);
	drawLine(g, style, shares, width, height, ratio, 1 - eased, eased);
}

/** smooth eases from 0 to 1 as `t` goes from 0 to 1, and stays at either end. */
function smooth(t: number): number {
	const u = Math.min(1, Math.max(0, t));
	return u * u * (3 - 2 * u);
}

/**
 * How rounded the point where the two fronts of a wave begin is, as a share of the
 * length of a front.
 */
const softness = 0.4;

/**
 * drawLine draws the line of the heartbeats of the nodes. It is the same line as
 * the flat line of a cluster with no node, which has changed its height and its
 * color: `morph` says how far the line is from the flat line, which is at the
 * height of a full heartbeat, from 0 when it is on it to 1 when it is where the
 * heartbeats put it, and `grey` says how far its color is that of the flat line,
 * from 0 when it is the color of the heartbeats to 1 when it is the flat line's,
 * with the shading under it fading out as it goes grey. With a `window`, only the
 * line between `center - half` and `center + half` is drawn, and it is a wave: its
 * ends, which are a `feather` long, are on the flat line and have its color, with a
 * ripple on them, and the line behind them has the height and color that the
 * heartbeats give it, with the shading.
 */
function drawLine(
	g: CanvasRenderingContext2D,
	style: CSSStyleDeclaration,
	shares: readonly Share[],
	width: number,
	height: number,
	ratio: number,
	grey: number,
	morph: number,
	window?: { center: number; half: number; feather: number; calm: number },
) {
	// A share eases in and out, so that it takes the line smoothly.
	const heartbeats = heartbeatLine(
		shares.map((s) => s.level),
		width,
		height,
		ratio,
		shares.map((s) => s.size * s.size * (3 - 2 * s.size)),
	);
	if (heartbeats.length === 0) {
		return;
	}

	const flatY = levelY(1, height, ratio);

	// How far behind the front of the window a place is, in lengths of the front,
	// from 0 at the front, where the line is on the flat line and has the color of
	// it, to 1 when it is a length behind. The distance from the center is rounded
	// off, so that the line has no point at the center, where the two fronts begin.
	const frontness = (x: number) => {
		if (window === undefined) {
			return 1;
		}

		const apart = Math.hypot(x - window.center, softness * window.feather);
		return Math.min(1, Math.max(0, (window.half - apart) / window.feather));
	};

	// What spreads from the place is a wave, which is a ripple on the line: a crest
	// that flicks up at the front, then a trough, then a crest again, and so on,
	// each smaller than the one before, so that it dies away gradually behind the
	// front, as ripples do. It is on the line, whatever the height that the
	// heartbeat settles at.
	const wavelength = 0.2 * width;
	const decay = 0.35 * width;
	const rippleAt = (x: number) => {
		if (window === undefined) {
			return 0;
		}

		// How far behind the front the place is. The distance from the center is
		// rounded off, as it is for the flow of the line.
		const apart = Math.hypot(x - window.center, softness * window.feather);
		const behind = Math.max(0, window.half - apart);

		// The ripple grows with the window, so that it starts at nothing, on the flat
		// line, and not as a hill that is there at once, and its front rises gently.
		return (
			0.2 *
			height *
			smooth(window.half / window.feather) *
			smooth(behind / (0.5 * wavelength)) *
			Math.sin((2 * Math.PI * behind) / wavelength) *
			Math.exp(-behind / decay) *
			window.calm
		);
	};

	const morphAt = (x: number) => {
		if (window === undefined) {
			return morph;
		}

		const u = frontness(x);
		return u * u * (3 - 2 * u);
	};
	const points = heartbeats.map(
		([x, y]) => [x, flatY + (y - flatY) * morphAt(x) - rippleAt(x)] as const,
	);

	g.save();

	// The color of the line is a mix of the heartbeats' and the flat line's.
	const heartbeatColor = rgbOf(g, style.color);
	const flatColor = rgbOf(g, style.getPropertyValue("--color-faint").trim());
	const mixed = (grey: number, alpha = 1) =>
		`rgba(${heartbeatColor
			.map((c, i) => Math.round(c + ((flatColor[i] as number) - c) * grey))
			.join(", ")}, ${alpha})`;
	let stroke: string | CanvasGradient = mixed(grey);

	let fill: string | CanvasGradient = style
		.getPropertyValue("--subsystem-soft")
		.trim();
	g.globalAlpha = 1 - grey;
	if (window !== undefined) {
		const left = window.center - window.half;
		const right = window.center + window.half;
		g.beginPath();
		g.rect(left, 0, right - left, height);
		g.clip();

		// The shading fades in from the edges of the window, with the line.
		const edge = Math.min(0.5, window.feather / (right - left));
		const [r, gr, b] = rgbOf(g, fill);
		const [, , , a = 1] = (fill.match(/[\d.]+/g) ?? []).map(Number);
		const shade = (k: number) => `rgba(${r}, ${gr}, ${b}, ${a * k})`;
		const gradient = g.createLinearGradient(left, 0, right, 0);
		gradient.addColorStop(0, shade(0));
		gradient.addColorStop(edge, shade(1));
		gradient.addColorStop(1 - edge, shade(1));
		gradient.addColorStop(1, shade(0));
		fill = gradient;

		// The line is the color of the flat line at the edges of the window, and
		// takes the color of the heartbeats a little way in, so that the color spreads
		// with the wave.
		const tint = Math.min(0.5, (window.feather * 0.5) / (right - left));
		const colors = g.createLinearGradient(left, 0, right, 0);
		colors.addColorStop(0, mixed(1));
		colors.addColorStop(tint, mixed(0));
		colors.addColorStop(1 - tint, mixed(0));
		colors.addColorStop(1, mixed(1));
		stroke = colors;
	}

	g.beginPath();
	g.moveTo(0, height);
	for (const [x, y] of points) {
		g.lineTo(x, y);
	}
	g.lineTo(width, height);
	g.closePath();
	g.fillStyle = fill;
	g.fill();

	g.beginPath();
	for (const [i, [x, y]] of points.entries()) {
		if (i === 0) {
			g.moveTo(x, y);
		} else {
			g.lineTo(x, y);
		}
	}
	g.globalAlpha = 1;
	g.strokeStyle = stroke;
	g.lineWidth = 1.5 * ratio;
	g.stroke();

	g.restore();
}

/**
 * rgbOf returns the red, green and blue of a CSS color, each from 0 to 255.
 */
function rgbOf(
	g: CanvasRenderingContext2D,
	color: string,
): [number, number, number] {
	// The canvas gives back a color that it has understood as "#rrggbb", or as
	// "rgba(r, g, b, a)" if it isn't opaque.
	g.fillStyle = color;
	const read = String(g.fillStyle);

	if (read.startsWith("#") && read.length === 7) {
		return [
			Number.parseInt(read.slice(1, 3), 16),
			Number.parseInt(read.slice(3, 5), 16),
			Number.parseInt(read.slice(5, 7), 16),
		];
	}

	const [r = 0, gr = 0, b = 0] = (read.match(/[\d.]+/g) ?? []).map(Number);
	return [r, gr, b];
}

/**
 * fitLens returns where a lens is and how big, in canvas pixels, given its `place`,
 * as a share of the way across the chart, and its `size`, as a multiple of its usual
 * radius. It is never so big, nor so near an edge of the chart, that it, and the
 * glow of its rim, are cut off by the edge: it stops short of the top, and when its
 * place is near the left or right edge it stays inside it.
 */
function fitLens(
	place: number,
	size: number,
	width: number,
	height: number,
	ratio: number,
): { x: number; radius: number } {
	const margin = 6 * ratio;
	const radius = Math.min(
		height * 0.2 * size,
		levelY(1, height, ratio) - margin,
		width / 2 - margin,
	);

	return {
		x: Math.min(
			width - radius - margin,
			Math.max(radius + margin, place * width),
		),
		radius,
	};
}

/**
 * roughnessAt returns how far the flat line is off the straight at `x`, in CSS
 * pixels, from -1 to 1 times the roughness that `seed` gives it. The line is
 * rough everywhere, in the same way each time, but too fine to see, except through
 * a lens. It is the same at a place whatever is drawn, so the lens, as it moves,
 * shows the same roughness of the same part of the line.
 */
function roughnessAt(x: number, seed: number): number {
	const noise = (i: number) => {
		const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
		return (v - Math.floor(v)) * 2 - 1;
	};

	// A fine grain, which is a zigzag between its points however big it is shown, and
	// a slower unevenness that is smooth between its points.
	const cell = Math.floor(x);
	const grain = noise(cell) + (noise(cell + 1) - noise(cell)) * (x - cell);
	const slow = Math.floor(x / 5);
	const t = x / 5 - slow;
	const uneven =
		noise(slow + 1000) * (1 - t * t * (3 - 2 * t)) +
		noise(slow + 1001) * (t * t * (3 - 2 * t));

	return 0.6 * grain + 0.8 * uneven;
}

/**
 * heartbeatAt returns the height, as a share of the lens's radius and down from the
 * flat line, of a clean heartbeat, as a heart monitor draws it, at `t`, which is how
 * far across the lens it is, from -1 to 1: a small rise, then a sharp spike with a
 * dip before it and after it, then a broad rise, and flat between them.
 */
function heartbeatAt(t: number): number {
	const bump = (center: number, width: number, height: number) =>
		height * Math.exp(-(((t - center) / width) ** 2));

	// Up is negative.
	return -(
		bump(-0.62, 0.11, 0.13) -
		bump(-0.17, 0.045, 0.12) +
		bump(-0.04, 0.055, 0.8) -
		bump(0.08, 0.05, 0.27) +
		bump(0.55, 0.14, 0.24)
	);
}

/**
 * lensClearance returns how far from the rim of a lens of `radius` the line stops,
 * outside the circle and inside it, so that no line touches the circle, in canvas
 * pixels. It is 1.75 CSS pixels: a pixel more than half the width of the circle's
 * line. It is less for a lens that is small, so that the gap in the line closes as
 * the lens shrinks to nothing, and for a lens that is fading, as `fade`, from 0 to
 * 1, says. A lens that shrinks is not fading, because its circle is as grey as the
 * line, and blends into it as it closes.
 */
function lensClearance(radius: number, fade: number, ratio: number): number {
	return Math.min(1.75 * ratio, radius * 0.4) * fade;
}

/**
 * drawLens draws a lens on the flat line, at `x`: a circle of `radius`, which is
 * as thick and as grey as the line, through which the line is seen in more detail,
 * and in the color of the cluster, as a telescope shows what the eye does not see.
 * The line is rough inside the circle, and straight outside it, and smooth where it
 * enters, and neither touches the circle: there is a gap between them and it.
 * `strength`, from 0 to 1, is how bright the lens is, `focus`, from 0 to 1, how
 * sharp the detail is, `zoom`, how much it is magnified, and `resolve`, from 0 to 1,
 * how far the roughness has resolved into a clean heartbeat.
 */
function drawLens(
	g: CanvasRenderingContext2D,
	style: CSSStyleDeclaration,
	x: number,
	y: number,
	radius: number,
	strength: number,
	fade: number,
	focus: number,
	zoom: number,
	resolve: number,
	ratio: number,
) {
	// The circle is the color of the line, and the line seen through it is the color
	// of the cluster.
	const [fr, fg, fb] = rgbOf(g, style.getPropertyValue("--color-faint").trim());
	const [r, gr, b] = rgbOf(g, style.getPropertyValue("--subsystem").trim());
	const detail = (a: number) => `rgba(${r}, ${gr}, ${b}, ${a})`;

	// Zooming in shows the roughness larger, in both directions, about the center of
	// the lens.
	const magnification = 1 + 4 * zoom;

	// What is inside the circle stops short of it.
	const inner = Math.max(0, radius - lensClearance(radius, fade, ratio));

	g.save();
	g.beginPath();
	g.arc(x, y, inner, 0, 2 * Math.PI);
	g.clip();

	// The line as the lens shows it: rough, by less where it enters, and by less the
	// less sharp the lens is, as two strands that are not the same. When the line is
	// found it resolves from the roughness into a clean heartbeat, which is a single
	// strand.
	for (const [seed, alpha, width] of [
		[1, 1, 1.3],
		[2, 0.5 * (1 - resolve), 1],
	] as const) {
		g.beginPath();
		for (let dx = -inner; dx <= inner; dx += ratio / 2) {
			const edge = 1 - (dx / inner) ** 4;
			const rough =
				roughnessAt(x / ratio + dx / ratio / magnification, seed) *
				2.4 *
				Math.sqrt(magnification) *
				ratio *
				edge *
				(0.5 + 0.5 * focus);
			const off = rough + (heartbeatAt(dx / inner) * inner - rough) * resolve;
			if (dx === -inner) {
				g.moveTo(x + dx, y + off);
			} else {
				g.lineTo(x + dx, y + off);
			}
		}
		g.lineWidth = width * ratio;
		g.strokeStyle = detail(alpha * strength * (0.6 + 0.4 * focus));
		g.shadowColor = detail(0.6 * strength);
		g.shadowBlur = 5 * (1 - focus) * ratio;
		g.stroke();
	}
	g.restore();

	// The circle: a plain line, as thick as the flat line.
	g.lineWidth = 1.5 * ratio;
	g.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, ${fade})`;
	g.beginPath();
	g.arc(x, y, radius, 0, 2 * Math.PI);
	g.stroke();
}

/**
 * drawFlat draws the flat line, at some opacity. After a burst of interference, as
 * of static on a screen, a lens passes along it, to and fro and at different
 * speeds, as of something searching the line for the cluster: a circle through
 * which the line is seen in more detail than it is without it. Without a `frame` it
 * is a still, plain line, which is not drawn between the two places of a `gap`, if
 * there is one.
 */
function drawFlat(
	g: CanvasRenderingContext2D,
	style: CSSStyleDeclaration,
	width: number,
	height: number,
	ratio: number,
	frame?: Frame,
	opacity = 1,
	gap?: readonly [number, number],
) {
	const faint = style.getPropertyValue("--color-faint").trim();
	const muted = style.getPropertyValue("--color-muted").trim();
	const flatY = levelY(1, height, ratio);

	g.lineWidth = 1.5 * ratio;

	const stroke = (color: string | CanvasGradient, alpha = 1) => {
		g.globalAlpha = alpha * opacity;
		g.strokeStyle = color;
		g.stroke();
		g.globalAlpha = 1;
	};

	// The line is not drawn where the lens is, because the lens draws it there in
	// more detail, nor where the heartbeat has taken its place.
	const lens = frame?.scan;
	const lensStrength = (lens?.strength ?? 0) * opacity;

	// The lens grows from nothing as it appears and shrinks to nothing as it goes,
	// so that it is always whole. When it gives up it shrinks slowly, and more slowly
	// as it gets smaller, as of a sigh. It is bigger or smaller as it scans, and is
	// as big as it was when it zooms in on what it has found, which is what it shows
	// that gets bigger.
	const grown = Math.min(1, lensStrength) ** 0.7;
	const { x: lensX, radius: lensRadius } = fitLens(
		lens?.place ?? 0,
		(lens?.size ?? 1) * grown,
		width,
		height,
		ratio,
	);
	const lensBrightness = Math.min(1, lensStrength * 1.5) * (lens?.fade ?? 1);
	const lensReach =
		lensRadius + lensClearance(lensRadius, lens?.fade ?? 1, ratio);

	const gaps: [number, number][] = [];
	if (gap !== undefined) {
		gaps.push([gap[0], gap[1]]);
	}
	if (lens !== undefined && lensBrightness > 0) {
		gaps.push([lensX - lensReach, lensX + lensReach]);
	}
	gaps.sort((a, b) => a[0] - b[0]);

	g.beginPath();
	let from = 0;
	for (const [start, end] of gaps) {
		if (start > from) {
			g.moveTo(from, flatY);
			g.lineTo(Math.min(width, start), flatY);
		}
		from = Math.max(from, end);
	}
	if (from < width) {
		g.moveTo(Math.max(0, from), flatY);
		g.lineTo(width, flatY);
	}
	stroke(faint, frame?.burst === undefined ? 1 : 0.35);

	if (lens !== undefined && lensBrightness > 0) {
		drawLens(
			g,
			style,
			lensX,
			flatY,
			lensRadius,
			lensBrightness,
			lens.fade ?? 1,
			lens.focus ?? 1,
			lens.zoom ?? 0,
			lens.resolve ?? 0,
			ratio,
		);
	}

	if (frame?.burst === undefined) {
		return;
	}

	// Interference: the line breaks up into jitter that rises and dies away, with a
	// few short pieces torn sideways.
	const strength = Math.sin(Math.PI * frame.burst);
	const jitter = 7 * ratio * strength;

	g.beginPath();
	g.moveTo(0, flatY);
	for (let x = 0; x <= width; x += 3 * ratio) {
		g.lineTo(x, flatY + (Math.random() - 0.5) * 2 * jitter);
	}
	stroke(muted, 0.35 + 0.5 * strength);

	for (let i = 0; i < 3; i++) {
		const length = width * (0.08 + Math.random() * 0.17);
		const x = Math.random() * (width - length);
		const y = flatY + (Math.random() - 0.5) * 2 * 14 * ratio * strength;

		g.beginPath();
		g.moveTo(x, y);
		g.lineTo(x + length, y);
		stroke(muted, 0.6 * strength);
	}
}

/**
 * Widening is how the line of a share is widening or narrowing: from how wide,
 * to how wide, and since when, where 0 is its usual width and 1 is its width
 * when it is pointed at.
 */
interface Widening {
	from: number;
	to: number;
	at: number;
}

/** widenedAt returns how far a share's line has widened at `now`, from 0 to 1. */
function widenedAt(w: Widening | undefined, now: number): number {
	if (w === undefined) {
		return 0;
	}
	return w.from + (w.to - w.from) * smooth((now - w.at) / widenTime);
}

/**
 * shareAt returns the ID of the node whose share is under the pointer of
 * `event`, if any. A node that has left, whose share is shrinking away, can't be
 * pointed at.
 */
function shareAt(
	shares: readonly Share[],
	event: { clientX: number; currentTarget: Element },
): string | undefined {
	const box = event.currentTarget.getBoundingClientRect();
	const u = (event.clientX - box.left) / box.width;
	const sizes = shares.map((s) => smooth(s.size));
	const total = sizes.reduce((sum, w) => sum + w, 0);

	let before = 0;
	for (const [i, s] of shares.entries()) {
		before += sizes[i] as number;
		if (u * total <= before) {
			return s.target > 0 ? s.id : undefined;
		}
	}
	return undefined;
}

/**
 * Moving is what the chart draws over the line of the heartbeats, which moves
 * with time and not only with the levels: the glitch of a node whose next
 * heartbeat is late, and the widening of the line of a share that is pointed at.
 * `now` is the time, `widened` says how far the line of a node's share has
 * widened, and `still` is true for a viewer who asks for less motion, for whom a
 * late node's section doesn't slip, and has only its shadows.
 */
interface Moving {
	now: number;
	widened: (id: string) => number;
	still: boolean;
}

/**
 * The keyframes of the glitch of a figure, from index.css, which a late node's
 * section follows: for each, the share of the way through the cycle at which it
 * starts, and how far it slips, in pixels, when the distrust is 1.
 */
const glitchLeft = {
	cycle: 2300,
	frames: [
		[0, 1],
		[0.1, 8],
		[0.22, -3],
		[0.28, 1],
		[0.55, -10],
		[0.68, 4],
		[0.74, 1],
	],
} as const;
const glitchRight = {
	cycle: 1700,
	frames: [
		[0, -1],
		[0.16, -9],
		[0.3, 3],
		[0.36, -1],
		[0.62, 11],
		[0.78, -4],
		[0.84, -1],
	],
} as const;

/** The red and the cyan of the shadows of the glitch of a figure, in index.css. */
const glitchRed = "rgba(255, 45, 85, 0.85)";
const glitchCyan = "rgba(0, 210, 200, 0.85)";

/**
 * slipAt returns how far the keyframes of a glitch slip at `now`, in pixels when
 * the distrust is 1. Like the glitch of a figure, it jumps from one keyframe to
 * the next, and doesn't move between them.
 */
function slipAt(
	keyframes: {
		cycle: number;
		frames: readonly (readonly [number, number])[];
	},
	now: number,
): number {
	const t = (now % keyframes.cycle) / keyframes.cycle;
	let slip = 0;
	for (const [at, px] of keyframes.frames) {
		if (t >= at) {
			slip = px;
		}
	}
	return slip;
}

/**
 * taper returns how much of an effect on a section shows at `x`, from 0 at the
 * section's ends, `x0` and `x1`, rising over the outer `edge` of it on each side,
 * to 1 between, so that the section stays joined to the line beside it.
 */
function taper(x: number, x0: number, x1: number, edge: number): number {
	return smooth(Math.min(x - x0, x1 - x) / ((x1 - x0) * edge));
}

/**
 * drawMoving draws the glitch of each node whose next heartbeat is late, and
 * then the widening of the line of each share that is pointed at, along the line
 * as the glitches left it.
 */
function drawMoving(
	g: CanvasRenderingContext2D,
	style: CSSStyleDeclaration,
	shares: readonly Share[],
	width: number,
	height: number,
	ratio: number,
	moving: Moving,
) {
	const sizes = shares.map((s) => smooth(s.size));
	const total = sizes.reduce((sum, w) => sum + w, 0);
	if (total <= 0) {
		return;
	}

	// The same line that drawLine drew.
	const line: [number, number][] = heartbeatLine(
		shares.map((s) => s.level),
		width,
		height,
		ratio,
		sizes,
	).map(([x, y]) => [x, y]);
	if (line.length === 0) {
		return;
	}

	const [r, gr, b] = rgbOf(g, style.color);
	const color = (a: number) => `rgba(${r}, ${gr}, ${b}, ${a})`;
	const soft = style.getPropertyValue("--subsystem-soft").trim();

	// Where each share is, across the chart, in canvas pixels.
	let before = 0;
	const places = shares.map((s, i) => {
		const x0 = (before / total) * width;
		before += sizes[i] as number;
		return { share: s, x0, x1: (before / total) * width };
	});

	for (const { share, x0, x1 } of places) {
		if (share.late !== undefined && share.target > 0 && x1 > x0) {
			drawLate(g, line, x0, x1, height, ratio, share, moving, color(1), soft);
		}
	}

	for (const { share, x0, x1 } of places) {
		const widened = moving.widened(share.id);
		if (widened > 0 && x1 > x0) {
			drawWidened(g, line, x0, x1, width, height, ratio, widened, color);
		}
	}
}

/**
 * drawLate draws the section of a node whose next heartbeat is late, from `x0`
 * to `x1`, as a figure's glitch turned on its side, and moves the points of
 * `line` in the section to where it drew them.
 *
 * The left and the right half of the section slip up and down on their own, on
 * the keyframes of a figure's glitch, with a red and a cyan shadow above and
 * below the line, by more as the heartbeat gets later. The slip and the shadows
 * taper to nothing at the section's ends, so that it stays joined to the line
 * beside it.
 */
function drawLate(
	g: CanvasRenderingContext2D,
	line: [number, number][],
	x0: number,
	x1: number,
	height: number,
	ratio: number,
	share: Share,
	moving: Moving,
	stroke: string,
	fill: string,
) {
	// The distrust is there as soon as the heartbeat is late, and is at its most
	// as the latest heartbeat expires. A figure's glitch slips by more pixels than
	// this, because it is bigger.
	const distrust = 0.35 + 0.65 * (share.late ?? 0);
	const scale = 0.9 * distrust * ratio;

	// Each node slips at its own moments, so that two late nodes don't slip in
	// step.
	const offset = [...share.id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
	const left = moving.still ? 0 : slipAt(glitchLeft, moving.now + offset * 37);
	const right = moving.still
		? 0
		: slipAt(glitchRight, moving.now + offset * 53);
	const middle = (x0 + x1) / 2;

	const weight = (x: number) => taper(x, x0, x1, 0.15);
	for (const point of line) {
		const x = point[0];
		if (x >= x0 && x <= x1) {
			point[1] += (x < middle ? left : right) * scale * weight(x);
		}
	}

	const inSection = line.filter(
		([x]) => x >= x0 - 2 * ratio && x <= x1 + 2 * ratio,
	);
	const trace = (shadow: number) => {
		g.beginPath();
		for (const [i, [x, y]] of inSection.entries()) {
			const at = y + shadow * weight(x);
			if (i === 0) {
				g.moveTo(x, at);
			} else {
				g.lineTo(x, at);
			}
		}
	};

	g.save();
	g.beginPath();
	g.rect(x0, 0, x1 - x0, height);
	g.clip();
	g.clearRect(x0, 0, x1 - x0, height);

	trace(0);
	g.lineTo(inSection.at(-1)?.[0] ?? x1, height);
	g.lineTo(inSection[0]?.[0] ?? x0, height);
	g.closePath();
	g.fillStyle = fill;
	g.fill();

	g.lineWidth = lineWidth * ratio;
	const fringe = 2 * distrust * ratio;
	for (const [shadow, color] of [
		[-fringe, glitchRed],
		[fringe, glitchCyan],
		[0, stroke],
	] as const) {
		trace(shadow);
		g.strokeStyle = color;
		g.stroke();
	}
	g.restore();
}

/**
 * drawWidened draws the line of a share that is pointed at wider, by `widened`,
 * from 0 to 1, and its shade stronger, by as much. The line is drawn as a band
 * along `line` whose width changes along its length: it is widest in the share,
 * from `x0` to `x1`, and tapers back to the usual width just past its edges, so
 * that the share has no border.
 */
function drawWidened(
	g: CanvasRenderingContext2D,
	line: readonly (readonly [number, number])[],
	x0: number,
	x1: number,
	width: number,
	height: number,
	ratio: number,
	widened: number,
	color: (alpha: number) => string,
) {
	const reach = (x1 - x0) * widenReach;
	const from = x0 - reach;
	const to = x1 + reach;
	const amount = (x: number) =>
		widened * smooth(Math.min(x - from, to - x) / (2 * reach));

	// The shade, under the whole line, fading out at the same edges.
	const shade = g.createLinearGradient(from, 0, to, 0);
	const edge = (2 * reach) / (to - from);
	shade.addColorStop(0, color(0));
	shade.addColorStop(edge, color(0.14 * widened));
	shade.addColorStop(1 - edge, color(0.14 * widened));
	shade.addColorStop(1, color(0));
	g.beginPath();
	g.moveTo(0, height);
	for (const [x, y] of line) {
		g.lineTo(x, y);
	}
	g.lineTo(width, height);
	g.closePath();
	g.fillStyle = shade;
	g.fill();

	// The band: each point of the line offset to each side, square to the line,
	// by half the width there.
	const upper: [number, number][] = [];
	const lower: [number, number][] = [];
	for (const [i, [x, y]] of line.entries()) {
		if (x < from - 2 * ratio || x > to + 2 * ratio) {
			continue;
		}
		const [px, py] = line[Math.max(0, i - 1)] as readonly [number, number];
		const [nx, ny] = line[Math.min(line.length - 1, i + 1)] as readonly [
			number,
			number,
		];
		const length = Math.hypot(nx - px, ny - py) || 1;
		const half =
			((lineWidth + (widenedWidth - lineWidth) * amount(x)) / 2) * ratio;
		const ox = (-(ny - py) / length) * half;
		const oy = ((nx - px) / length) * half;
		upper.push([x + ox, y + oy]);
		lower.push([x - ox, y - oy]);
	}
	if (upper.length === 0) {
		return;
	}

	g.beginPath();
	for (const [i, [x, y]] of upper.entries()) {
		if (i === 0) {
			g.moveTo(x, y);
		} else {
			g.lineTo(x, y);
		}
	}
	for (const [x, y] of lower.reverse()) {
		g.lineTo(x, y);
	}
	g.closePath();
	g.fillStyle = color(1);
	g.fill();
}
