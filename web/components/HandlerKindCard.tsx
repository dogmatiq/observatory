import type { Application, HandlerKind } from "../model.ts";
import { InfoCard } from "./InfoCard.tsx";
import { handlerSubsystem, kindColors } from "./subsystems.ts";

/**
 * A reminder of what each kind of handler is for, as a sentence that follows the
 * kind, with its article. It says what the handler does for the application
 * first, and then, as a secondary matter, which messages it handles.
 */
const reminders: Record<HandlerKind, string> = {
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
}: {
	application: Application;
	name: string;
	kind: HandlerKind;
}) {
	return (
		<InfoCard
			subsystem={handlerSubsystem(kind)}
			icon={kind}
			iconColor={kindColors[kind]}
			kind={kind}
		>
			<p>
				This section shows information about the{" "}
				<span className="font-semibold text-fg">{name}</span> {kind} in the{" "}
				<span className="font-semibold text-fg">{application.name}</span>{" "}
				application.
			</p>
			<p>{reminders[kind]}</p>
		</InfoCard>
	);
}
