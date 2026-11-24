import { expect, test } from "vitest";
import { partialStatus } from "./partial.ts";

test("the status says that the numbers may appear lower than they are, and nothing of versions", () => {
	expect(partialStatus.text).toBe(
		"Only some of the cluster's nodes report the metrics shown in this section, so the numbers may appear lower than they really are.",
	);
});
