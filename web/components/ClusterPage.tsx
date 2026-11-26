import type { Application, OverviewData, Site, Software } from "../model.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import type { Version } from "./Footer.tsx";
import { Overview, type OverviewLinks } from "./Overview.tsx";
import { Page } from "./Page.tsx";
import { PageTrail, type Runner } from "./PageTrail.tsx";
import type { NavItem } from "./TitleBar.tsx";

/**
 * ClusterPage is the whole of the cluster view: the title bar, with where the
 * page is, the overview and the footer. Each of them fails on its own.
 */
export function ClusterPage({
	application,
	site,
	software,
	runner,
	onClusterPage,
	nav,
	versions,
	stopped,
	data,
	links,
	down,
}: {
	application: Application;

	/** The site that the cluster is deployed to, if it has one. */
	site?: Site;

	software?: Software;

	/** The cluster that runs the application, or the engine. */
	runner: Runner;

	/**
	 * True on the cluster's own page, which the trail names it on, rather than on
	 * the page of the application that it runs.
	 */
	onClusterPage?: boolean;

	nav?: NavItem[][];
	versions?: Version[];
	stopped?: string;
	data: OverviewData;
	links?: OverviewLinks;

	/** True if no node of the cluster is reporting, so its numbers are not trusted. */
	down?: boolean;
}) {
	return (
		<Page
			trail={
				<PageTrail
					site={site}
					application={application}
					runner={runner}
					software={software}
					onClusterPage={onClusterPage}
				/>
			}
			nav={nav}
			versions={versions}
			stopped={stopped}
		>
			<ErrorBoundary>
				<Overview
					application={application}
					data={data}
					links={links}
					down={down}
				/>
			</ErrorBoundary>
		</Page>
	);
}
