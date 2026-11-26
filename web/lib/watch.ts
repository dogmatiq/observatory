import { useEffect, useMemo, useReducer } from "react";
import type { ClusterData, SiteData } from "../model.ts";
import {
	checkCluster,
	checkSite,
	NotFound,
	siteWatchPath,
	watchPath,
} from "./api.ts";
import { browserClock, type Clock } from "./live.tsx";
import type { Polled } from "./poll.ts";
import {
	initialWatchState,
	messageNames,
	type Snapshot,
	selectCluster,
	selectSite,
	siteWatchReducer,
	type WatchAction,
	type WatchState,
	watchReducer,
} from "./stream.ts";

/** How long to wait after a read fails before it is tried again. */
export const retryInterval = 1000;

/**
 * How long to wait before asking again about a cluster or a site that isn't
 * known, which may become known when a node of it connects.
 */
export const unknownInterval = 5000;

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
 * cluster to find out why: a cluster that isn't known is shown as unknown, and
 * asked about again after {@link unknownInterval}, so that the page comes alive
 * when a node of the cluster connects, and any other cluster is watched again.
 * A question that fails is asked again after {@link retryInterval}, and they
 * never overlap.
 *
 * Nothing is asked, and the stream is closed, once the page no longer shows the
 * cluster.
 */
export function useWatched(
	id: string,
	clock: Clock = browserClock,
): Polled<ClusterData> {
	return useStream(clusterStream, id, clock);
}

/**
 * useWatchedSite returns what the site view shows for the site with the given
 * key, which is {@link noSite} for the applications at no site, and which the
 * Observatory keeps up to date, in the same way as {@link useWatched} does for a
 * cluster.
 */
export function useWatchedSite(
	key: string,
	clock: Clock = browserClock,
): Polled<SiteData> {
	return useStream(siteStream, key, clock);
}

/**
 * Stream is how to watch one kind of thing, such as a cluster, by its ID or its
 * key.
 */
interface Stream<T> {
	/** Returns the path of the stream of the thing. */
	path: (id: string) => string;

	/** Finds out whether the Observatory knows the thing, as `checkCluster` does. */
	check: (id: string, signal: AbortSignal) => Promise<void>;

	reducer: (state: WatchState, action: WatchAction) => WatchState;

	/** Returns what the page shows, as `selectCluster` does. */
	select: (snapshot: Snapshot, ref: number) => T | undefined;
}

const clusterStream: Stream<ClusterData> = {
	path: watchPath,
	check: checkCluster,
	reducer: watchReducer,
	select: selectCluster,
};

const siteStream: Stream<SiteData> = {
	path: siteWatchPath,
	check: checkSite,
	reducer: siteWatchReducer,
	select: selectSite,
};

/** useStream watches the thing with the given ID, as {@link useWatched} says. */
function useStream<T>(stream: Stream<T>, id: string, clock: Clock): Polled<T> {
	const [state, dispatch] = useReducer(stream.reducer, initialWatchState);

	useEffect(() => {
		dispatch({ type: "reset" });

		const controller = new AbortController();
		let source: EventSource | undefined;
		let timer: number | undefined;

		const watch = () => {
			const events = new EventSource(stream.path(id));
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
				await stream.check(id, controller.signal);
				if (!controller.signal.aborted) {
					watch();
				}
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}

				if (error instanceof NotFound) {
					dispatch({ type: "unknown" });
					timer = window.setTimeout(check, unknownInterval);
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
	}, [stream, id, clock]);

	const data = useMemo(
		() =>
			state.snapshot === undefined
				? undefined
				: stream.select(state.snapshot, state.at),
		[stream, state.snapshot, state.at],
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
