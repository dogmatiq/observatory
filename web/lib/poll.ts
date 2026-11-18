import { useEffect, useState } from "react";
import { NotFound } from "./api.ts";
import { browserClock, type Clock } from "./live.tsx";

/**
 * What a page that polls knows about what it is showing.
 */
export type Polled<T> =
	/** Nothing has been read yet. */
	| { status: "loading" }
	/** The latest read succeeded. `at` is when it arrived, on the clock's scale. */
	| { status: "ready"; data: T; at: number }
	/** The latest read failed, and `data` is from an earlier one. */
	| { status: "stale"; data: T; at: number }
	/** The first read failed, so there is nothing to show. */
	| { status: "failed" }
	/** The Observatory doesn't know what the page asks for. */
	| { status: "unknown" };

/** How long to wait after a read ends before the next begins. */
export const pollInterval = 1000;

/**
 * usePolled reads something again and again, with `read`, and returns the
 * latest of what it read. The next read begins {@link pollInterval} after the
 * previous one ended, so reads never overlap.
 *
 * Nothing is read while the page is hidden, and a read begins at once when it
 * is shown again. If a read fails, the data from the last successful one is
 * kept, as stale, until a read succeeds. A read that fails with {@link NotFound}
 * is not retried, because what it asked for is gone or never was.
 *
 * `read` must not change unless what it reads does.
 */
export function usePolled<T>(
	read: (signal: AbortSignal) => Promise<T>,
	clock: Clock = browserClock,
): Polled<T> {
	const [state, setState] = useState<Polled<T>>({ status: "loading" });

	useEffect(() => {
		setState({ status: "loading" });

		const controller = new AbortController();
		let timer: number | undefined;
		let reading = false;
		let stopped = false;

		const schedule = () => {
			if (!stopped && !document.hidden) {
				timer = window.setTimeout(poll, pollInterval);
			}
		};

		const poll = async () => {
			window.clearTimeout(timer);
			if (reading || stopped) {
				return;
			}

			reading = true;
			try {
				const data = await read(controller.signal);
				if (!controller.signal.aborted) {
					setState({ status: "ready", data, at: clock.now() });
				}
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}

				if (error instanceof NotFound) {
					stopped = true;
					setState({ status: "unknown" });
					return;
				}

				setState((previous) =>
					previous.status === "ready" || previous.status === "stale"
						? { ...previous, status: "stale" }
						: { status: "failed" },
				);
			} finally {
				reading = false;
			}

			schedule();
		};

		const visibility = () => {
			if (document.hidden) {
				window.clearTimeout(timer);
			} else {
				void poll();
			}
		};

		document.addEventListener("visibilitychange", visibility);

		// The first read begins after the current task, so that a page that React
		// starts, stops and starts again in development reads once.
		timer = window.setTimeout(poll, 0);

		return () => {
			stopped = true;
			controller.abort();
			window.clearTimeout(timer);
			document.removeEventListener("visibilitychange", visibility);
		};
	}, [read, clock]);

	return state;
}
