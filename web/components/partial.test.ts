import { expect, test } from "vitest";
import { partialText } from "./partial.ts";

const first =
	"Only some of the cluster's nodes report what this section shows, so its numbers include only those nodes.";

test("the status says which versions differ, when the nodes' versions show it", () => {
	expect(partialText({ engine: "different", application: "same" })).toBe(
		`${first} The cluster's nodes are running different versions of the engine.`,
	);
	expect(partialText({ engine: "same", application: "different" })).toBe(
		`${first} The cluster's nodes are running different versions of the application.`,
	);
	expect(partialText({ engine: "different", application: "different" })).toBe(
		`${first} The cluster's nodes are running different versions of the engine and of the application.`,
	);
});

test("the status says nothing of versions when they are the same", () => {
	expect(partialText({ engine: "same", application: "same" })).toBe(first);
});

test("the status says that it may be the version when a version isn't known", () => {
	const maybe = `${first} Some nodes may be running a different version of the engine.`;
	expect(partialText({ engine: "unknown", application: "same" })).toBe(maybe);
	expect(partialText(undefined)).toBe(maybe);
});
