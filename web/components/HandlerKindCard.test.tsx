import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { application } from "../fixtures/overview.ts";
import type { HandlerKind } from "../model.ts";
import { tipOf } from "../test-support.ts";
import { HandlerDigest } from "./HandlerDigest.tsx";
import { HandlerKindCard } from "./HandlerKindCard.tsx";

afterEach(cleanup);

const kinds: HandlerKind[] = [
	"aggregate",
	"process",
	"integration",
	"projection",
];

test("the card of a handler says which handler it is, and of what kind, so that a handler named after its kind is clear", () => {
	const { container } = render(
		<HandlerKindCard
			application={application}
			name="aggregate"
			kind="aggregate"
		/>,
	);

	expect(container.textContent).toContain(
		"This section shows information about the aggregate aggregate in the statements application.",
	);
});

test("each kind of handler has a card that reminds the reader what it does, and no two say the same", () => {
	const texts = kinds.map((kind) => {
		const { container, unmount } = render(
			<HandlerKindCard application={application} name="x" kind={kind} />,
		);
		const text = container.textContent;
		unmount();
		return text;
	});

	for (const [i, kind] of kinds.entries()) {
		expect(texts[i]).toContain(` ${kind} in the`);
	}
	expect(new Set(texts).size).toBe(kinds.length);
});

test("pointing at the kind icon of a handler's card shows the card of its kind", async () => {
	const { container } = render(
		<HandlerDigest
			application={application}
			handler={{
				key: "k",
				name: "the-handler",
				kind: "projection",
				summary: { failing: 0, bindings: [] },
			}}
		/>,
	);

	// The first icon that isn't a button's, which is the copy button's of the key.
	const icon = [...container.querySelectorAll("svg")].find(
		(svg) => svg.closest("button") === null,
	)?.parentElement as Element;
	const tip = await tipOf(icon);

	expect(tip).toContain(
		"A projection builds a view of the application's state in an external system, by applying events as they occur.",
	);
	expect(tip).toContain(
		"This section shows information about the the-handler projection in the statements application.",
	);
});
