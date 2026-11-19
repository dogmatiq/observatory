import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { VitalsPage } from "./VitalsPage.tsx";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** The first sentence of the card that has the given name, which is drawn first. */
function sentenceOf(card: string, text: string) {
	const el = document.querySelector(`[data-card="${card}"]`);
	const p = [...(el?.querySelectorAll("p") ?? [])].find((p) =>
		p.textContent?.startsWith(text),
	);
	if (!p) {
		throw new Error(`no sentence of ${card} that starts "${text}"`);
	}
	return p;
}

test("the sentences of the cards can be edited, and the edits are counted", () => {
	render(<VitalsPage />);
	expect(screen.getByText("Nothing has changed.")).toBeDefined();

	const p = sentenceOf("Event rate, known", "The rate at which");
	expect(p.getAttribute("contenteditable")).toBe("plaintext-only");

	p.textContent = "How fast events are recorded.";
	fireEvent.input(p);
	expect(screen.getByText("1 sentence has changed.")).toBeDefined();

	// An edit that is undone is not a change.
	p.textContent =
		"The rate at which the application is recording new events, averaged over the last minute.";
	fireEvent.input(p);
	expect(screen.getByText("Nothing has changed.")).toBeDefined();
});

test("the changes are copied with the card that each is in, as it was and as it is", async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { clipboard: { writeText } });

	render(<VitalsPage />);
	const p = sentenceOf("Event rate, lost", "The rate at which");
	p.textContent = "How fast events are recorded.";
	fireEvent.input(p);

	fireEvent.click(screen.getByRole("button", { name: "Copy my changes" }));
	await waitFor(() => expect(writeText).toHaveBeenCalledOnce());

	expect(writeText.mock.calls[0]?.[0]).toBe(
		`In "Event rate, lost":
  was: The rate at which the application is recording new events, averaged over the last minute.
  now: How fast events are recorded.`,
	);
});

test("the edits survive a reload, and can be put back", () => {
	const first = render(<VitalsPage />);
	const p = sentenceOf("Messages waiting", "The number of messages");
	p.textContent = "Messages that wait.";
	fireEvent.input(p);
	first.unmount();

	render(<VitalsPage />);
	expect(
		sentenceOf("Messages waiting", "Messages that wait.").textContent,
	).toBe("Messages that wait.");
	expect(screen.getByText("1 sentence has changed.")).toBeDefined();

	fireEvent.click(screen.getByRole("button", { name: "Put them back" }));
	expect(
		sentenceOf("Messages waiting", "The number of messages").textContent,
	).toContain("The number of messages that are waiting");
	expect(screen.getByText("Nothing has changed.")).toBeDefined();
});

test("edits that are put back on a page that draws its effects twice are still changes", () => {
	const first = render(<VitalsPage />);
	const p = sentenceOf("Event rate, known", "The rate at which");
	p.textContent = "How fast events are recorded.";
	fireEvent.input(p);
	first.unmount();

	render(
		<StrictMode>
			<VitalsPage />
		</StrictMode>,
	);

	expect(screen.getByText("1 sentence has changed.")).toBeDefined();
});
