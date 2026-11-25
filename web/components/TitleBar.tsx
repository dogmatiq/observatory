import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { Application } from "../model.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Logo } from "./Logo.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

/**
 * NavItem is a link in the title bar.
 */
export interface NavItem {
	label: string;
	icon: IconName;
	href: string;

	/** True for the link to the page that is open. */
	current?: boolean;
}

/**
 * TitleBar is the bar along the top of every page. It has the brand on the
 * left, which links to the first page, followed by where the page is, then the
 * page's links, and the control for the color mode on the right.
 *
 * The brand is the Dogmatiq wordmark, then a rule, then the product's name as it
 * is written. The brand guide measures the lockup in x-heights of the wordmark:
 * half an x-height before and after the rule, and a name whose capitals are one
 * x-height tall. With the wordmark 80px wide an x-height is 9.27px, so the gaps
 * are 4.6px and the name is 13.28px, on a line as tall as the wordmark so that
 * its baseline is level with the wordmark's. The rule is a pixel wide, as that is
 * the thinnest that can be drawn, and in the faint text color. The name is in the
 * soft text color, a touch duller than the wordmark, so that the wordmark leads.
 *
 * The bar stays at the top as the page scrolls. Its background spans the window,
 * and its content has the page's width and is centered, so the brand lines up
 * with the left edge of the page and the controls with its right edge.
 */
export function TitleBar({
	application,
	identifier,
	trail,
	nav = [],
	aside,
}: {
	/**
	 * The application that the cluster runs, which is where the page is. A page
	 * that is not about one cluster has none.
	 */
	application?: Application;

	/**
	 * The ID of what runs the application, after where the page is: the cluster's,
	 * or the engine's if it doesn't cluster. It is the same for every part of the
	 * page, so it is shown here rather than on any one card.
	 */
	identifier?: ReactNode;

	/** Where the page is, as a trail of links, in place of the application and the ID. */
	trail?: ReactNode;

	/**
	 * The page's links, in groups. A line separates one group from the next.
	 */
	nav?: NavItem[][];

	/** What the page shows at the right of the bar, before the color mode control. */
	aside?: ReactNode;
}) {
	return (
		<header className="sticky top-0 z-10 border-b border-line bg-[color-mix(in_srgb,var(--color-panel)_86%,transparent)] [backdrop-filter:saturate(1.4)_blur(10px)]">
			<div className="mx-auto flex h-13 max-w-page items-center gap-6 px-6 max-narrow:h-auto max-narrow:flex-wrap max-narrow:gap-x-3 max-narrow:gap-y-1.5 max-narrow:px-4 max-narrow:py-2">
				<a
					className="flex items-center whitespace-nowrap text-fg no-underline hover:no-underline"
					href="/"
					aria-label="dogmatiq observatory"
				>
					<Logo className="h-auto w-20 flex-none fill-current" />
					<span
						className="mx-[4.6px] h-[19px] w-px flex-none bg-faint"
						aria-hidden="true"
					/>
					<span className="text-[13.28px] leading-[19.46px] font-light text-fg-soft">
						observatory
					</span>
				</a>
				{trail}
				{application && (
					<span className="font-medium whitespace-nowrap text-muted">
						{application.name}
						{application.site !== undefined && (
							<span className="font-normal"> at {application.site}</span>
						)}
					</span>
				)}
				{identifier && (
					<span className="-ml-3 text-xs whitespace-nowrap text-faint">
						{identifier}
					</span>
				)}
				{nav.length > 0 && (
					<nav className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] max-narrow:order-3 max-narrow:w-full max-narrow:flex-wrap">
						{nav.map((group, g) => (
							<NavGroup
								// A group has no identity but its position.
								// biome-ignore lint/suspicious/noArrayIndexKey: see above
								key={g}
								items={group}
								divided={g > 0}
							/>
						))}
					</nav>
				)}
				<div className="ml-auto flex items-center gap-2.5">
					{aside}
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}

/**
 * NavGroup is a group of the page's links, with a line before it if it isn't the
 * first group.
 */
export function NavGroup({
	items,
	divided,
}: {
	items: NavItem[];
	divided: boolean;
}) {
	return (
		<>
			{divided && (
				<span
					className="mx-2 h-5 w-px flex-none self-center bg-line-strong max-narrow:hidden"
					aria-hidden="true"
				/>
			)}
			{items.map((item) => (
				<a
					key={item.href}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 whitespace-nowrap no-underline hover:no-underline",
						item.current
							? "bg-accent-soft font-semibold text-accent"
							: "text-fg-soft hover:bg-sunk",
					)}
					href={item.href}
					aria-current={item.current ? "page" : undefined}
				>
					<Icon
						name={item.icon}
						className="inline size-4 flex-none align-text-bottom"
					/>
					{item.label}
				</a>
			))}
		</>
	);
}
