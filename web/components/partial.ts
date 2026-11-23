/**
 * What the card of a section's icon says, as a status, while only some of the
 * nodes report what the section is made from, so that its numbers are the sums of
 * those nodes, blurred by how few they are. Nodes that report different things
 * may be partway through a deploy, which the status says may be so, and doesn't
 * claim.
 */
export const partialStatus: { icon: "alert"; text: string } = {
	icon: "alert",
	text: "Only some of the cluster's nodes report what this section shows, so its numbers include only those nodes. Some nodes may be running a different version of the engine.",
};
