import { useState } from "react";
import { moonName } from "../lib/moon.ts";
import { type MoonQuote, moonQuotes, pickOther } from "../lib/moon-lore.ts";
import { InfoCard } from "./InfoCard.tsx";

/**
 * MoonCard is the card of the moon in the sky of a card that has no chart. From the
 * top it has:
 *
 * - what the author of the quote called the moon, and, if that is not English, what
 *   it means, in a lighter style after it, on the same line, with the phase of the
 *   moon tonight under them;
 * - something that someone said about the moon, with who said it and a link to where
 *   it can be read, and, if it is in another language, its translation and who
 *   translated it;
 * - a status, which says why the card has no chart, as the status of a rate does,
 *   in terms of samples, and that the quote is there instead: `missing` is what
 *   there are no samples of, as a noun phrase, such as "the rate of events".
 */
export function MoonCard({
	phase,
	missing,
	quote,
}: {
	/** How far the moon is through its month, from [moonPhase]. */
	phase: number;
	missing: string;
	quote: MoonQuote;
}) {
	const phaseName = moonName(phase);

	return (
		<InfoCard
			subsystem="neutral"
			icon="moon"
			// The moon's name leads, as a thing's name does on every card: the word
			// that the author used for it, and, if it is foreign, what it means, in a
			// lighter style and on the same line. Its phase tonight is under it, in the
			// place of a kind.
			name={
				<>
					{quote.moon ?? "Moon"}
					{quote.moon && (
						<span className="font-normal tracking-normal text-fg-soft normal-case">
							{" "}
							the moon
						</span>
					)}
				</>
			}
			kind={phaseName.charAt(0).toUpperCase() + phaseName.slice(1)}
			status={{
				icon: "chart",
				text: `There are no samples of ${missing}, so here's a quote about the moon instead.`,
			}}
		>
			<figure className="flex flex-col gap-2 text-2xs">
				<blockquote className="border-l-2 border-line-strong pl-3">
					<p className="whitespace-pre-line text-fg-soft italic">
						{quote.text}
					</p>
				</blockquote>
				<figcaption>
					{quote.by},{" "}
					<a
						href={quote.url}
						target="_blank"
						rel="noreferrer"
						className="text-fg-soft underline decoration-line-strong underline-offset-2 hover:text-fg"
					>
						{quote.work}
					</a>
				</figcaption>
				{quote.translation && (
					<>
						<blockquote className="mt-1 border-l-2 border-line-strong pl-3">
							<p className="whitespace-pre-line text-fg-soft">
								{quote.translation.text}
							</p>
						</blockquote>
						<p>Translated by {quote.translation.by}</p>
					</>
				)}
			</figure>
		</InfoCard>
	);
}

/** The quote that the popover showed last, so that the next differs. */
let lastQuote: MoonQuote | undefined;

/**
 * PickedMoonCard is a [MoonCard] with a quote that it picks at random, which is
 * another than the one that the last card showed. It picks when it is
 * drawn, and a popover draws its content each time that it opens, so each time that
 * the popover opens it shows another.
 */
export function PickedMoonCard({
	phase,
	missing,
}: {
	phase: number;
	missing: string;
}) {
	const [quote] = useState(() => {
		lastQuote = pickOther(moonQuotes, lastQuote);
		return lastQuote;
	});

	return <MoonCard phase={phase} missing={missing} quote={quote} />;
}
