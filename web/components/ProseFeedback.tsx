import { type ReactNode, useEffect, useRef, useState } from "react";

/** Where the edits are kept, so that they survive a reload of the page. */
const storageKey = "observatory-prose-edits";

/**
 * ProseFeedback makes the sentences of the cards inside it editable in place, so
 * that a person can rewrite them where they read them, and send the rewrites as
 * feedback.
 *
 * A card is an element with a `data-card` attribute that names it. The editable
 * parts are the paragraphs in it, and the elements in it that have a `data-prose`
 * attribute. An edit is kept in the browser, and survives a reload. A bar above
 * the cards says how many sentences have changed, copies each change with the
 * card that it is in, as it was and as it is now, and puts the sentences back as
 * they were.
 */
export function ProseFeedback({ children }: { children: ReactNode }) {
	const root = useRef<HTMLDivElement>(null);
	const originals = useRef(new Map<HTMLElement, string>());
	const [changed, setChanged] = useState(0);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		const element = root.current;
		if (element === null) {
			return;
		}

		let kept: Record<string, string> = {};
		try {
			kept = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
		} catch {
			// Nothing was kept, or it can't be read, so there are no edits to put back.
		}

		const counts = new Map<string, number>();
		const prose = [
			...element.querySelectorAll<HTMLElement>(
				"[data-card] p, [data-card] [data-prose]",
			),
		];
		for (const p of prose) {
			const card = (p.closest("[data-card]") as HTMLElement).dataset.card ?? "";
			const index = counts.get(card) ?? 0;
			counts.set(card, index + 1);

			const key = `${card}#${index}`;
			p.dataset.proseKey = key;
			// The effect runs twice in development, and the second time the sentence
			// may already be an edit, so what it was is only taken the first time.
			if (!originals.current.has(p)) {
				originals.current.set(p, p.textContent ?? "");
			}

			if (kept[key] !== undefined) {
				p.textContent = kept[key];
			}
			p.setAttribute("contenteditable", "plaintext-only");
			p.spellcheck = false;
		}

		const count = () =>
			prose.filter((p) => p.textContent !== originals.current.get(p)).length;
		setChanged(count());

		const onInput = (event: Event) => {
			const p = (event.target as HTMLElement).closest<HTMLElement>(
				"[data-prose-key]",
			);
			if (p?.dataset.proseKey === undefined) {
				return;
			}

			const edits = { ...kept };
			if (p.textContent === originals.current.get(p)) {
				delete edits[p.dataset.proseKey];
			} else {
				edits[p.dataset.proseKey] = p.textContent ?? "";
			}
			kept = edits;

			try {
				localStorage.setItem(storageKey, JSON.stringify(edits));
			} catch {
				// The edits can't be kept, which only means that a reload loses them.
			}
			setChanged(count());
			setCopied(false);
		};

		element.addEventListener("input", onInput);
		return () => element.removeEventListener("input", onInput);
	}, []);

	/** The changes, as text that can be sent. */
	function changes(): string {
		const out: string[] = [];
		for (const [p, was] of originals.current) {
			const now = p.textContent ?? "";
			if (now === was) {
				continue;
			}

			const card = (p.closest("[data-card]") as HTMLElement).dataset.card;
			out.push(`In "${card}":\n  was: ${was}\n  now: ${now}`);
		}
		return out.join("\n\n");
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(changes());
			setCopied(true);
		} catch {
			// The page can't write to the clipboard, so there is nothing to say.
		}
	}

	function reset() {
		for (const [p, was] of originals.current) {
			p.textContent = was;
		}
		try {
			localStorage.removeItem(storageKey);
		} catch {
			// Nothing was kept.
		}
		setChanged(0);
		setCopied(false);
	}

	return (
		<>
			<div className="sticky top-3 z-20 mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-line-strong bg-panel px-4 py-2.5 text-sm [box-shadow:var(--shadow-raised)]">
				<span className="text-fg-soft">
					Click any sentence in a card to rewrite it.{" "}
					<span className="font-semibold text-fg">
						{changed === 0
							? "Nothing has changed."
							: `${changed} ${changed === 1 ? "sentence has" : "sentences have"} changed.`}
					</span>
				</span>
				<span className="ml-auto flex gap-2">
					<button
						type="button"
						className="cursor-pointer rounded-control border border-line bg-panel px-3 py-1 text-xs text-fg-soft hover:border-line-strong disabled:cursor-default disabled:opacity-40 disabled:hover:border-line"
						disabled={changed === 0}
						onClick={copy}
					>
						{copied ? "Copied" : "Copy my changes"}
					</button>
					<button
						type="button"
						className="cursor-pointer rounded-control border border-line bg-panel px-3 py-1 text-xs text-fg-soft hover:border-line-strong disabled:cursor-default disabled:opacity-40 disabled:hover:border-line"
						disabled={changed === 0}
						onClick={reset}
					>
						Put them back
					</button>
				</span>
			</div>
			<div
				ref={root}
				className="[&_[contenteditable]]:-mx-1 [&_[contenteditable]]:rounded-sm [&_[contenteditable]]:px-1 [&_[contenteditable]]:outline-dashed [&_[contenteditable]]:outline-1 [&_[contenteditable]]:outline-transparent [&_[contenteditable]]:transition-colors [&_[contenteditable]]:hover:outline-line-strong [&_[contenteditable]]:focus:bg-sunk [&_[contenteditable]]:focus:outline-accent"
			>
				{children}
			</div>
		</>
	);
}
