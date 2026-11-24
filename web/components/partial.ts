/**
 * partialStatus is the status of the card of a section's icon while only some of
 * the cluster's nodes report what the section is made from, so that its numbers
 * are the sums of those nodes, blurred by how few they are. Every number that a
 * section shows is a sum or the greatest of the nodes' values, so a number that
 * leaves nodes out can only be lower than the whole, never higher.
 *
 * Its words are the same whatever the cause, because a status has one fixed text
 * for each cause.
 */
export const partialStatus = {
	icon: "alert",
	text: "Only some of the cluster's nodes report the metrics shown in this section, so the numbers may appear lower than they really are.",
} as const;
