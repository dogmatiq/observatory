import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon } from "./Icon.tsx";

/**
 * NameLink is the name of a thing on a card, as the link to the thing's own page.
 * The name is the only part of the card that is a link. While it is pointed at or
 * has the keyboard's focus, it is underlined and a chevron appears after it, which
 * says that it leads to another page.
 *
 * The area that a finger can tap reaches a little past the name, so that a short
 * name is still easy to tap.
 */
export function NameLink({
	href,
	id,
	className,
	children,
}: {
	href: string;

	/** The ID of the name, for the card that it names. */
	id?: string;

	className?: string;
	children: ReactNode;
}) {
	return (
		<a
			id={id}
			href={href}
			className={cn(
				"group/name relative text-inherit no-underline decoration-from-font underline-offset-2 hover:underline focus-visible:underline",
				"after:absolute after:-inset-x-1 after:-inset-y-2",
				className,
			)}
		>
			{children}
			<Icon
				name="chevron"
				className="ml-0.5 inline size-3 align-[-1px] opacity-0 transition-opacity duration-150 group-hover/name:opacity-100 group-focus-visible/name:opacity-100 motion-reduce:transition-none"
			/>
		</a>
	);
}
