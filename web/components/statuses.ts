/*
 * The statuses that the views' cards say while something is so, which the
 * review page's alert flags show. See the Hovercards section of
 * docs/ui-design.md: a status has one fixed text for each cause.
 */

/** The status of the cluster tile when no nodes are sending a signal. */
export const noNodesText =
	"There is no signal from any of the nodes, so it's unknown whether the application is working.";

/** The status of the engine tile while there is no signal from the engine. */
export const engineOutText =
	"There is no signal from the engine, so it's unknown whether the application is working.";

/** The status of the site's applications tile when no applications are sending a signal. */
export const noApplicationsText =
	"There is no signal from any of the applications, so it's unknown whether any of them are working.";
