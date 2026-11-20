import { cn } from "../lib/cn.ts";

/**
 * Version is the name and version of a piece of software, such as "dogma
 * v0.25.0", and where to read about it.
 */
export interface Version {
	label: string;
	href?: string;
}

/**
 * Footer is the bar along the bottom of every page. It lists the versions of
 * the software that the page is about, if it has any, at its right.
 */
export function Footer({ versions = [] }: { versions?: Version[] }) {
	return (
		<footer className="border-t border-line text-sm text-muted">
			<div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 pt-4 pb-8 max-narrow:p-4">
				<p className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
					{versions.map((v, i) => (
						<span
							key={v.label}
							// A dot separates one version from the next.
							className={cn(
								i > 0 && "before:mr-2 before:text-faint before:content-['·']",
							)}
						>
							{v.href ? (
								<a className="text-inherit hover:underline" href={v.href}>
									{v.label}
								</a>
							) : (
								v.label
							)}
						</span>
					))}
				</p>
			</div>
		</footer>
	);
}
