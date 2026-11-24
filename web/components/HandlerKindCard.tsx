import type { Application, HandlerKind } from "../model.ts";
import { ApplicationName } from "./ApplicationName.tsx";
import { InfoCard } from "./InfoCard.tsx";
import { partialStatus } from "./partial.ts";
import { handlerSubsystem, kindColors } from "./subsystems.ts";

/**
 * A reminder of what each kind of handler is for, as a sentence that follows the
 * kind, with its article. It says what the handler does for the application
 * first, and then, as a secondary matter, which messages it handles.
 */
export const handlerKindReminders: Record<HandlerKind, string> = {
	aggregate:
		"An aggregate enforces the application's business rules for each of its instances, by deciding which events each command produces.",
	process:
		"A process coordinates a workflow that takes place over time, reacting to events by executing commands and scheduling deadlines.",
	integration:
		"An integration interacts with external systems on the application's behalf.",
	projection:
		"A projection builds a view of the application's state in an external system, by applying events as they occur.",
};

/**
 * HandlerKindCard is the content of the popover of the icon of a kind of
 * handler. It says which handler the card is about, and of what kind, so that it
 * is clear when the name of the handler is not, such as when it is named
 * "aggregate", and then reminds the reader what that kind of handler does. It is
 * in the color of the kind.
 */
export function HandlerKindCard({
	application,
	name,
	kind,
	partial = false,
}: {
	application: Application;
	name: string;
	kind: HandlerKind;

	/**
	 * True if only some of the nodes report what the card of the handler is made
	 * from, which the card says as a status.
	 */
	partial?: boolean;
}) {
	return (
		<InfoCard
			subsystem={handlerSubsystem(kind)}
			icon={kind}
			iconColor={kindColors[kind]}
			kind={kind}
			status={partial ? partialStatus : undefined}
		>
			{handlerKindAbout(application, name, kind)}
		</InfoCard>
	);
}

/**
 * handlerKindAbout returns the paragraphs of a [HandlerKindCard]: which handler
 * the card is about, and a reminder of what its kind of handler does.
 */
export function handlerKindAbout(
	application: Application,
	name: string,
	kind: HandlerKind,
) {
	return (
		<>
			<p>
				This section shows information about the{" "}
				<span className="font-semibold text-fg">{name}</span> {kind} in the{" "}
				<ApplicationName application={application} />.
			</p>
			<p>{handlerKindReminders[kind]}</p>
		</>
	);
}
