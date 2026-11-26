import type { SiteData } from "../model.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Page } from "./Page.tsx";
import { PageTrail } from "./PageTrail.tsx";
import { SiteOverview } from "./SiteView.tsx";

/**
 * SitePage is the whole of the site view: the title bar, with where the page
 * is, the site view and the footer. Each of them fails on its own. The page of
 * the applications at no site has no trail, because there is no site to go to.
 */
export function SitePage({
	data,
	stopped,
}: {
	data: SiteData;
	stopped?: string;
}) {
	return (
		<Page trail={data.site && <PageTrail site={data.site} />} stopped={stopped}>
			<ErrorBoundary>
				<SiteOverview data={data} />
			</ErrorBoundary>
		</Page>
	);
}
