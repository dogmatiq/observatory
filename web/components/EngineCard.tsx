import { InfoCard } from "./InfoCard.tsx";

/**
 * EngineCard is a small card about the engine tile's headline, which is the
 * content of the popover of the headline. It says what "online" means, and what
 * follows from it, and, if the engine is offline, what is unknown, as a status.
 *
 * `online` is whether the engine is sending a signal.
 */
/** The status of the engine's card while there is no signal from the engine. */
export const engineOutText =
	"There is no signal from the engine, so it's unknown whether the application is working.";

export function EngineCard({ online }: { online: boolean }) {
	return (
		<InfoCard
			subsystem="cluster"
			icon="engine"
			kind="Engine"
			status={
				online
					? undefined
					: {
							icon: "alert",
							text: engineOutText,
						}
			}
		>
			<p>The engine is online while it is sending a signal.</p>
		</InfoCard>
	);
}
