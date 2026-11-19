import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { type Subsystem, subsystemColors } from "./subsystems.ts";

/**
 * InfoCard is the frame of a small card of information, which is the content of
 * a popover that says more about something on the page. From the top it has:
 *
 * - a header, with an icon in the color of a subsystem, the kind of thing that
 *   the card is about, and what identifies it, if there is something;
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
	kind,
	identifier,
	figure,
	children,
	status,
}: {
	subsystem: Subsystem;
	icon: IconName;

	/** The kind of thing that the card is about, such as "Event stream". */
	kind: string;

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
					identifier ? "items-start" : "items-center",
				)}
			>
				<span
					className={cn(
						"flex-none text-(--subsystem)",
						identifier ? "mt-px" : "",
					)}
				>
					<Icon name={icon} className="size-5" />
				</span>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="text-2xs font-semibold tracking-[0.08em] text-muted uppercase">
						{kind}
					</span>
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
