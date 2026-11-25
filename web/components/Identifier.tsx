import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.ts";
import { shortId } from "../lib/format.ts";
import { Icon } from "./Icon.tsx";
import { panelClasses } from "./Popover.tsx";

/** How long the copy button shows that it has copied, in milliseconds. */
const copiedTime = 1500;

/** The room between the copy button and the note that says what it copied. */
const gap = 6;

/**
 * Identifier shows an ID or a key, which is a UUID, as its first eight characters
 * in monospace type, with a button that copies the whole UUID. `what` says what
 * it is, such as "cluster ID" or "application key", so that the button can say
 * what it copied: "Copied cluster ID".
 *
 * An ID is the identity of a thing that has no name, so it is in the color of
 * the text. If the thing has a name, which the page shows beside it, the name is
 * its identity, and the ID is in the color of muted text, `named`.
 *
 * It is made to be inside a popover that can be pointed at.
 */
export function Identifier({
	id,
	what,
	named,
}: {
	id: string;
	what: string;
	named?: boolean;
}) {
	const [copied, setCopied] = useState<DOMRect>();
	const button = useRef<HTMLButtonElement>(null);
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

		setCopied(button.current?.getBoundingClientRect());
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(undefined), copiedTime);
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
				ref={button}
				type="button"
				className="-m-1 inline-flex cursor-pointer rounded-control p-1 text-muted transition-colors duration-150 hover:bg-sunk hover:text-fg motion-reduce:transition-none"
				aria-label={copied ? `Copied ${what}` : `Copy ${what}`}
				onClick={copy}
			>
				<Icon name={copied ? "check" : "copy"} className="size-3" />
			</button>
			{copied &&
				// The note floats above the button, in the window's layer, so that it
				// moves nothing around it and no card cuts it off.
				createPortal(
					<span
						role="status"
						className={cn(
							panelClasses,
							"pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full px-2.5 py-1.5 whitespace-nowrap transition-opacity duration-150 starting:opacity-0 motion-reduce:transition-none",
						)}
						style={{
							left: copied.left + copied.width / 2,
							top: copied.top - gap,
						}}
					>
						Copied {what}
					</span>,
					document.body,
				)}
		</span>
	);
}
