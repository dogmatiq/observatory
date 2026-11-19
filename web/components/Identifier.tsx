import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { shortId } from "../lib/format.ts";
import { Icon } from "./Icon.tsx";

/** How long the copy button shows that it has copied, in milliseconds. */
const copiedTime = 1500;

/**
 * Identifier shows an ID, which is a UUID, as its first eight characters in
 * monospace type, with a button that copies the whole ID.
 *
 * An ID is the identity of a thing that has no name, so it is in the color of
 * the text. If the thing has a name, which the page shows beside it, the name is
 * its identity, and the ID is in the color of muted text, `named`.
 *
 * It is made to be inside a popover that can be pointed at.
 */
export function Identifier({ id, named }: { id: string; named?: boolean }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(id);
		} catch {
			// The page has no permission to write to the clipboard, so there is
			// nothing that it can say about it.
			return;
		}

		setCopied(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), copiedTime);
	}

	return (
		<span className="inline-flex items-center gap-1.5 align-baseline">
			<code
				className={cn(
					"text-[0.625rem]/[1.5]",
					named ? "text-muted" : "text-fg",
				)}
			>
				{shortId(id)}
			</code>
			<button
				type="button"
				className="-m-1 inline-flex cursor-pointer rounded-control p-1 text-muted transition-colors duration-150 hover:bg-sunk hover:text-fg motion-reduce:transition-none"
				aria-label={copied ? "ID copied" : "Copy ID"}
				onClick={copy}
			>
				<Icon name={copied ? "check" : "copy"} className="size-3" />
			</button>
		</span>
	);
}
