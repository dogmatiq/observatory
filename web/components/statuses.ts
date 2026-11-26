/*
 * The statuses that the views' cards say while something is so, each of which
 * a card's alert flag shows. See the Hovercards section of docs/ui-design.md: a
 * status has one fixed text for each cause.
 */

/**
 * Status is what a card says while something is so, as the tooltip of its alert
 * flag.
 */
export interface Status {
	/** The words of the status, which are the same whatever else is true. */
	readonly text: string;

	/**
	 * "qualifies" for a status that qualifies the card's figures, which are still
	 * worth reading, and "bad" for one that says that something is wrong.
	 */
	readonly tone: "qualifies" | "bad";
}

/**
 * What each status that comes with blurred numbers ends with: what the blur
 * means.
 */
const blurred = "The more uncertain the numbers, the more they blur.";

/**
 * The status of a card while only some of the cluster's nodes report what it
 * shows, so that its numbers are the sums of those nodes, blurred by how few
 * they are. Every number that a card shows is a sum or the greatest of the nodes'
 * values, so a number that leaves nodes out can only be lower than the whole,
 * never higher.
 */
export const someNodesReport: Status = {
	text: `Only some of the cluster's nodes report the metrics shown in this section, so the numbers may appear lower than they really are. ${blurred}`,
	tone: "qualifies",
};

/**
 * The status of an application's compact digest on the site view while only
 * some of the application's nodes report what it shows, as [someNodesReport] is
 * a cluster's.
 */
export const someApplicationNodesReport: Status = {
	text: `Only some of the application's nodes report the metrics shown in this section, so the numbers may appear lower than they really are. ${blurred}`,
	tone: "qualifies",
};

/**
 * The status of the cluster tile while only some of its nodes report their
 * workloads, so that the number of workloads counts only those nodes'.
 */
export const someNodesReportWorkloads: Status = {
	text: `Only some of the cluster's nodes report their workloads, so the total counts only the workloads of those nodes. ${blurred}`,
	tone: "qualifies",
};

/**
 * The status of a site tile while only some of the applications report what it
 * shows in full: some of their nodes, or all of them, don't report it, or have no
 * signal. Its numbers can then only appear lower than they really are.
 */
export const someApplicationsReport: Status = {
	text: `Only some of the applications fully report the metrics shown in this section, so the numbers may appear lower than they really are. ${blurred}`,
	tone: "qualifies",
};

/**
 * The status of a tile whose rate is lost: no new samples are arriving, so the
 * figure is the last rate that there was, for a minute at most.
 */
export const rateLost: Status = {
	text: `New samples aren't arriving, so this average is out of date. ${blurred}`,
	tone: "qualifies",
};

/**
 * The status of a tile whose rate can't be given yet, because there aren't
 * enough samples to average.
 */
export const rateUnavailable: Status = {
	text: `There aren't enough samples yet, so the average can't be calculated. ${blurred}`,
	tone: "qualifies",
};

/** The status of the cluster tile when no nodes are sending a signal. */
export const noSignalFromNodes: Status = {
	text: "There is no signal from any of the nodes, so it's unknown whether the application is working.",
	tone: "bad",
};

/** The status of the engine tile while there is no signal from the engine. */
export const noSignalFromEngine: Status = {
	text: "There is no signal from the engine, so it's unknown whether the application is working.",
	tone: "bad",
};

/**
 * The status of the site's applications tile when no applications are sending a
 * signal.
 */
export const noSignalFromApplications: Status = {
	text: "There is no signal from any of the applications, so it's unknown whether any of them are working.",
	tone: "bad",
};

/**
 * rateStatuses returns the status of a rate in the given state, which is none
 * while the rate is known.
 */
export function rateStatuses(
	state: "known" | "lost" | "unavailable",
): Status[] {
	switch (state) {
		case "known":
			return [];
		case "lost":
			return [rateLost];
		case "unavailable":
			return [rateUnavailable];
	}
}
