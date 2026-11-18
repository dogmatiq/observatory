import { useEffect, useMemo, useReducer } from "react";
import type { ClusterData } from "../model.ts";
import { checkCluster, NotFound, watchPath } from "./api.ts";
import { browserClock, type Clock } from "./live.tsx";
import type { Polled } from "./poll.ts";
import {
	initialWatchState,
	messageNames,
	selectCluster,
	watchReducer,
} from "./stream.ts";

/** How long to wait after a read fails before it is tried again. */
export const retryInterval = 1000;

/**
 * useWatched returns what the cluster view shows for the cluster with the given
 * ID, which the Observatory keeps up to date. The state has the same form as the
 * one that {@link usePolled} returns, and `at` is when the data last changed,
 * on the clock's scale. The times in the data are measured from it.
 *
 * It opens the stream of messages that tell of each change. Each connection
 * begins with a burst of messages that describe the cluster as it is, and ends
 * it with one that says so. The page is shown from the first burst, and the data
 * that it shows doesn't change until the next one ends, so that a connection
 * that is made again after it broke doesn't flash, and doesn't keep what has
 * gone since.
 *
 * While the browser connects again after the stream breaks, the data is kept,
 * as stale, until the next burst ends. If the stream ends for good, which is
 * what a cluster that isn't known does, the Observatory is asked about the
 * cluster to find out why: a cluster that isn't known ends the watch, and any
 * other cluster is watched again. A question that fails is asked again after
 * {@link retryInterval}, and they never overlap.
 *
 * Nothing is asked, and the stream is closed, once the page no longer shows the
 * cluster.
 */
export function useWatched(
	id: string,
	clock: Clock = browserClock,
): Polled<ClusterData> {
	const [state, dispatch] = useReducer(watchReducer, initialWatchState);

	useEffect(() => {
		dispatch({ type: "reset" });

		const controller = new AbortController();
		let source: EventSource | undefined;
		let timer: number | undefined;

		const watch = () => {
			const events = new EventSource(watchPath(id));
			source = events;

			events.addEventListener("open", () => dispatch({ type: "connected" }));

			for (const name of messageNames) {
				events.addEventListener(name, (event) =>
					dispatch({
						type: "message",
						name,
						data: (event as MessageEvent<string>).data,
						now: clock.now(),
					}),
				);
			}

			events.addEventListener("error", () => {
				dispatch({ type: "broken" });

				if (events.readyState === EventSource.CLOSED) {
					events.close();
					void check();
				}
				// Otherwise the browser is connecting again.
			});
		};

		const check = async () => {
			try {
				await checkCluster(id, controller.signal);
				if (!controller.signal.aborted) {
					watch();
				}
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}

				if (error instanceof NotFound) {
					dispatch({ type: "unknown" });
					return;
				}

				dispatch({ type: "broken" });
				timer = window.setTimeout(check, retryInterval);
			}
		};

		// The stream is opened after the current task, so that a page that React
		// starts, stops and starts again in development opens it once.
		timer = window.setTimeout(watch, 0);

		return () => {
			controller.abort();
			window.clearTimeout(timer);
			source?.close();
		};
	}, [id, clock]);

	const data = useMemo(
		() =>
			state.snapshot === undefined
				? undefined
				: selectCluster(state.snapshot, state.at),
		[state.snapshot, state.at],
	);

	if (state.status === "unknown") {
		return { status: "unknown" };
	}

	if (state.status === "failed") {
		return { status: "failed" };
	}

	if (data === undefined) {
		return { status: "loading" };
	}

	return { status: state.status, data, at: state.at };
}
