import { expect, test } from "vitest";
import { markOf } from "./mark.ts";

test("an identifier always has the same mark", () => {
	const id = "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10";

	expect(markOf(id)).toEqual(markOf(id));
});

test("identifiers are spread over the whole palette", () => {
	const marks = new Set<string>();
	for (let i = 0; i < 2000; i++) {
		const { hue, light } = markOf(`${i.toString(16).padStart(8, "0")}-0000`);
		marks.add(`${hue}/${light}`);
	}

	expect(marks.size).toBe(48);
});

test("the hues are whole numbers of degrees on the wheel", () => {
	const { hue } = markOf("anything");

	expect(hue % 15).toBe(0);
	expect(hue).toBeLessThan(360);
});
