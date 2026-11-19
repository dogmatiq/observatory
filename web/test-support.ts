import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";

/**
 * stubBrowser replaces the parts of a browser that the page uses and that jsdom
 * does not have: observing an element's size, matching a media query, and
 * drawing on a canvas. Call it in a `beforeEach`, and
 * `vi.unstubAllGlobals()` and `vi.restoreAllMocks()` in an `afterEach`.
 */
export function stubBrowser() {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);

	vi.stubGlobal(
		"matchMedia",
		(query: string): MediaQueryList =>
			({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
			}) as unknown as MediaQueryList,
	);

	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
}

/**
 * tipOf points at an element, waits for its popover to appear, and returns the
 * text of the popover, after moving the pointer away again.
 */
export async function tipOf(element: Element): Promise<string | null> {
	fireEvent.pointerEnter(element);
	const tip = await screen.findByRole("tooltip");
	const text = tip.textContent;
	fireEvent.pointerLeave(element);
	return text;
}

/** An EventSource that a test drives. */
export class FakeEventSource {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;

	/** Every one that was made since {@link stubEventSource}. */
	static opened: FakeEventSource[] = [];

	/** The ones that the code under test has not closed. */
	static get live(): FakeEventSource[] {
		return FakeEventSource.opened.filter((s) => !s.closed);
	}

	readyState: number = FakeEventSource.CONNECTING;
	closed = false;
	private listeners = new Map<string, ((e: Event) => void)[]>();

	constructor(readonly url: string) {
		FakeEventSource.opened.push(this);
	}

	addEventListener(type: string, listener: (e: Event) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	close() {
		this.closed = true;
		this.readyState = FakeEventSource.CLOSED;
	}

	/** Connects, which is what the browser does before each burst. */
	open() {
		this.readyState = FakeEventSource.OPEN;
		this.emit("open", new Event("open"));
	}

	/** Delivers a message of the stream. */
	send(name: string, data: unknown = {}) {
		this.readyState = FakeEventSource.OPEN;
		this.emit(
			name,
			new MessageEvent(name, {
				data: typeof data === "string" ? data : JSON.stringify(data),
			}),
		);
	}

	/** Breaks the connection. The browser tries again unless `forGood`. */
	fail(forGood = false) {
		this.readyState = forGood
			? FakeEventSource.CLOSED
			: FakeEventSource.CONNECTING;
		this.emit("error", new Event("error"));
	}

	private emit(type: string, event: Event) {
		for (const l of this.listeners.get(type) ?? []) {
			l(event);
		}
	}
}

/**
 * stubEventSource replaces the browser's EventSource, which jsdom does not
 * have, with {@link FakeEventSource}. Call it in a `beforeEach`, and
 * `vi.unstubAllGlobals()` in an `afterEach`.
 */
export function stubEventSource() {
	FakeEventSource.opened = [];
	vi.stubGlobal("EventSource", FakeEventSource);
}
