import type { Application } from "../model.ts";

/**
 * ApplicationName names an application in a sentence, with the site that it is at, if
 * it is at one, because an application may run at several sites and a sentence about
 * it should say which: "the **statements** application at the **eu-west** site". The word
 * "the" before it is the sentence's.
 */
export function ApplicationName({ application }: { application: Application }) {
	return (
		<>
			<span className="font-semibold text-fg">{application.name}</span>{" "}
			application
			{application.site !== undefined && (
				<>
					{" "}
					at the{" "}
					<span className="font-semibold text-fg">{application.site}</span> site
				</>
			)}
		</>
	);
}
