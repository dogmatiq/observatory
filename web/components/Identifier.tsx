import { useEffect, useRef, useState } from "react";
import { shortId } from "../lib/format.ts";
import { markOf } from "../lib/mark.ts";
import { Icon } from "./Icon.tsx";

/** How long the copy button shows that it has copied, in milliseconds. */
const copiedTime = 1500;

/**
 * Identifier shows an ID, which is a UUID, in a way that lets a person tell it
 * from others and see that it is an ID, without its 36 characters: a small
 * square of a color that the ID picks, its first eight characters in monospace
 * type, and a button that copies the whole ID.
 *
 * It is made to be inside a popover that can be pointed at.
 */
export function Identifier({ id }: { id: string }) {
	const { hue, light } = markOf(id);
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
			<span
				className="size-2 flex-none rounded-[2px]"
				style={{
					backgroundColor: `hsl(${hue} 70% var(${light ? "--mark-lightness-b" : "--mark-lightness-a"}))`,
				}}
				aria-hidden="true"
			/>
			<code className="text-2xs">{shortId(id)}</code>
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
