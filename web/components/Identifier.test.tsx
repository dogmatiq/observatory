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

test("an identifier shows the first eight characters", () => {
	const { container } = render(<Identifier id={id} what="queue ID" />);

	expect(container.textContent).toBe("8b0081fd");
});

test("the button copies the whole ID, and says that it has", async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { clipboard: { writeText } });

	render(<Identifier id={id} what="queue ID" />);
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

	render(<Identifier id={id} what="queue ID" />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Copy queue ID" }));
	});

	expect(screen.getByRole("button", { name: "Copy queue ID" })).toBeDefined();
});
