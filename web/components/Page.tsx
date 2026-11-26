import type { ReactNode } from "react";
import { AlertFlag } from "./AlertFlag.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Footer, type Version } from "./Footer.tsx";
import { type NavItem, TitleBar } from "./TitleBar.tsx";

/**
 * Page is what every page of the Observatory has: the title bar along the top,
 * the footer along the bottom, and the main part of the page between them. Each
 * of them fails on its own.
 *
 * A page about one cluster gives the `trail` that says where it is.
 * `stopped` says that the page is no longer being updated, and why. While it is
 * given, the title bar has a red alert flag, which glitches as it appears and
 * whose tooltip says it, as a card's flag says its statuses, and a screen reader
 * announces it.
 */
export function Page({
	trail,
	nav,
	versions,
	stopped,
	aside,
	children,
}: {
	/** Where the page is, as a trail of links, for the title bar. */
	trail?: ReactNode;
	nav?: NavItem[][];
	versions?: Version[];
	stopped?: string;

	/** What the title bar shows at its right, before the color mode control. */
	aside?: ReactNode;

	children: ReactNode;
}) {
	return (
		<>
			<ErrorBoundary>
				<TitleBar
					trail={trail}
					nav={nav}
					aside={
						<>
							{aside}
							<AlertFlag
								statuses={
									stopped === undefined ? [] : [{ text: stopped, tone: "bad" }]
								}
							/>
						</>
					}
				/>
			</ErrorBoundary>
			<main className="mx-auto max-w-page px-6 pt-6 pb-12 max-narrow:px-4 max-narrow:pt-4 max-narrow:pb-10">
				<h1 className="sr-only">Dogma Observatory</h1>
				<p role="status" className="sr-only">
					{stopped}
				</p>
				{children}
			</main>
			<ErrorBoundary>
				<Footer versions={versions} />
			</ErrorBoundary>
		</>
	);
}
