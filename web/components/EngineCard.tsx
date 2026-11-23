import { InfoCard } from "./InfoCard.tsx";

/**
 * EngineCard is a small card about the engine tile's headline, which is the
 * content of the popover of the headline. It says what "online" means, and what
 * follows from it, and, if the engine is offline, what is unknown, as a status.
 *
 * `online` is whether the engine is in contact.
 */
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
							text: "The engine is out of contact, so it's unknown whether the application is working.",
						}
			}
		>
			<p>
				The engine is online while it is in contact, so the figures shown are
				current.
			</p>
		</InfoCard>
	);
}
