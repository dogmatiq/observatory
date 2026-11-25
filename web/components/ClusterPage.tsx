import type { Application, OverviewData } from "../model.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import type { Version } from "./Footer.tsx";
import { Overview, type OverviewLinks } from "./Overview.tsx";
import { Page } from "./Page.tsx";
import type { NavItem } from "./TitleBar.tsx";

/**
 * ClusterPage is the whole of the cluster view: the title bar, the overview and
 * the footer. Each of them fails on its own.
 */
export function ClusterPage({
	application,
	nav,
	versions,
	notice,
	data,
	links,
	down,
}: {
	application: Application;
	nav?: NavItem[][];
	versions?: Version[];
	notice?: string;
	data: OverviewData;
	links?: OverviewLinks;

	/** True if no node of the cluster is reporting, so its numbers are not trusted. */
	down?: boolean;
}) {
	return (
		<Page
			application={application}
			nav={nav}
			versions={versions}
			notice={notice}
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
