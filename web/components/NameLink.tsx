import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon } from "./Icon.tsx";

/**
 * NameLink is the name of a thing on a card, as the link to the thing's own page.
 * The name is the only part of the card that is a link. While it is pointed at or
 * has the keyboard's focus, it is underlined and a chevron appears after it, which
 * says that it leads to another page. On a screen that is touched, which can't
 * point, the chevron is always there.
 *
 * On a screen that is touched, the area that a finger can tap is the whole of the
 * nearest element around the name that is positioned, such as one marked
 * `relative`, so that a card can make its name and kind one place to tap.
 *
 * The children are the name, which may cut itself short to fit; the chevron stays
 * after it.
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
				"group/name flex min-w-0 items-center gap-0.5 text-inherit no-underline decoration-from-font underline-offset-2 hover:underline focus-visible:underline",
				"pointer-coarse:after:absolute pointer-coarse:after:inset-0 pointer-coarse:after:content-['']",
				className,
			)}
		>
			{children}
			<Icon
				name="chevron"
				className="size-3 flex-none opacity-0 transition-opacity duration-150 group-hover/name:opacity-100 group-focus-visible/name:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none"
			/>
		</a>
	);
}
