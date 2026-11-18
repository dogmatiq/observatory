import type { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Footer, type Version } from "./Footer.tsx";
import { type NavItem, TitleBar } from "./TitleBar.tsx";

/**
 * Page is what every page of the Observatory has: the title bar along the top,
 * the footer along the bottom, and the main part of the page between them. Each
 * of them fails on its own.
 *
 * A page that says where it is gives the `application` that its cluster runs.
 * `notice` is a short line of text above the main part, for something that a
 * person should know, such as that the page is no longer being updated.
 */
export function Page({
	application,
	nav,
	versions,
	notice,
	children,
}: {
	application?: { name: string; key: string };
	nav?: NavItem[][];
	versions?: Version[];
	notice?: string;
	children: ReactNode;
}) {
	return (
		<>
			<ErrorBoundary>
				<TitleBar application={application} nav={nav} />
			</ErrorBoundary>
			<main className="mx-auto max-w-page px-6 pt-6 pb-12 max-narrow:px-4 max-narrow:pt-4 max-narrow:pb-10">
				<h1 className="sr-only">Dogma Observatory</h1>
				{notice && (
					<p role="status" className="mb-4 text-sm text-muted">
						{notice}
					</p>
				)}
				{children}
			</main>
			<ErrorBoundary>
				<Footer versions={versions} />
			</ErrorBoundary>
		</>
	);
}
