import type { ReactNode } from "react";
import { MessagesWaitingCard } from "./MessagesWaitingCard.tsx";
import { countedWords, eventRateWords } from "./Overview.tsx";
import { Page } from "./Page.tsx";
import { panelClasses } from "./Popover.tsx";
import { ProseFeedback } from "./ProseFeedback.tsx";
import { RateCard } from "./RateCard.tsx";

/** The states of a rate, which are the columns of the page. */
const states = ["known", "lost", "unavailable"] as const;

/**
 * VitalsPage shows all the prose of the popovers of the vital statistics of the
 * tiles, on one page, so that it can be read in one go: the card of the rate of
 * the events tile, in each state of the rate, and that of the rate of the queues
 * tile, for each thing that it can count, in each state, and the card of the
 * number that waits.
 *
 * The cards are drawn where they stand, in the frame of a panel, as the page of
 * states draws them. Their sentences can be rewritten in place, as feedback. See
 * [ProseFeedback].
 */
export function VitalsPage() {
	return (
		<Page>
			<p className="mb-8 max-w-3xl text-muted">
				The words of the popovers of the vital statistics of the tiles, in each
				combination that they can be in. A rate that is lost has had no new
				samples for a while, and one that is unavailable has too few to be
				calculated.
			</p>

			<ProseFeedback>
				<div className="grid gap-12">
					<Group title="Events tile: the rate">
						<Row label="Events recorded">
							{states.map((state) => (
								<Panel key={state} name={`Event rate, ${state}`}>
									<RateCard
										subsystem="streams"
										icon="event"
										words={eventRateWords}
										state={state}
									/>
								</Panel>
							))}
						</Row>
					</Group>

					<Group title="Queues tile: the rate, by what it counts">
						{(
							[
								"handled",
								"removed",
								"commands handled",
								"deadlines handled",
							] as const
						).map((counted) => (
							<Row key={counted} label={counted}>
								{states.map((state) => (
									<Panel
										key={state}
										name={`${countedWords[counted].kind}, ${state}`}
									>
										<RateCard
											subsystem="queues"
											icon="message"
											words={countedWords[counted]}
											state={state}
										/>
									</Panel>
								))}
							</Row>
						))}
					</Group>

					<Group title="Queues tile: the number that waits" states={false}>
						<Row label="Messages waiting">
							<Panel name="Messages waiting">
								<MessagesWaitingCard />
							</Panel>
						</Row>
					</Group>
				</div>
			</ProseFeedback>
		</Page>
	);
}

/** A part of the page, with a heading, and, if it has them, the columns of the states. */
function Group({
	title,
	states: byState = true,
	children,
}: {
	title: string;

	/** False for a part whose card is the same in every state. */
	states?: boolean;
	children: ReactNode;
}) {
	return (
		<section>
			<h2 className="mb-4 text-lg font-semibold">{title}</h2>
			<div className="grid gap-8">
				{byState && (
					<div className="grid grid-cols-[10rem_repeat(3,16rem)] gap-6 text-xs text-muted max-narrow:hidden">
						<span />
						{states.map((state) => (
							<span key={state} className="capitalize">
								{state}
							</span>
						))}
					</div>
				)}
				{children}
			</div>
		</section>
	);
}

/** A row of the cards of one thing, one for each state. */
function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[10rem_repeat(3,16rem)] items-start gap-6 max-narrow:grid-cols-1">
			<span className="font-semibold">{label}</span>
			{children}
		</div>
	);
}

/** A popover where it stands, in the frame of a panel, named for the feedback. */
function Panel({ name, children }: { name: string; children: ReactNode }) {
	return (
		<div data-card={name} className={`w-fit ${panelClasses}`}>
			{children}
		</div>
	);
}
