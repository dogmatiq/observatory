import { InfoCard } from "./InfoCard.tsx";

/**
 * NodesCard is a small card about the number of nodes of the cluster tile's
 * headline, which is the content of the popover of the number and of the words
 * "cluster nodes" in the detail line. It says what the number counts, what a node
 * is, and that the nodes together form a cluster, because the words are ordinary
 * ones that mean something narrower here.
 *
 * `live` is the number of nodes in contact. If there are none, the card says, as
 * a status, that every node is out of contact, so whether the application is
 * working is unknown.
 */
export function NodesCard({ live }: { live: number }) {
	return (
		<InfoCard
			subsystem="cluster"
			icon="node"
			kind="Cluster nodes"
			status={
				live === 0
					? {
							icon: "alert",
							text: "Every node is out of contact, so it's unknown whether the application is working.",
						}
					: undefined
			}
		>
			<p>
				The number of nodes that are in contact now. A node is one running
				process of the application's engine. Together, the nodes form a cluster
				that shares the application's work.
			</p>
		</InfoCard>
	);
}

/**
 * WorkloadsCard is a small card about the number of workloads of the cluster
 * tile, which is the content of the popover of the number and the word. It says
 * what a workload is. It doesn't describe the bar, which only the card of a
 * segment of the bar does, as on the other tiles.
 *
 * `whole` is whether every node reports its workloads. While some don't, the
 * number counts only the workloads of the nodes that do, and the card says so,
 * as a status.
 */
export function WorkloadsCard({ whole }: { whole: boolean }) {
	return (
		<InfoCard
			subsystem="cluster"
			icon="workload"
			kind="Workloads"
			status={
				whole
					? undefined
					: {
							icon: "alert",
							text: "Only some of the cluster's nodes report their workloads, so the total counts only the workloads of those nodes.",
						}
			}
		>
			<p>
				A workload is an ongoing task that the cluster gives to one of its
				nodes, such as delivering messages to one of the application's handlers.
			</p>
		</InfoCard>
	);
}
