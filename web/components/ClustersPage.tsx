import { shortId } from "../lib/format.ts";
import { applicationAtSitePath } from "../lib/route.ts";
import type { ClusterSummary } from "../model.ts";
import { Page } from "./Page.tsx";
import { Popover } from "./Popover.tsx";

/**
 * ClustersPage is the page at the Observatory's first address. It lists the
 * clusters that the Observatory knows, each linking to the application view of
 * the application that it runs, at its site.
 *
 * The clusters that are reporting are listed first, then those that are not, which
 * the Observatory remembers and has no node of that is reporting, and are marked.
 * In each part they are listed by the name of their application, with the numbers
 * in names in order ("Queues: 2" before "Queues: 10"), and, if two have the same
 * name, by their ID.
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
					{ordered(clusters).map((cluster) => (
						<li key={cluster.id}>
							<Popover content={`Cluster ${cluster.id}`}>
								<a
									href={applicationAtSitePath(
										cluster.site?.key,
										cluster.application.key,
									)}
								>
									{cluster.application.name}
								</a>
							</Popover>
							{/* Tells apart clusters that run the same application. */}
							<span className="ml-2 text-muted">
								{cluster.site?.name ?? shortId(cluster.id)}
							</span>
							{!cluster.reporting && (
								<span className="ml-2 text-muted">out of contact</span>
							)}
						</li>
					))}
				</ul>
			)}
		</Page>
	);
}

/**
 * ordered returns the clusters that are reporting before those that are not, and
 * each of them sorted by the name of their application, then by ID.
 */
function ordered(clusters: ClusterSummary[]): ClusterSummary[] {
	return clusters.toSorted(
		(a, b) =>
			Number(b.reporting) - Number(a.reporting) ||
			a.application.name.localeCompare(b.application.name, undefined, {
				numeric: true,
				sensitivity: "base",
			}) ||
			(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
	);
}
