import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Identifier } from "./Identifier.tsx";

const id = "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test("an identifier shows the first eight characters, in the color of the text", () => {
	const { container } = render(<Identifier id={id} of="queue" />);

	const code = container.querySelector("code");
	expect(code?.textContent).toBe("8b0081fd");
	expect(code?.className).toContain("text-fg");
	expect(code?.className).not.toContain("text-muted");
});

test("the identifier of a thing that has a name is in the color of muted text", () => {
	const { container } = render(<Identifier id={id} of="queue" named />);

	expect(container.querySelector("code")?.className).toContain("text-muted");
});

test("the button copies the whole ID, and says that it has", async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { clipboard: { writeText } });

	render(<Identifier id={id} of="queue" />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Copy queue ID" }));
	});

	expect(writeText).toHaveBeenCalledWith(id);
	expect(screen.getByRole("button", { name: "Copied queue ID" })).toBeDefined();
	// It also says it in words, beside the button, for the moment that it holds.
	expect(screen.getByRole("status").textContent).toBe("Copied queue ID");

	act(() => {
		vi.advanceTimersByTime(2000);
	});
	expect(screen.getByRole("button", { name: "Copy queue ID" })).toBeDefined();
});

test("the button says nothing if the page can't write to the clipboard", async () => {
	vi.stubGlobal("navigator", {
		clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
	});

	render(<Identifier id={id} of="queue" />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Copy queue ID" }));
	});

	expect(screen.getByRole("button", { name: "Copy queue ID" })).toBeDefined();
});
