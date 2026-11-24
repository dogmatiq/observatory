import { createContext, useContext } from "react";
import type { Versions } from "../model.ts";

/**
 * VersionsContext holds whether the nodes of the cluster that the page is of run
 * the same versions of the engine and the application, for the statuses below.
 * It is undefined if that isn't known.
 */
export const VersionsContext = createContext<Versions | undefined>(undefined);

/**
 * versionsSentence returns what a status says about the nodes' versions, as the
 * last sentence of a status about nodes that report different things. It says
 * what the versions show when they differ, says nothing when they are the same,
 * because the version is then not the cause, and says that it may be so when a
 * version isn't known. `subject` is who may be running a different version.
 */
export function versionsSentence(
	versions: Versions | undefined,
	subject: string,
): string {
	const engine = versions?.engine === "different";
	const application = versions?.application === "different";

	if (engine && application) {
		return " The cluster's nodes are running different versions of the engine and of the application.";
	}
	if (engine) {
		return " The cluster's nodes are running different versions of the engine.";
	}
	if (application) {
		return " The cluster's nodes are running different versions of the application.";
	}
	if (versions?.engine === "same" && versions.application === "same") {
		return "";
	}
	return ` ${subject} may be running a different version of the engine.`;
}

/**
 * partialText returns what the card of a section's icon says, as a status, while
 * only some of the nodes report what the section is made from, so that its
 * numbers are the sums of those nodes, blurred by how few they are.
 */
export function partialText(versions: Versions | undefined): string {
	return `Only some of the cluster's nodes report what this section shows, so its numbers include only those nodes.${versionsSentence(versions, "Some nodes")}`;
}

/**
 * usePartialStatus returns the status of the card of a section's icon while only
 * some of the nodes report what the section is made from. See [partialText].
 */
export function usePartialStatus(): { icon: "alert"; text: string } {
	return { icon: "alert", text: partialText(useContext(VersionsContext)) };
}
