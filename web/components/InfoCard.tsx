import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Identifier } from "./Identifier.tsx";
import { type Subsystem, subsystemColors } from "./subsystems.ts";

/**
 * Scope says where the thing that a card is about is, or what it is of: "within
 * the Account application", "across the Dev cluster" or "on the Web 1 node".
 */
export interface Scope {
	preposition: "within" | "across" | "on";

	/** What the scope is a kind of, such as "application". */
	kind: string;

	name: string;

	/** The ID of what the scope is of, if it has one, shown under the scope. */
	id?: string;
}

/**
 * InfoCard is the frame of a small card of information, which is the content of
 * a popover that says more about something on the page. From the top it has:
 *
 * - a header, with an icon in the color of a subsystem, the kind of thing that
 *   the card is about, its scope, if it has one, such as "within the Account
 *   application", and what identifies it, if there is something;
 * - a figure that is the card's main number, with a unit, and an aside at the
 *   right, such as a share, if the card has them;
 * - paragraphs that say what the figure is;
 * - a status, if the card has one, which says whether the figure can be given at
 *   the moment, and why. It has an icon and a tinted ground, so that it is clearly
 *   about the ability to give the figure, and not about what the figure means.
 *
 * The card sets its own width.
 */
export function InfoCard({
	subsystem,
	icon,
	iconColor,
	kind,
	scope,
	identifier,
	figure,
	children,
	status,
}: {
	subsystem: Subsystem;
	icon: IconName;

	/** The class that colors the icon, if it is not the subsystem's color. */
	iconColor?: string;

	/** The kind of thing that the card is about, such as "Event stream". */
	kind: ReactNode;

	/** Where the thing is, or what it is of, shown under its kind. */
	scope?: Scope;

	/** What identifies the thing, shown under its kind. */
	identifier?: ReactNode;

	figure?: {
		value: ReactNode;
		unit: string;

		/** Shown at the right, in the subsystem's color. */
		aside?: ReactNode;
	};

	/** The paragraphs of the card. */
	children?: ReactNode;

	/**
	 * What the card says about whether its figure can be given now. A status that
	 * is `busy` says that the figure is being worked out, and its icon turns.
	 */
	status?: { icon: IconName; text: ReactNode; busy?: boolean };
}) {
	return (
		<div className={cn("w-64", subsystemColors[subsystem])}>
			<div
				className={cn(
					"flex gap-3 px-3.5 py-3",
					identifier || scope ? "items-start" : "items-center",
				)}
			>
				<span
					className={cn(
						"flex-none",
						iconColor ?? "text-(--subsystem)",
						identifier || scope ? "mt-px" : "",
					)}
				>
					<Icon name={icon} className="size-5" />
				</span>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="text-2xs font-semibold tracking-[0.08em] text-muted uppercase">
						{kind}
					</span>
					{scope && (
						<span className="text-fg-soft">
							{scope.preposition} the{" "}
							<span className="font-semibold text-fg">{scope.name}</span>{" "}
							{scope.kind}
						</span>
					)}
					{scope?.id !== undefined && <Identifier id={scope.id} named />}
					{identifier}
				</div>
			</div>

			{figure && (
				<div className="flex items-baseline justify-between gap-3 border-t border-line px-3.5 py-2.5">
					<span>
						<span className="text-xl font-semibold tabular-nums">
							{figure.value}
						</span>{" "}
						<span className="text-muted">{figure.unit}</span>
					</span>
					{figure.aside && (
						<span className="text-xl font-semibold text-(--subsystem) tabular-nums">
							{figure.aside}
						</span>
					)}
				</div>
			)}

			{children && (
				<div className="flex flex-col gap-2 border-t border-line px-3.5 py-3 text-muted">
					{children}
				</div>
			)}

			{status && (
				<div className="flex items-start gap-2.5 rounded-b-control border-t border-line bg-sunk px-3.5 py-3 text-fg-soft">
					<Icon
						name={status.icon}
						className={cn(
							"mt-0.5 size-4 flex-none text-muted",
							status.busy && "motion-safe:animate-[turn_2.4s_linear_infinite]",
						)}
					/>
					<p>{status.text}</p>
				</div>
			)}
		</div>
	);
}
