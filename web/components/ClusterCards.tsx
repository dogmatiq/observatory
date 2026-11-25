import { InfoCard } from "./InfoCard.tsx";

/**
 * NodesCard is a small card about the number of nodes of the cluster tile's
 * headline, which is the content of the popover of the number and of the words
 * "cluster nodes" in the detail line. It says what the number counts, what a node
 * is, and that the nodes together form a cluster, because the words are ordinary
 * ones that mean something narrower here.
 *
 * `live` is the number of nodes sending a signal. If there are none, the card
 * says, as a status, that there is no signal from any of the nodes, so whether
 * the application is working is unknown.
 */
/** What the card of the cluster's nodes says the number counts. */
export const nodesText =
	"The number of nodes that are sending a signal now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work.";

/** The status of the card of the cluster's nodes when no nodes are sending a signal. */
export const noNodesText =
	"There is no signal from any of the nodes, so it's unknown whether the application is working.";

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
							text: noNodesText,
						}
					: undefined
			}
		>
			<p>{nodesText}</p>
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
