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
 * Identifier shows the ID of a thing that has no name, which is a UUID, in the
 * place of a name and in the style of the text around it, as its first eight
 * characters, with a button that copies the whole ID. `what` says what it is,
 * such as "queue ID", so that the button can say what it copied: "Copied queue
 * ID".
 *
 * It is made to be inside a popover that can be pointed at.
 */
export function Identifier({ id, what }: { id: string; what: string }) {
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
			<span>{shortId(id)}</span>
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
