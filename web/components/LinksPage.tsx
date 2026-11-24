import { Page } from "./Page.tsx";

/**
 * PageLink is one entry of a {@link LinksPage}: a link, and a few words beside
 * it that tell it apart from the others.
 */
export interface PageLink {
	href: string;
	label: string;
	detail?: string;
}

/**
 * LinksPage is a plain page with a heading and a list of links. It stands in
 * for the pages that are not designed yet, such as the page of a site, and it
 * lists the candidates when an address leads to more than one thing.
 *
 * `notice` is a short line of text above the heading, as on any page.
 */
export function LinksPage({
	title,
	intro,
	links,
	notice,
}: {
	title: string;
	intro?: string;
	links: PageLink[];
	notice?: string;
}) {
	return (
		<Page notice={notice}>
			<h2 className="mb-4 text-lg font-semibold">{title}</h2>
			{intro && <p className="mb-4 text-muted">{intro}</p>}
			<ul className="grid gap-2">
				{links.map((link) => (
					<li key={link.href}>
						<a href={link.href}>{link.label}</a>
						{link.detail && (
							<span className="ml-2 text-muted">{link.detail}</span>
						)}
					</li>
				))}
			</ul>
		</Page>
	);
}
