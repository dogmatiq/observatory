import {
	type ReactNode,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.ts";
import { Icon } from "./Icon.tsx";
import { MoonHolder } from "./Sky.tsx";

/*
 * The explainer of a card: a dialog that zooms a copy of the card, with made-up
 * figures, to the middle of the window, with hand-lettered annotations around it
 * that point at its parts, and paragraphs under it. Explainable puts the "?" that
 * opens it on a card. See the Explainers section of docs/ui-design.md.
 */

/** Where a card's "?" is. */
export type Placement = "icon" | "bottom-right" | "bottom-left";

/**
 * How a card's "?" looks: in the muted color or the card's own, at the size of a
 * small icon or of the card's icon, and as an outline or a filled circle.
 */
export interface Look {
	ink: Ink;
	size: "small" | "large";
	inverse: boolean;
}

/** The color of a card's "?". */
export type Ink = "muted" | "card" | "chart";

export const inks: [Ink, string][] = [
	["card", "In the card’s color"],
	["chart", "In the color of the chart"],
	["muted", "Muted"],
];

/**
 * chartInk returns the color of a card's chart: the color of its line, or of a
 * chart drawn on a canvas, or of the ground of the sky that is there in place of
 * a chart, or undefined if the card has none of them.
 */
function chartInk(card: Element): string | undefined {
	// The charts are the sparklines, which are 12 or 10 units high.
	const line = [...card.querySelectorAll("svg.h-12 path, svg.h-10 path")].find(
		(path) => getComputedStyle(path).stroke !== "none",
	);
	if (line) {
		return getComputedStyle(line).stroke;
	}
	const canvas = card.querySelector("canvas");
	if (canvas) {
		return getComputedStyle(canvas).color;
	}
	// A card whose chart isn't reported has a sky in its place, whose ground is
	// tinted with the color that the chart would have had.
	const ground = card.querySelector("path.fill-current");
	return ground ? getComputedStyle(ground).fill : undefined;
}

/**
 * size returns the classes of the size of a card's "?" button and its glyph: as
 * large as the card's icon in the icon's place, and a step larger if it is to be
 * larger.
 */
function size(placement: Placement, look: Look) {
	const step = (placement === "icon" ? 1 : 0) + (look.size === "large" ? 1 : 0);
	return [
		{ button: "size-6", glyph: "size-4" },
		{ button: "size-7", glyph: "size-5" },
		{ button: "size-8", glyph: "size-6" },
	][step] as { button: string; glyph: string };
}

/** How a card's "?" shows. */
export type Showing = "always" | "quiet" | "faint" | "hover";

/** The ways that the "?" can show on a desktop. */
export const reveals: [Showing, string][] = [
	["quiet", "Always, in the faint color, and darker on pointing"],
	["faint", "Always, at 40%, and fully on pointing"],
	["hover", "Only on pointing (now)"],
];

export const placements: [Placement, string][] = [
	["icon", "In the icon's place, at the top right"],
	["bottom-right", "At the bottom right"],
	["bottom-left", "At the bottom left"],
];

/**
 * Explainable puts the button that opens a card's explainer in the place of the
 * card's icon, at its top right. The icon stays on show until the card is pointed
 * at or has the keyboard's focus, and then the button's "?" takes its place. A
 * compact digest has no icon, so its "?" appears where an icon would be. The
 * button lies over the card, and is not inside it, because a card may be a link.
 */
export function Explainable({
	label,
	icon,
	placement,
	shown,
	look,
	onExplain,
	children,
}: {
	label: string;

	/** Where the "?" is. */
	placement: Placement;

	/**
	 * When the "?" shows: always; always, but in the faint color until the card
	 * is pointed at; at 40% until then; or only while the card is pointed at or
	 * has focus.
	 */
	shown: Showing;

	/** How the "?" looks. */
	look: Look;

	/** A CSS selector for the card's icon, if it has one. */
	icon?: string;

	/**
	 * Called with where the card is, and whether its sky has the moon, which the
	 * explainer's copy of it then has too.
	 */
	onExplain: (from: DOMRect, moon: boolean) => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [at, setAt] = useState<{ x: number; y: number }>();
	// The card's own color, which is its icon's, and the color of its chart, or
	// the accent for a card with neither, such as a compact digest.
	const [cardInk, setCardInk] = useState("var(--color-accent)");
	const [lineInk, setLineInk] = useState("var(--color-accent)");

	// The button is centred on the icon, or, with no icon, on the right of the
	// card's first line, inside its padding.
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		function place() {
			if (!el) {
				return;
			}
			const box = el.getBoundingClientRect();
			const tinted = icon ? el.querySelector(icon) : null;
			setCardInk(
				tinted ? getComputedStyle(tinted).color : "var(--color-accent)",
			);
			setLineInk(chartInk(el) ?? "var(--color-accent)");
			if (placement !== "icon") {
				// In a bottom corner, inside the card's rounded edge.
				setAt({
					x: placement === "bottom-right" ? box.width - 18 : 18,
					y: box.height - 18,
				});
				return;
			}
			const target = icon
				? el.querySelector(icon)
				: el.querySelector("span.truncate");
			if (!target) {
				return;
			}
			const r = target.getBoundingClientRect();
			setAt({
				x: icon ? r.left + r.width / 2 - box.left : box.width - 22,
				y: r.top + r.height / 2 - box.top,
			});
		}
		place();
		const resized = new ResizeObserver(place);
		resized.observe(el);
		return () => resized.disconnect();
	}, [icon, placement]);

	const explain = () => {
		const rect = ref.current?.getBoundingClientRect();
		if (rect) {
			onExplain(rect, ref.current?.querySelector("[data-moon]") !== null);
		}
	};

	return (
		<div ref={ref} className="group relative">
			{children}
			{at && (
				<button
					type="button"
					aria-label={`Explain the ${label}`}
					className={cn(
						"absolute z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-panel transition-[opacity,color,transform] duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:scale-110 motion-reduce:transition-none",
						size(placement, look).button,
						look.ink === "muted" &&
							(shown === "quiet"
								? "text-faint group-focus-within:text-muted group-hover:text-muted hover:text-fg"
								: "text-muted hover:text-fg"),
						shown === "always" || shown === "quiet"
							? "opacity-100"
							: shown === "faint"
								? "opacity-40"
								: "opacity-0",
					)}
					style={{
						left: at.x,
						top: at.y,
						color:
							look.ink === "card"
								? cardInk
								: look.ink === "chart"
									? lineInk
									: undefined,
					}}
					onClick={explain}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						className={size(placement, look).glyph}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						{/* Lucide's circle-question-mark, or, inverse, its circle filled
						and its mark in the card's ground. */}
						<circle
							cx="12"
							cy="12"
							r="10"
							fill={look.inverse ? "currentColor" : "none"}
						/>
						<g stroke={look.inverse ? "var(--color-panel)" : "currentColor"}>
							<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
							<path d="M12 17h.01" />
						</g>
					</svg>
				</button>
			)}
		</div>
	);
}

/** An annotation: words, and the part of the card that they point at. */
export interface Note {
	/** A CSS selector for the part, within the card. */
	at: string;
	text: string;

	/**
	 * Where the words are: beside the card, or above it. Words go above the card
	 * for a part that is far from both of its sides and that an arrow can reach
	 * from above without crossing words, so that the arrow is short. They start just to the right of the part, and the arrow
	 * leaves their left edge and comes down onto the part's top edge.
	 */
	side: "left" | "right" | "top";

	/**
	 * True if words above the card end just to the left of the part, rather than
	 * start just to its right, because a part to its right needs that room. The
	 * arrow then leaves their right edge.
	 */
	wordsLeft?: true;

	/**
	 * Where the arrow ends on the part's visible text, and not on its box, which
	 * can be much wider than its text: `true` for all of the text, or the words
	 * within it, such as "+2".
	 */
	atText?: true | string;

	/**
	 * Where the arrow comes in, if not at the part's side facing the words: from
	 * above or below, down or up onto the middle of the part's top or bottom
	 * edge, so that it points at the part and doesn't cross the words beside it;
	 * or onto the top left corner of the part's own words, such as a vital's
	 * figure.
	 */
	approach?: "above" | "below" | "top-left";

	/** What the card must show for the annotation to be there, if anything. */
	when?: Shown;

	/**
	 * Which way the arrow bows, if not the way that its approach gives: "under"
	 * dips in the middle, and "over" rises.
	 */
	bow?: "under" | "over";

	/**
	 * Other words that are in focus with the part, such as the label of a vital,
	 * which is in the detail line, under the figure, or the "+N" of the failing
	 * ones of a number that waits, which are part of that number. Words that
	 * keep their ink, as a "+N" keeps its orange, aren't drawn in the color of
	 * the most prominent text.
	 */
	with?: { at: string; atText: string | true; keepInk?: true }[];

	/**
	 * True if the text keeps its own color while the annotation is pointed at,
	 * because its color is what it shows, as a failing count's orange does.
	 */
	keepInk?: true;

	/** How far the words are moved down from the arrow's end, in pixels. */
	dy?: number;

	/**
	 * Set to "chart" for a part that is a chart: the arrow ends in the shaded
	 * area under the chart's line, near its right end, and never on the line.
	 */
	into?: "chart";
}

/**
 * Shown is a condition on what a card shows: the words that it must have, or
 * must not have, in its text, and a part that it must have.
 */
export interface Shown {
	has?: string;
	lacks?: string;
	part?: string;
}

/** shows returns whether a card shows what a condition asks for. */
function shows(card: Element, when: Shown | undefined): boolean {
	if (!when) {
		return true;
	}
	const text = card.textContent ?? "";
	return (
		(when.has === undefined || text.includes(when.has)) &&
		(when.lacks === undefined || !text.includes(when.lacks)) &&
		(when.part === undefined || card.querySelector(when.part) !== null)
	);
}

/**
 * A paragraph under an explainer's card: either one that is true of every
 * application, or one that depends on the engine that runs this application,
 * which is drawn apart, on a sunken ground, with the engine icon. No status is
 * ever in an explainer, so it can't be taken for one.
 */
export type Paragraph =
	| string
	| { text: string; when: Shown }
	| {
			when?: Shown;
			key: string;
			text: ReactNode;

			/** A further paragraph in the same box, if any. */
			more?: string;
	  };

export interface ExplainerSpec {
	label: string;

	/** A CSS selector for the card's icon, if it has one. */
	icon?: string;

	/** What the card is about, and where, above the card. */
	title: ReactNode;

	width: number;
	card: ReactNode;
	notes: Note[];

	/** Definitions and advice that don't fit an annotation, under the card. */
	paragraphs?: Paragraph[];

	/** What the hovercards that explained the card said, for comparison. */
	before: string[];
}

/** The most that the card is enlarged in the dialog, if the window has room. */
const maxZoom = 1.5;

/** The least room between the explainer and the edges of the window. */
const edge = 16;

/**
 * fitZoom returns how much the stage is enlarged: as much as the window has room
 * for, up to the most, but never less than its own size, so that its words are
 * never smaller than they are on the page. A stage taller than the window
 * scrolls. In a narrow window, the stage is its own size.
 */
function fitZoom(stage: HTMLElement, narrow: boolean): number {
	if (narrow) {
		return 1;
	}
	return Math.max(
		1,
		Math.min(
			maxZoom,
			(window.innerWidth - 2 * edge) / stage.offsetWidth,
			(window.innerHeight - 2 * edge) / stage.offsetHeight,
		),
	);
}

/** How long the card takes to zoom, in milliseconds. */
const zoomTime = 280;

/**
 * The room around the card for its annotations, in the card's own pixels, before
 * the zoom.
 */
const room = { x: 220, y: 36 };

/** How far the words of an annotation are from the side of the card. */
const gap = 36;

/** How far the words of an annotation above the card are from its top. */
const topGap = 26;

/**
 * How far the words of an annotation above the card start to the right of its
 * part, so that the arrow leaves their left edge and turns down onto the part.
 */
const topAside = 14;

/**
 * The steepest that an arrow leaves its words, in radians from the line straight
 * away from them, so that it plainly comes out of the words rather than slipping
 * off past them.
 */
const steepestExit = (10 * Math.PI) / 180;

/**
 * The length of the straight end of an arrow, where its head is. It is longer
 * than the strokes of the head, so that the line of the arrow arrives between
 * them and never along or outside one of them.
 */
const arrival = 10;

/**
 * The least room between the words of two annotations, in the card's own
 * pixels.
 */
const clearance = 16;

/** The name of the highlight of the text of the annotation that is pointed at. */
const focusName = "explainer-focus";

/**
 * How much the words of an annotation are tilted: the sine of their angle,
 * which is 3 degrees, as in the classes that tilt them.
 */
const tilt = Math.sin((3 * Math.PI) / 180);

/** How far an arrow stops short of the part that it points at. */
const arrowGap = 4;

/** The room around a part that is shown in color, in the card's own pixels. */
const spotPad = 4;

/** How far the color fades into the gray around a part, in the card's own pixels. */
const spotFade = 16;

/**
 * Explainer is the dialog that explains one card. It zooms a copy of the card
 * from where the card is on the page to the middle of the window, and then shows
 * each annotation: words at the side of the card, in the hand-lettered type, with
 * a hand-drawn arrow to the part that they are about, beside the card or above
 * it. Under the card it says that its figures are examples, then what the card is
 * about, and then the definitions and advice that don't fit an annotation.
 *
 * The copy is in its own colors, with a caption that says its data is only an
 * example. Pointing at an annotation, or at the part that it is about, fades the
 * rest of the card back, so that the part stands out. The copy can't be used:
 * nothing in it can be pressed.
 *
 * The annotations are laid out in the card's own pixels, and are scaled with the
 * card by one transform, so they stay on their parts at any size, and while the
 * card moves.
 */
export function Explainer({
	explainer,
	from,
	moon,
	onClose,
}: {
	explainer: ExplainerSpec;
	from: DOMRect;

	/** True if the card's sky has the moon, so that the copy's sky has it too. */
	moon: boolean;
	onClose: () => void;
}) {
	const stage = useRef<HTMLDivElement>(null);
	const card = useRef<HTMLDivElement>(null);
	const close = useRef<HTMLButtonElement>(null);
	const colored = useRef<HTMLDivElement>(null);
	const [zoom, setZoom] = useState(maxZoom);
	const [win, setWin] = useState(() => ({
		w: window.innerWidth,
		h: window.innerHeight,
	}));
	// The annotations are beside the card only while they fit there at their
	// full size. In a narrower window, each is a numbered marker on the card,
	// and their words are listed under it, and the card is as wide as the window
	// allows.
	const narrow = win.w < explainer.width + 2 * room.x + 2 * edge;
	const cardWidth = narrow
		? Math.min(explainer.width, win.w - 2 * edge)
		: explainer.width;
	const textWidth = narrow ? cardWidth : Math.max(explainer.width, 360);
	// A card narrower than the text under it is centred over the text.
	const inset = (textWidth - cardWidth) / 2;
	useEffect(() => {
		const resized = () =>
			setWin({ w: window.innerWidth, h: window.innerHeight });
		window.addEventListener("resize", resized);
		return () => window.removeEventListener("resize", resized);
	}, []);
	const [start, setStart] = useState<string>();
	const [settled, setSettled] = useState(false);
	const [drawn, setDrawn] = useState<Drawn[]>([]);
	// Which of the paragraphs under the card are about parts that it shows.
	const [shown, setShown] = useState<boolean[]>([]);
	const [active, setActive] = useState<number>();
	// How much room is above the card for the annotations there.
	const [reach, setReach] = useState<Reach>({ above: 0, below: 0 });
	// The caption under the card, which annotations below the card may sit
	// beside, but the text under it may not.
	const caption = useRef<HTMLParagraphElement>(null);

	// The card is as large as the window has room for, up to the most. It starts
	// where it is on the page, at its size there, and moves to the middle. The
	// stage is scaled about its middle, which is not the card's, so where the card
	// ends up is read with the final transform in place, before the first paint.
	// The card moves from the page only when the dialog opens, so a change of
	// layout afterwards doesn't move it again; the next effect fits it instead.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const st = stage.current;
		const el = card.current;
		if (!st || !el) {
			return;
		}
		const z = fitZoom(st, narrow);
		st.style.transform = `scale(${z})`;
		const to = el.getBoundingClientRect();
		const k = from.width / to.width;
		const dx = from.left + from.width / 2 - (to.left + to.width / 2);
		const dy = from.top + from.height / 2 - (to.top + to.height / 2);
		setZoom(z);
		setStart(`translate(${dx}px, ${dy}px) scale(${z * k})`);
		const frame = requestAnimationFrame(() =>
			requestAnimationFrame(() => setStart(undefined)),
		);
		const done = window.setTimeout(() => setSettled(true), zoomTime + 60);
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(done);
		};
	}, [from]);

	// The card fits a window that changes size, and a stage that grows to make
	// room for annotations above the card, without moving from the page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the stage's size changes with `reach`
	useLayoutEffect(() => {
		const st = stage.current;
		if (st && win) {
			setZoom(fitZoom(st, narrow));
		}
	}, [win, narrow, reach]);

	// Each annotation is placed in the card's own pixels: a rectangle on the
	// screen is made relative to the card, and divided by how much the card is
	// scaled there, which undoes whatever transform the card is in at the time.
	useLayoutEffect(() => {
		const el = card.current;
		if (!el) {
			return;
		}

		function measure() {
			if (!el) {
				return;
			}
			const box = el.getBoundingClientRect();
			const scale = box.width / el.offsetWidth;
			const local = (x: number, y: number) => ({
				x: (x - box.left) / scale,
				y: (y - box.top) / scale,
			});

			setShown(
				(explainer.paragraphs ?? []).map(
					(p) => typeof p === "string" || shows(el, p.when),
				),
			);
			setDrawn(
				explainer.notes.flatMap((note) => {
					// The first such part that is drawn: a part can be drawn twice, once
					// for each color mode, as the moon is, and only one is shown.
					const part = [...el.querySelectorAll(note.at)].find(
						(p) => p.getClientRects().length > 0,
					);
					if (!part || !shows(el, note.when)) {
						return [];
					}
					// Words that aren't on this card mean that its part isn't either.
					if (
						note.atText !== undefined &&
						textRect(part, note.atText === true ? undefined : note.atText) ===
							undefined
					) {
						return [];
					}
					// The part in focus: the annotated words, or the part's box, or the
					// share of it that `spot` gives.
					const own =
						(note.atText !== undefined
							? textRect(part, note.atText === true ? undefined : note.atText)
							: undefined) ?? part.getBoundingClientRect();
					const r = (note.with ?? []).reduce((box, w) => {
						const other = el.querySelector(w.at);
						const extra =
							other &&
							textRect(other, w.atText === true ? undefined : w.atText);
						return extra ? union(box, extra) : box;
					}, own);
					const corner = local(r.left, r.top);
					const spot = {
						x: corner.x,
						y: corner.y,
						w: r.width / scale,
						h: r.height / scale,
					};
					// What the arrow points at: the annotated words themselves, such as
					// a figure, even when their label is in focus with them.
					const ownCorner = local(own.left, own.top);
					const target = note.with
						? {
								x: ownCorner.x,
								y: ownCorner.y,
								w: own.width / scale,
								h: own.height / scale,
							}
						: spot;
					const middle = {
						x: target.x + target.w / 2,
						y: target.y + target.h / 2,
					};
					const words =
						note.side === "top"
							? {
									x: note.wordsLeft
										? spot.x - topAside
										: spot.x + spot.w + topAside,
									y: -topGap,
								}
							: {
									x: note.side === "left" ? -gap : el.offsetWidth + gap,
									y: middle.y + (note.dy ?? 0),
								};
					// The arrow aims at the middle of what it points at, and ends where it
					// reaches its edge, or, in a chart, in the shaded area under the
					// line, near its right end. One from below ends under the whole part
					// in focus, so that it doesn't cross a label under a figure.
					const to =
						note.into === "chart"
							? local(...intoChart(part, 0.9))
							: note.approach === "top-left"
								? { x: ownCorner.x - 3, y: ownCorner.y + 8 }
								: note.approach === "above" || note.side === "top"
									? { x: middle.x, y: target.y - arrowGap }
									: note.approach === "below"
										? { x: middle.x, y: spot.y + spot.h + arrowGap }
										: level(towards(words, middle, target, arrowGap), target);
					return [
						{
							note,
							to,
							words,
							spot,
							target,
						},
					];
				}),
			);
		}

		// The card's figures can still be animating in when it opens, so the
		// annotations are placed again whenever its size, its text or an animation
		// in it changes.
		let frame = 0;
		const again = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};
		measure();
		document.fonts?.ready.then(again);
		const resized = new ResizeObserver(again);
		resized.observe(el);
		const changed = new MutationObserver(again);
		changed.observe(el, {
			subtree: true,
			childList: true,
			characterData: true,
		});
		el.addEventListener("animationend", again);
		el.addEventListener("transitionend", again);
		return () => {
			cancelAnimationFrame(frame);
			resized.disconnect();
			changed.disconnect();
			el.removeEventListener("animationend", again);
			el.removeEventListener("transitionend", again);
		};
	}, [explainer]);

	// The page behind the dialog doesn't scroll while it is open. Its scrollbar's
	// room is kept, so that the page doesn't shift sideways.
	useEffect(() => {
		const root = document.documentElement;
		const { overflow, scrollbarGutter } = root.style;
		root.style.scrollbarGutter = "stable";
		root.style.overflow = "hidden";
		return () => {
			root.style.overflow = overflow;
			root.style.scrollbarGutter = scrollbarGutter;
		};
	}, []);

	useEffect(() => {
		close.current?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	// The part of the card in color: the pointed annotation's part, with a little
	// room around it, fading into the gray around it. The color fades in and out
	// in place, so the last part stays where the color was while it fades out.
	const pointed = active === undefined ? undefined : drawn[active]?.spot;
	const lastSpot = useRef(pointed);
	if (pointed) {
		lastSpot.current = pointed;
	}
	const spot = pointed ?? lastSpot.current;
	// Around a few words, the window is tight, so that it doesn't show parts of
	// the words beside them.
	const spotNote =
		pointed === undefined || active === undefined
			? undefined
			: drawn[active]?.note;
	const [pad, feather] =
		spotNote?.atText !== undefined ? [1, 4] : [spotPad, spotFade];
	const fade = (from: number, to: number) =>
		`transparent ${from - pad - feather}px, black ${from - pad}px, black ${
			to + pad
		}px, transparent ${to + pad + feather}px`;
	const mask = spot
		? `linear-gradient(to right, ${fade(spot.x, spot.x + spot.w)}), linear-gradient(to bottom, ${fade(spot.y, spot.y + spot.h)})`
		: "none";

	// While an annotation of some text is pointed at, that text, in the copy in
	// color, is drawn in the color of the most prominent text, so that the figure
	// stands out from the words around it, which are often in muted text.
	const focusedNote = active === undefined ? undefined : drawn[active]?.note;
	useEffect(() => {
		const part =
			focusedNote?.atText === undefined || focusedNote.keepInk
				? undefined
				: colored.current?.querySelector(focusedNote.at);
		if (!part || !focusedNote) {
			CSS.highlights?.delete(focusName);
			return;
		}
		const ranges = [
			...textRanges(
				part,
				focusedNote.atText === true ? undefined : focusedNote.atText,
			),
			...(focusedNote.with ?? []).flatMap((w) => {
				const other = w.keepInk
					? undefined
					: colored.current?.querySelector(w.at);
				return other
					? textRanges(other, w.atText === true ? undefined : w.atText)
					: [];
			}),
		];
		CSS.highlights?.set(focusName, new Highlight(...ranges));
		return () => {
			CSS.highlights?.delete(focusName);
		};
	}, [focusedNote]);

	// Which annotation's part the pointer is over, if any.
	function pointAt(event: React.PointerEvent<HTMLDivElement>) {
		const el = card.current;
		if (!el) {
			return;
		}
		const box = el.getBoundingClientRect();
		const scale = box.width / el.offsetWidth;
		const x = (event.clientX - box.left) / scale;
		const y = (event.clientY - box.top) / scale;
		const hit = drawn.findIndex(
			({ spot: s }) =>
				x >= s.x - spotPad &&
				x <= s.x + s.w + spotPad &&
				y >= s.y - spotPad &&
				y <= s.y + s.h + spotPad,
		);
		setActive(hit < 0 ? undefined : hit);
	}

	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`The ${explainer.label}, explained`}
			className={cn(
				"fixed inset-0 z-50 overflow-y-auto bg-page/90 backdrop-blur-sm transition-opacity duration-200",
				start ? "opacity-0" : "opacity-100",
			)}
		>
			{/* Pressing outside the card closes the dialog, unless the press was the
			end of selecting text, which may have started on the dialog's words. */}
			<button
				type="button"
				tabIndex={-1}
				aria-hidden="true"
				className="fixed inset-0 cursor-default"
				onClick={() => {
					if (!window.getSelection()?.toString()) {
						onClose();
					}
				}}
			/>
			<button
				ref={close}
				type="button"
				aria-label="Close"
				className="fixed top-4 right-4 z-10 flex size-8 cursor-pointer items-center justify-center rounded-control bg-page/80 text-muted hover:bg-sunk hover:text-fg"
				onClick={onClose}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					className="size-5"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					{/* Lucide's x. */}
					<path d="M18 6 6 18" />
					<path d="m6 6 12 12" />
				</svg>
			</button>
			<style>{`::highlight(${focusName}) { color: var(--color-fg); }`}</style>
			<Before items={explainer.before} />
			{/* The stage is in the middle of the window, and the window scrolls when
			the stage is taller than it. */}
			<div className="pointer-events-none relative flex min-h-full items-center justify-center py-6">
				<div
					ref={stage}
					className="pointer-events-none relative flex-none"
					style={{
						padding: `${room.y}px ${narrow ? edge : room.x}px`,
						transform: start ?? `scale(${zoom})`,
						transition: start
							? "none"
							: `transform ${zoomTime}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
					}}
				>
					<div
						className="relative"
						style={{
							width: cardWidth,
							marginTop: narrow ? 0 : reach.above,
							marginLeft: inset,
						}}
					>
						{/* The card is isolated, so that the layers inside it stay under the veil. */}
						<div ref={card} inert className="isolate">
							{moon ? (
								<MoonHolder>{explainer.card}</MoonHolder>
							) : (
								explainer.card
							)}
						</div>
						{/* While a part is pointed at, the rest of the card fades back, as
					the other annotations do: a veil in the color of a card's ground
					lies over it, so that the card's ground stays as it is. */}
						<div
							aria-hidden="true"
							className={cn(
								"pointer-events-none absolute inset-0 rounded-card bg-panel transition-opacity duration-200 ease-out",
								pointed ? "opacity-70" : "opacity-0",
							)}
						/>
						{/* The same card, shown only around one part, over the veil. */}
						<div
							ref={colored}
							inert
							aria-hidden="true"
							className={cn(
								"absolute inset-0 transition-opacity duration-200 ease-out",
								pointed ? "opacity-100" : "opacity-0",
							)}
							style={{
								maskImage: mask,
								maskComposite: "intersect",
								WebkitMaskImage: mask,
								WebkitMaskComposite: "source-in",
							}}
						>
							{moon ? (
								<MoonHolder>{explainer.card}</MoonHolder>
							) : (
								explainer.card
							)}
						</div>
						<div
							className="pointer-events-auto absolute inset-0"
							onPointerMove={pointAt}
							onPointerLeave={() => setActive(undefined)}
						/>
						<div
							className={cn(
								"absolute inset-0 transition-opacity duration-300",
								settled ? "opacity-100" : "opacity-0",
							)}
						>
							<Annotations
								drawn={drawn}
								active={active}
								onActive={setActive}
								onReach={setReach}
								narrow={narrow}
							/>
						</div>
					</div>
					<p
						ref={caption}
						className="mt-1.5 text-right text-[10px] tracking-[0.08em] text-faint uppercase"
						style={{ width: cardWidth, marginLeft: inset }}
					>
						Example data only
					</p>
					{narrow && (
						<Legend
							drawn={drawn}
							active={active}
							onActive={setActive}
							width={cardWidth}
						/>
					)}
					{/* The text under the card starts with what the card is about, and is
					in plain type, apart from the hand-lettered annotations around the
					card. */}
					<div
						className="pointer-events-auto flex flex-col gap-2 text-[13px] leading-5 text-muted"
						style={{
							width: textWidth,
							// The text starts below the words of any annotation under the
							// card, with the clearance between them, counting the caption
							// and its 6px margin as room that the words already have.
							marginTop: Math.max(
								16,
								narrow
									? 0
									: reach.below +
											clearance -
											(caption.current?.offsetHeight ?? 0) -
											6,
							),
						}}
					>
						<h2 className="text-sm text-fg-soft">{explainer.title}</h2>
						{explainer.paragraphs?.map((paragraph, i) =>
							shown[i] === false ? null : typeof paragraph === "string" ? (
								<p key={paragraph}>{paragraph}</p>
							) : !("key" in paragraph) ? (
								<p key={paragraph.text}>{paragraph.text}</p>
							) : (
								<p
									key={paragraph.key}
									className="flex gap-2.5 rounded-control bg-sunk px-3 py-2.5"
								>
									<Icon name="engine" className="mt-0.5 size-4 flex-none" />
									<span className="flex flex-col gap-2">
										<span>{paragraph.text}</span>
										{paragraph.more && <span>{paragraph.more}</span>}
									</span>
								</p>
							),
						)}
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}

/**
 * Before lists what the hovercards that explained a card said, so that a reviewer
 * can check that the explainer keeps it. It is only for the mockup.
 */
function Before({ items }: { items: string[] }) {
	return (
		<details className="absolute bottom-4 left-4 z-10 max-w-md rounded-control border border-line bg-panel p-3 text-xs text-muted">
			<summary className="cursor-pointer text-fg-soft">
				What the hovercards said
			</summary>
			<ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</details>
	);
}

/** union returns the smallest rectangle that holds both rectangles. */
function union(a: DOMRect, b: DOMRect): DOMRect {
	const left = Math.min(a.left, b.left);
	const top = Math.min(a.top, b.top);
	return new DOMRect(
		left,
		top,
		Math.max(a.right, b.right) - left,
		Math.max(a.bottom, b.bottom) - top,
	);
}

/**
 * towards returns where a line from a point outside a rectangle to a point
 * inside it first comes within `margin` of the rectangle.
 */
function towards(
	from: { x: number; y: number },
	to: { x: number; y: number },
	rect: { x: number; y: number; w: number; h: number },
	margin: number,
): { x: number; y: number } {
	const left = rect.x - margin;
	const right = rect.x + rect.w + margin;
	const top = rect.y - margin;
	const bottom = rect.y + rect.h + margin;
	const along = (start: number, end: number, low: number, high: number) =>
		start < low
			? (low - start) / (end - start)
			: start > high
				? (high - start) / (end - start)
				: 0;
	const t = Math.max(
		along(from.x, to.x, left, right),
		along(from.y, to.y, top, bottom),
	);
	return {
		x: from.x + (to.x - from.x) * t,
		y: from.y + (to.y - from.y) * t,
	};
}

/**
 * level returns where an arrow from the side ends, moved up or down, if it has
 * to be, to be level with the middle half of the part, so that its head points
 * into the part and not along its top or bottom edge, which it could for a part
 * as thin as a bar.
 */
function level(
	to: { x: number; y: number },
	part: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
	return {
		x: to.x,
		y: Math.min(Math.max(to.y, part.y + part.h / 4), part.y + (part.h * 3) / 4),
	};
}

/**
 * intoChart returns a point on the screen in the shaded area under a chart's
 * line, at a share of the chart's width: halfway between the line and the bottom
 * of the chart there. The line is the chart's path that has a stroke.
 */
function intoChart(chart: Element, share: number): [number, number] {
	const box = chart.getBoundingClientRect();
	const x = box.left + box.width * share;
	// A chart drawn on a canvas has no path to walk, so its line is the highest
	// pixel that is drawn in the column at x.
	if (chart instanceof HTMLCanvasElement) {
		const pixels = chart
			.getContext("2d")
			?.getImageData(Math.floor(chart.width * share), 0, 1, chart.height).data;
		let row = chart.height;
		for (let y = 0; pixels && y < chart.height; y++) {
			if ((pixels[y * 4 + 3] ?? 0) > 0) {
				row = y;
				break;
			}
		}
		const lineY = box.top + (row / chart.height) * box.height;
		return [x, (lineY + box.bottom) / 2];
	}
	const line = [...chart.querySelectorAll("path")].find(
		(path) => getComputedStyle(path).stroke !== "none",
	);
	const matrix = line?.getScreenCTM();
	if (!line || !matrix) {
		return [x, box.bottom - box.height / 4];
	}
	// The point of the line nearest to x, found by walking along it.
	let lineY = box.bottom;
	let nearest = Number.POSITIVE_INFINITY;
	const length = line.getTotalLength();
	for (let at = 0; at <= length; at += 2) {
		const p = new DOMPoint(
			line.getPointAtLength(at).x,
			line.getPointAtLength(at).y,
		).matrixTransform(matrix);
		if (Math.abs(p.x - x) < nearest) {
			nearest = Math.abs(p.x - x);
			lineY = p.y;
		}
	}
	return [x, (lineY + box.bottom) / 2];
}

/**
 * textRect returns the rectangle on the screen of the text within an element
 * that a reader can see, or of the first place where the given words are in it,
 * or of only the first `take` characters of those words,
 * even if they are split across elements, as a number that is animated can be.
 * Text that is only for screen readers is left out, because its box is not where
 * it seems.
 */
function textRect(
	scope: Element,
	words?: string,
	take?: number,
): DOMRect | undefined {
	let box:
		| { left: number; top: number; right: number; bottom: number }
		| undefined;
	for (const range of textRanges(scope, words, take)) {
		for (const r of range.getClientRects()) {
			if (r.width === 0 || r.height === 0) {
				continue;
			}
			box = {
				left: Math.min(box?.left ?? r.left, r.left),
				top: Math.min(box?.top ?? r.top, r.top),
				right: Math.max(box?.right ?? r.right, r.right),
				bottom: Math.max(box?.bottom ?? r.bottom, r.bottom),
			};
		}
	}
	return (
		box &&
		new DOMRect(box.left, box.top, box.right - box.left, box.bottom - box.top)
	);
}

/**
 * textRanges returns the ranges of the text that [textRect] measures, one for
 * each text node that it is in.
 */
function textRanges(scope: Element, words?: string, take?: number): Range[] {
	const nodes: { node: Text; start: number }[] = [];
	let text = "";
	const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.parentElement?.closest(".sr-only")) {
			continue;
		}
		nodes.push({ node: node as Text, start: text.length });
		text += node.textContent ?? "";
	}

	const from = words === undefined ? 0 : text.indexOf(words);
	if (from < 0) {
		return [];
	}
	const to = words === undefined ? text.length : from + (take ?? words.length);

	return nodes.flatMap(({ node, start }) => {
		const end = start + (node.textContent?.length ?? 0);
		if (end <= from || start >= to) {
			return [];
		}
		const range = document.createRange();
		range.setStart(node, Math.max(from - start, 0));
		range.setEnd(node, Math.min(to, end) - start);
		return [range];
	});
}

/** How far the annotations reach above the card and below it, in its own pixels. */
interface Reach {
	above: number;
	below: number;
}

/** An annotation, placed in the card's own pixels. */
interface Drawn {
	note: Note;

	/** Where the arrow ends. */
	to: { x: number; y: number };

	/**
	 * Where the words are: beside the card, their edge nearest the card and their
	 * middle; above it, their edge nearer the part, and their foot.
	 */
	words: { x: number; y: number };

	/** What is shown in color while the annotation is pointed at. */
	spot: { x: number; y: number; w: number; h: number };

	/** What the arrow points at, which is inside `spot`. */
	target: { x: number; y: number; w: number; h: number };
}

/**
 * Annotations draws the words of each annotation and its hand-drawn arrow, which
 * curves from the words to the part of the card that they are about. The
 * annotation that is `active` is darker, and the others lighter.
 */
function Annotations({
	drawn,
	active,
	onActive,
	onReach,
	narrow,
}: {
	drawn: Drawn[];
	active: number | undefined;
	onActive: (index: number | undefined) => void;

	/** Called with how far the annotations reach above the card and below it. */
	onReach: (reach: Reach) => void;

	/** True to draw each annotation as a numbered marker, with no words. */
	narrow: boolean;
}) {
	if (narrow) {
		return <Markers drawn={drawn} active={active} onActive={onActive} />;
	}
	return (
		<Arrows
			drawn={drawn}
			active={active}
			onActive={onActive}
			onReach={onReach}
		/>
	);
}

/**
 * markerAt returns where an annotation's numbered marker is: just before the part
 * in focus, at its middle, or above the start of words that don't start at the
 * card's margin, or, in a chart, where its arrow would end.
 */
function markerAt({ note, to, spot }: Drawn): { x: number; y: number } {
	if (note.into === "chart") {
		return to;
	}
	// Before the part, in the card's margin, if the part starts at the margin;
	// otherwise above the start of the words, so that it covers none of the words
	// before them on their line.
	return note.atText !== undefined && spot.x > marginEnd
		? { x: spot.x + 6, y: spot.y - 9 }
		: { x: spot.x - 11, y: spot.y + spot.h / 2 };
}

/**
 * How far into a card its margin goes, in its own pixels: a part that starts
 * nearer the edge than this starts at the margin.
 */
const marginEnd = 40;

/**
 * numbering returns the number of each annotation, from 1, in the order in
 * which their markers are read: from the top of the card down, and from the
 * left across.
 */
function numbering(drawn: Drawn[]): number[] {
	const order = drawn
		.map((d, i) => ({ i, at: markerAt(d) }))
		.sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
	const numbers: number[] = [];
	order.forEach(({ i }, n) => {
		numbers[i] = n + 1;
	});
	return numbers;
}

/** Badge is the round number of an annotation, on its marker and in its list. */
function Badge({
	n,
	active,
	small = false,
}: {
	n: number;
	active: boolean;

	/** True for the smaller badge of a marker on the card. */
	small?: boolean;
}) {
	return (
		<span
			className={cn(
				"flex flex-none items-center justify-center rounded-full font-semibold tabular-nums ring-2 ring-panel transition-colors duration-150",
				small ? "size-4 text-[10px]" : "size-5 text-[11px]",
				active ? "bg-fg text-page" : "bg-fg-soft text-page",
			)}
		>
			{n}
		</span>
	);
}

/**
 * Markers draws each annotation as a numbered marker on the part of the card
 * that it is about, for a window too narrow for its words beside the card.
 * Pointing at a marker, or pressing it, focuses its part.
 */
function Markers({
	drawn,
	active,
	onActive,
}: {
	drawn: Drawn[];
	active: number | undefined;
	onActive: (index: number | undefined) => void;
}) {
	const numbers = numbering(drawn);
	return (
		<>
			{drawn.map((d, i) => {
				const at = markerAt(d);
				return (
					<button
						type="button"
						key={d.note.at + d.note.text}
						aria-label={`${numbers[i]}: ${d.note.text}`}
						className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
						style={{ left: at.x, top: at.y }}
						onPointerEnter={() => onActive(i)}
						onPointerLeave={() => onActive(undefined)}
						onClick={() => onActive(active === i ? undefined : i)}
					>
						<Badge n={numbers[i] ?? 0} active={active === i} small />
					</button>
				);
			})}
		</>
	);
}

/**
 * Legend lists the words of each annotation under the card, by the numbers of
 * their markers, for a window too narrow for the words beside the card.
 * Pointing at an item, or pressing it, focuses its part.
 */
function Legend({
	drawn,
	active,
	onActive,
	width,
}: {
	drawn: Drawn[];
	active: number | undefined;
	onActive: (index: number | undefined) => void;
	width: number;
}) {
	const numbers = numbering(drawn);
	const items = drawn
		.map((d, i) => ({ d, i, n: numbers[i] ?? 0 }))
		.sort((a, b) => a.n - b.n);
	return (
		<ol
			className="pointer-events-auto mt-3 flex flex-col gap-1.5"
			style={{ width }}
		>
			{items.map(({ d, i, n }) => (
				<li key={d.note.at + d.note.text}>
					<button
						type="button"
						className={cn(
							"flex w-full cursor-pointer items-start gap-2.5 text-left text-[16px] leading-[18px] transition-colors duration-150 [font-family:var(--font-hand)] tracking-[-0.03em]",
							active === undefined
								? "text-fg-soft"
								: active === i
									? "text-fg"
									: "text-faint",
						)}
						onPointerEnter={() => onActive(i)}
						onPointerLeave={() => onActive(undefined)}
						onClick={() => onActive(active === i ? undefined : i)}
					>
						<Badge n={n} active={active === i} />
						<span className="pt-px">
							<Highlighted on={active === i}>{d.note.text}</Highlighted>
						</span>
					</button>
				</li>
			))}
		</ol>
	);
}

/**
 * highlighterStroke returns a background of one stroke of a highlighter pen, in
 * the color `rgb` at the opacity `alpha`: a band behind a line, from `top`, a
 * share of the line's height out of 20, to its foot, with wavering edges and
 * ragged ends, stretched to the line's length.
 */
function highlighterStroke(rgb: string, alpha: number, top: number): string {
	const t = top;
	const ink = (a: number) => `rgba(${rgb}, ${Math.min(1, a).toFixed(2)})`;
	// The ink pools where the pen starts and stops, so the ends are a little
	// stronger than the middle.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" preserveAspectRatio="none"><defs><linearGradient id="g"><stop offset="0" stop-color="${ink(alpha + 0.18)}"/><stop offset="0.05" stop-color="${ink(alpha)}"/><stop offset="0.95" stop-color="${ink(alpha)}"/><stop offset="1" stop-color="${ink(alpha + 0.18)}"/></linearGradient></defs><path fill="url(#g)" d="M1.5 ${t + 0.8}C14 ${t - 0.4} 31 ${t + 0.9} 47 ${t + 0.1}S82 ${t - 0.6} 98.2 ${t + 0.4}L99.6 ${t + 3.5} 98.8 13 99.4 18.2C83 19.4 64 18.1 48 18.9S17 18.3 1.2 19.2L0.4 15.6 1.1 11.4 0.3 ${t + 2.9}Z"/></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Highlighted marks the words of the annotation in focus as if with a
 * highlighter pen: a stroke of fluorescent yellow behind the lower part of each
 * line, which is drawn from left to right when the annotation comes into focus.
 * On the light ground the stroke multiplies with the words, as ink does on
 * paper. On the dark ground it is fainter, so that it still reads as ink that
 * the words show through.
 */
function Highlighted({ on, children }: { on: boolean; children: ReactNode }) {
	return (
		<span
			className={cn(
				"-mx-1 bg-no-repeat px-1 [box-decoration-break:clone] [background-image:var(--stroke-light)] mix-blend-multiply transition-[background-size,color] duration-300 ease-out motion-reduce:transition-none dark:[background-image:var(--stroke-dark)] dark:mix-blend-screen",
			)}
			style={
				{
					"--stroke-light": highlighterStroke("255, 230, 0", 0.58, 6),
					"--stroke-dark": highlighterStroke("170, 255, 60", 0.4, 4),
					backgroundSize: on ? "100% 100%" : "0% 100%",
					WebkitBoxDecorationBreak: "clone",
				} as React.CSSProperties
			}
		>
			{children}
		</span>
	);
}

/**
 * Arrows draws the words of each annotation beside the card, with a hand-drawn
 * arrow to the part that they are about.
 */
function Arrows({
	drawn,
	active,
	onActive,
	onReach,
}: {
	drawn: Drawn[];
	active: number | undefined;
	onActive: (index: number | undefined) => void;
	onReach: (reach: Reach) => void;
}) {
	const id = useId();
	const ink = (i: number) =>
		active === undefined
			? "text-fg-soft"
			: active === i
				? "text-fg"
				: "text-faint";

	// The words of the annotations are kept apart by at least the clearance:
	// going down each side, each is moved down until it clears the one above it,
	// and any words above the card that reach over it. The words are measured as
	// drawn, tilted, so that the clearance holds at their ends too. Their sizes
	// are only known once they are drawn, so they are drawn where they are asked
	// to be first, and moved before the first paint.
	const labels = useRef<(HTMLSpanElement | null)[]>([]);
	const [ys, setYs] = useState<number[]>();
	useLayoutEffect(() => {
		const next = drawn.map(({ words }) => words.y);
		// The box that each annotation's words fill, tilted, in the card's own
		// pixels.
		const boxes = drawn.map((_, i) => {
			const el = labels.current[i];
			const parent = el?.offsetParent;
			if (!el || !(parent instanceof HTMLElement)) {
				return { left: 0, right: 0, top: 0, bottom: 0 };
			}
			const p = parent.getBoundingClientRect();
			const scale = p.width / parent.offsetWidth;
			const r = el.getBoundingClientRect();
			return {
				left: (r.left - p.left) / scale,
				right: (r.right - p.left) / scale,
				top: (r.top - p.top) / scale,
				bottom: (r.bottom - p.top) / scale,
			};
		});
		// The words above the card, which stay where they are.
		const above = boxes.filter((_, i) => drawn[i]?.note.side === "top");
		for (const side of ["left", "right"] as const) {
			const order = drawn
				.map((d, i) => ({ i, side: d.note.side }))
				.filter((d) => d.side === side)
				.map((d) => d.i)
				.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
			let bottom = Number.NEGATIVE_INFINITY;
			for (const i of order) {
				const box = boxes[i] ?? { left: 0, right: 0, top: 0, bottom: 0 };
				const half = (box.bottom - box.top) / 2;
				const over = above
					.filter(
						(a) =>
							a.left < box.right + clearance && a.right > box.left - clearance,
					)
					.map((a) => a.bottom);
				const y = Math.max(
					next[i] ?? 0,
					bottom + clearance + half,
					...over.map((foot) => foot + clearance + half),
				);
				next[i] = y;
				bottom = y + half;
			}
		}
		setYs(next);
		// How far the words reach above the card, and below it.
		const height =
			(labels.current.find((l) => l)?.offsetParent as HTMLElement | null)
				?.offsetHeight ?? 0;
		onReach({
			above: Math.max(
				0,
				...drawn.map((d, i) =>
					d.note.side === "top"
						? topGap + (labels.current[i]?.offsetHeight ?? 0)
						: 0,
				),
			),
			below: Math.max(
				0,
				...drawn.map((d, i) => {
					const box = boxes[i];
					if (d.note.side === "top" || !box) {
						return 0;
					}
					return (next[i] ?? 0) + (box.bottom - box.top) / 2 - height;
				}),
			),
		});
	}, [drawn, onReach]);
	const yOf = (i: number, words: { y: number }) => ys?.[i] ?? words.y;

	return (
		<>
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 size-full overflow-visible"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<defs>
					<filter id={id} x="-20%" y="-20%" width="140%" height="140%">
						<feTurbulence
							type="fractalNoise"
							baseFrequency="0.07"
							numOctaves="2"
							seed="4"
							result="noise"
						/>
						<feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" />
					</filter>
				</defs>
				{drawn.map(({ note, to, words, target }, i) => {
					const label = labels.current[i];
					// The arrow leaves the edge of the words nearer its part, halfway
					// between their lines, and heads away from the words at first, so
					// that it is plainly drawn from them. The words are tilted about
					// their middle, which lifts their edge nearest the card, so the
					// arrow leaves from the middle of that edge and not from the middle
					// of the box. Words above the card are tilted the same way as those
					// on the left, which lowers their left edge and lifts their right.
					const lift = ((label?.offsetWidth ?? 0) / 2) * tilt;
					const from =
						note.side === "top"
							? {
									x: words.x + (note.wordsLeft ? 4 : -4),
									y:
										words.y -
										(label?.offsetHeight ?? 0) / 2 +
										(note.wordsLeft ? -lift : lift),
								}
							: {
									x: words.x + (note.side === "left" ? 4 : -4),
									y: yOf(i, words) - lift,
								};
					// The arrow bows away from the straight line, as a hand would draw it:
					// under it when it comes up from below, or into a chart's shaded area,
					// so that it comes from the area's side of the line; otherwise over it.
					const under =
						note.bow !== undefined
							? note.bow === "under"
							: note.into === "chart" || (!note.approach && from.y > to.y + 4);
					// An arrow that comes from above or below leaves its words level and
					// turns to arrive straight down or up, so that it points at the part
					// rather than past it. One to a corner arrives from above and to the
					// side of it.
					// A short arrow bows less, so that it leaves its words and arrives
					// at its part no more steeply than the steepest exit, and points
					// along the part, such as a bar, rather than down onto its end.
					const bow = Math.min(
						12,
						(Math.tan(steepestExit) * Math.abs(to.x - from.x)) / 2,
					);
					const c =
						note.approach === "above" ||
						note.approach === "below" ||
						note.side === "top"
							? { x: to.x, y: from.y }
							: note.approach === "top-left"
								? { x: to.x - 10, y: Math.min(from.y, to.y) - 4 }
								: {
										x: (from.x + to.x) / 2,
										y: under
											? Math.max(from.y, to.y) + bow
											: Math.min(from.y, to.y) - bow,
									};
					// The arrow's end is a straight line, along the way that it arrives,
					// so that it arrives between the two strokes of the head however
					// sharply the curve turns before it. The curve meets the straight
					// end smoothly: it is the same curve as the one through `c`, drawn as
					// a cubic whose second control point is on the straight end's line.
					// The head points along the way that the curve arrives, which
					// meets the part, except for an arrow from the side, whose head
					// points at the middle of the part, so that a line drawn on from
					// the head always meets the part, however the curve bows.
					const aim =
						note.approach === undefined &&
						note.into === undefined &&
						note.side !== "top"
							? { x: target.x + target.w / 2, y: target.y + target.h / 2 }
							: { x: to.x + (to.x - c.x), y: to.y + (to.y - c.y) };
					const angle = Math.atan2(aim.y - to.y, aim.x - to.x);
					const dir = { x: Math.cos(angle), y: Math.sin(angle) };
					const end = {
						x: to.x - dir.x * arrival,
						y: to.y - dir.y * arrival,
					};
					const reach = Math.max(
						(2 / 3) * Math.hypot(c.x - end.x, c.y - end.y),
						arrival,
					);
					// The curve leaves the words no more steeply than the steepest exit:
					// its first control point is turned towards the line straight away
					// from the words, as far as it needs to be.
					const away = note.side === "left" || note.wordsLeft ? 1 : -1;
					const lead = {
						x: (2 / 3) * (c.x - from.x),
						y: (2 / 3) * (c.y - from.y),
					};
					const leadLength = Math.hypot(lead.x, lead.y);
					const exit = Math.min(
						Math.atan2(Math.abs(lead.y), lead.x * away),
						steepestExit,
					);
					const c1 = {
						x: from.x + away * leadLength * Math.cos(exit),
						y: from.y + Math.sign(lead.y) * leadLength * Math.sin(exit),
					};
					const c2 = { x: end.x - dir.x * reach, y: end.y - dir.y * reach };
					const head = (turn: number) => ({
						x: to.x - 6 * Math.cos(angle + turn),
						y: to.y - 6 * Math.sin(angle + turn),
					});
					const a = head(0.5);
					const b = head(-0.45);
					return (
						<g
							key={note.at + note.text}
							className={cn("transition-colors duration-150", ink(i))}
							style={{ filter: `url(#${id})` }}
						>
							<path
								d={`M${from.x} ${from.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}L${to.x} ${to.y}`}
							/>
							<path d={`M${a.x} ${a.y}L${to.x} ${to.y}L${b.x} ${b.y}`} />
						</g>
					);
				})}
			</svg>
			{drawn.map(({ note, words }, i) => (
				<span
					key={note.at + note.text}
					ref={(el) => {
						labels.current[i] = el;
					}}
					className={cn(
						"pointer-events-auto absolute text-[15px] leading-[16px] transition-colors duration-150 [font-family:var(--font-hand)] tracking-[-0.03em]",
						ink(i),
						note.side === "left"
							? "w-44 -translate-x-full -translate-y-1/2 -rotate-3 text-right"
							: note.side === "top"
								? note.wordsLeft
									? "w-64 -translate-x-full -translate-y-full -rotate-3 text-right"
									: "w-64 -translate-y-full -rotate-3 text-left"
								: "w-44 -translate-y-1/2 rotate-3 text-left",
					)}
					style={{ left: words.x, top: yOf(i, words) }}
					onPointerEnter={() => onActive(i)}
					onPointerLeave={() => onActive(undefined)}
				>
					<Highlighted on={active === i}>{note.text}</Highlighted>
				</span>
			))}
		</>
	);
}

/**
 * Explained is a card with the "?" that opens its explainer, as the views draw
 * it: at the card's bottom right, while the card is pointed at or has focus, as a
 * filled circle in the color of the card's chart.
 */
export function Explained({ spec }: { spec: ExplainerSpec }) {
	const [open, setOpen] = useState<{ from: DOMRect; moon: boolean }>();
	return (
		<>
			<Explainable
				label={spec.label}
				icon={spec.icon}
				placement="bottom-right"
				shown="hover"
				look={{ ink: "chart", size: "large", inverse: true }}
				onExplain={(from, moon) => setOpen({ from, moon })}
			>
				<div style={{ width: spec.width }}>{spec.card}</div>
			</Explainable>
			{open && (
				<Explainer
					explainer={spec}
					from={open.from}
					moon={open.moon}
					onClose={() => setOpen(undefined)}
				/>
			)}
		</>
	);
}
