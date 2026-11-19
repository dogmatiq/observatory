import { shortId } from "../lib/format.ts";
import { clusterPath } from "../lib/route.ts";
import type { ClusterSummary } from "../model.ts";
import { Page } from "./Page.tsx";
import { Popover } from "./Popover.tsx";

/**
 * ClustersPage is the page at the Observatory's first address. It lists the
 * clusters that the Observatory knows, each linking to its own page.
 *
 * It is a stopgap until the pages for the universe and for each site exist.
 */
export function ClustersPage({
	clusters,
	notice,
}: {
	/** The clusters, or undefined while they are not known yet. */
	clusters: ClusterSummary[] | undefined;
	notice?: string;
}) {
	return (
		<Page notice={notice}>
			<h2 className="mb-4 text-lg font-semibold">Clusters</h2>
			{clusters === undefined ? (
				<p className="text-muted">Loading…</p>
			) : clusters.length === 0 ? (
				<p className="text-muted">No cluster has connected yet.</p>
			) : (
				<ul className="grid gap-2">
					{clusters.map((cluster) => (
						<li key={cluster.id}>
							<Popover content={`Cluster ${cluster.id}`}>
								<a href={clusterPath(cluster.id)}>{cluster.application.name}</a>
							</Popover>
							{/* Tells apart clusters that run the same application. */}
							<span className="ml-2 text-muted">
								{cluster.site ?? shortId(cluster.id)}
							</span>
						</li>
					))}
				</ul>
			)}
		</Page>
	);
}
