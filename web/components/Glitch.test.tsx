import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Glitch } from "./Glitch.tsx";

afterEach(cleanup);

test("the text takes up the room, and the two halves that slip are hidden from assistive technology", () => {
	const { container } = render(<Glitch text="347" distrust={0.5} />);

	const hidden = container.querySelectorAll("[aria-hidden=true]");
	expect(hidden).toHaveLength(2);
	expect([...hidden].map((e) => e.textContent)).toEqual(["347", "347"]);
	expect(container.querySelector(".glitch-room")?.textContent).toBe("347");
});

test("a burst says how long it lasts, and slipping that goes on has no time", () => {
	const burst = render(<Glitch text="347" distrust={1} burst={500} />);
	const element = burst.container.firstChild as HTMLElement;
	expect(element.className).toContain("glitch-burst");
	expect(element.style.getPropertyValue("--glitch-burst")).toBe("500ms");
	burst.unmount();

	const { container } = render(<Glitch text="347" distrust={1} />);
	expect((container.firstChild as HTMLElement).className).not.toContain(
		"glitch-burst",
	);
});

test("how far the halves slip is the distrust", () => {
	const { container } = render(<Glitch text="347" distrust={0.25} />);

	expect(
		(container.firstChild as HTMLElement).style.getPropertyValue("--distrust"),
	).toBe("0.25");
});
