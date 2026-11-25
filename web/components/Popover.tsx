import {
	cloneElement,
	type FocusEvent,
	type PointerEvent,
	type ReactElement,
	type ReactNode,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.ts";

/**
 * How long a pointer rests on an element before its popover appears, in
 * milliseconds, so that a popover doesn't flash up as the pointer crosses the
 * page.
 */
const showDelay = 300;

/**
 * How soon after one popover has gone another appears without waiting, in
 * milliseconds, so that moving along a bar shows each segment's at once.
 */
const followDelay = 500;

/**
 * How long a popover stays after the pointer leaves its element, in milliseconds,
 * so that the pointer can cross to it.
 */
const leaveDelay = 200;

/** When a popover last went, in milliseconds since the epoch. */
let lastHidden = Number.NEGATIVE_INFINITY;

/** The function that closes the popover that is open now, if one is. */
let closeOpen: (() => void) | undefined;

/**
 * What a panel of a popover looks like, without its place, for a page that shows
 * a panel where it stands.
 */
export const panelClasses =
	"rounded-control border border-line-strong bg-panel text-xs text-fg";

/** The room that a popover leaves between itself and the edges of the window. */
const margin = 8;

/** The room that a popover leaves between itself and its element. */
const gap = 8;

/**
 * The props of an element that a popover can be attached to, which are the
 * ones that the popover adds its own handlers to.
 */
interface Trigger {
	onPointerEnter?: (event: PointerEvent<Element>) => void;
	onPointerLeave?: (event: PointerEvent<Element>) => void;
	onPointerDown?: (event: PointerEvent<Element>) => void;
	onFocus?: (event: FocusEvent<Element>) => void;
	onBlur?: (event: FocusEvent<Element>) => void;
	"aria-describedby"?: string;
}

/** Where a popover points to: a position on the page, above and below it. */
interface Anchor {
	x: number;
	top: number;
	bottom: number;
}

/**
 * Popover gives its one child element a small panel of text that appears beside
 * it while it is pointed at or has the keyboard's focus. It appears above the
 * element, or below it if there is no room above, and stays inside the window.
 * Only one popover is open at a time.
 *
 * The panel is for what explains the element or says more than the element does.
 * It goes when the pointer leaves the element, when the element is pressed, when
 * the page scrolls and when Escape is pressed.
 *
 * A finger can't point, so on a screen that is touched a tap on the element shows
 * the panel at once, and a tap on the element again, or anywhere but the panel,
 * hides it.
 *
 * The pointer can cross to the panel, which stays open while the pointer is on
 * it, and goes a moment after the pointer leaves the element or the panel. A
 * popover is `interactive` if its panel holds something to click. It can only be
 * reached by a pointer, because a keyboard can't focus the elements that open it.
 *
 * The panel has room around its content, which is text. If the content is a
 * `card`, which lays itself out and sets its own width, the panel has none.
 *
 * The child may be an SVG element. A popover with no `content` is not there, and
 * leaves its child as it is.
 */
export function Popover({
	content,
	interactive = false,
	card = false,
	shows,
	children,
}: {
	content?: ReactNode;
	interactive?: boolean;
	card?: boolean;

	/**
	 * Says, at the moment that the element is pointed at or focused, whether the
	 * popover appears this time. It appears every time if this is not given.
	 */
	shows?: (element: Element) => boolean;

	children: ReactElement<Trigger>;
}) {
	const id = useId();
	const [anchor, setAnchor] = useState<Anchor>();
	const timer = useRef<number | undefined>(undefined);
	const shown = anchor !== undefined && content !== undefined;

	// The element that a tap showed the panel for, if a tap showed it.
	const tapped = useRef<Element | undefined>(undefined);

	// What closes this popover. It is the same function for as long as the popover
	// lives, so that it can be told from the one of another popover.
	const closer = useRef<() => void>(undefined);
	if (closer.current === undefined) {
		closer.current = () => {
			lastHidden = Date.now();
			if (closeOpen === closer.current) {
				closeOpen = undefined;
			}
			setAnchor(undefined);
		};
	}
	const dismiss = closer.current;

	useEffect(() => () => window.clearTimeout(timer.current), []);

	useEffect(() => {
		if (!shown) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				dismiss();
			}
		};

		// A tap anywhere but the element and the panel hides a panel that a tap
		// showed. The element's own handler sees a tap on the element.
		const onPointerDown = (event: globalThis.PointerEvent) => {
			const target = event.target as Node;
			if (
				event.pointerType !== "touch" ||
				tapped.current?.contains(target) ||
				document.getElementById(id)?.contains(target)
			) {
				return;
			}
			dismiss();
		};

		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		// A scroll in any element, which doesn't bubble, so it is caught on the way
		// down.
		window.addEventListener("scroll", dismiss, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("scroll", dismiss, true);
		};
	}, [shown, dismiss, id]);

	if (content === undefined) {
		return children;
	}

	const props = children.props;

	function open(next: Anchor) {
		if (closeOpen !== undefined && closeOpen !== dismiss) {
			closeOpen();
		}
		closeOpen = dismiss;
		setAnchor(next);
	}

	function show(element: Element, x: number | undefined, wait: boolean) {
		window.clearTimeout(timer.current);
		if (shown) {
			// The pointer is back, from the panel, or while it was about to leave.
			return;
		}
		if (shows !== undefined && !shows(element)) {
			return;
		}

		const rect = element.getBoundingClientRect();
		const next: Anchor = {
			// The panel points at where the pointer is, within the element, which is
			// the middle of it for the keyboard.
			x:
				x === undefined
					? rect.left + rect.width / 2
					: Math.min(Math.max(x, rect.left), rect.right),
			top: rect.top,
			bottom: rect.bottom,
		};

		// A popover appears at once if it is soon after another, or while another is
		// open, which is about to close.
		if (
			!wait ||
			closeOpen !== undefined ||
			Date.now() - lastHidden < followDelay
		) {
			open(next);
			return;
		}
		timer.current = window.setTimeout(() => open(next), showDelay);
	}

	/** Closes the popover, at once or, if it can be pointed at, after a moment. */
	function leave(now: boolean) {
		window.clearTimeout(timer.current);
		if (!shown) {
			return;
		}

		if (!now) {
			timer.current = window.setTimeout(dismiss, leaveDelay);
			return;
		}
		dismiss();
	}

	const trigger = cloneElement(children, {
		onPointerEnter: (event: PointerEvent<Element>) => {
			props.onPointerEnter?.(event);
			if (event.pointerType !== "touch") {
				show(event.currentTarget, event.clientX, true);
			}
		},
		onPointerLeave: (event: PointerEvent<Element>) => {
			props.onPointerLeave?.(event);
			// A finger leaves the element as it lifts, which doesn't hide a panel
			// that a tap showed.
			if (event.pointerType !== "touch") {
				leave(false);
			}
		},
		onPointerDown: (event: PointerEvent<Element>) => {
			props.onPointerDown?.(event);
			if (event.pointerType !== "touch") {
				leave(true);
				return;
			}
			if (shown) {
				tapped.current = undefined;
				leave(true);
				return;
			}
			tapped.current = event.currentTarget;
			show(event.currentTarget, event.clientX, false);
		},
		onFocus: (event: FocusEvent<Element>) => {
			props.onFocus?.(event);
			if (hasFocusRing(event.currentTarget)) {
				show(event.currentTarget, undefined, false);
			}
		},
		onBlur: (event: FocusEvent<Element>) => {
			props.onBlur?.(event);
			leave(true);
		},
		"aria-describedby": shown ? id : props["aria-describedby"],
	});

	return (
		<>
			{trigger}
			{shown &&
				createPortal(
					<Panel
						id={id}
						anchor={anchor}
						interactive={interactive}
						card={card}
						onPointerEnter={() => window.clearTimeout(timer.current)}
						onPointerLeave={(event) => {
							if (event.pointerType !== "touch") {
								leave(false);
							}
						}}
					>
						{content}
					</Panel>,
					document.body,
				)}
		</>
	);
}

/**
 * Tooltip gives text that is cut short to fit its place, such as a long name, a
 * tooltip of the whole text, which is a popover of one line that appears while the
 * text is pointed at, and only while the text is cut short. Its child is the
 * element that cuts the text short.
 */
export function Tooltip({
	text,
	children,
}: {
	text: string;
	children: ReactElement<Trigger>;
}) {
	return (
		<Popover content={text} shows={isCutShort}>
			{children}
		</Popover>
	);
}

/** isCutShort returns whether an element's text is wider than the element. */
function isCutShort(element: Element): boolean {
	return element.scrollWidth > element.clientWidth;
}

/**
 * hasFocusRing returns whether an element has the focus in the way that shows a
 * ring around it, which is by the keyboard, and not by a click.
 */
function hasFocusRing(element: Element): boolean {
	try {
		return element.matches(":focus-visible");
	} catch {
		return true;
	}
}

/**
 * Panel is the box of a popover. It is placed by the window, so that no card
 * that clips what is inside it can cut it off.
 */
function Panel({
	id,
	anchor,
	interactive,
	card,
	onPointerEnter,
	onPointerLeave,
	children,
}: {
	id: string;
	anchor: Anchor;
	interactive: boolean;
	card: boolean;
	onPointerEnter: () => void;
	onPointerLeave: (event: PointerEvent<Element>) => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);

	// The panel is placed after it has its size, and before it is first drawn.
	useLayoutEffect(() => {
		const panel = ref.current;
		if (!panel) {
			return;
		}

		const { width, height } = panel.getBoundingClientRect();
		const left = Math.max(
			margin,
			Math.min(anchor.x - width / 2, window.innerWidth - width - margin),
		);
		const above = anchor.top - gap - height >= margin;

		panel.style.left = `${left}px`;
		panel.style.top = `${above ? anchor.top - gap - height : anchor.bottom + gap}px`;
	});

	return (
		<div
			ref={ref}
			id={id}
			// A tooltip holds nothing to click.
			role={interactive ? "group" : "tooltip"}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			className={cn(
				panelClasses,
				"fixed top-0 left-0 z-50 w-max max-w-xs transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none",
				!card && "px-2.5 py-1.5",
			)}
		>
			{children}
		</div>
	);
}
