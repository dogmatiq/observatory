import { Fragment, useRef } from "react";
import { cn } from "../lib/cn.ts";
import { shortId } from "../lib/format.ts";
import { applicationAtSitePath, clusterPath, sitePath } from "../lib/route.ts";
import type { Site, Software } from "../model.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Identifier } from "./Identifier.tsx";
import { NameLink } from "./NameLink.tsx";
import { Popover } from "./Popover.tsx";

/**
 * The cluster that runs the application, or the engine if it doesn't run as a
 * cluster, which the trail names last.
 */
export interface Runner {
	kind: "cluster" | "engine";

	/** The ID of the cluster, or of the engine, which is a UUID. */
	id: string;
}

/**
 * PageTrail is where a page is, in the title bar: the page's address, as a trail
 * of steps, each a link to its own page. On a site's page it is the site. On an
 * application's page, which shows the cluster that runs the application, it is
 * the site and the application; on a cluster's own page, the cluster or the
 * engine follows them. An application at no site has no site step.
 *
 * Pointing at the trail shows a hovercard of every step, the cluster or the
 * engine too, each drawn as a card's heading: its name over its kind, with its
 * key or ID, which can be copied, and its version as a tag. A cluster or an
 * engine is named by the name of its engine's software, while its nodes agree on
 * it, and otherwise has no name, and is shown by its shortened ID.
 */
export function PageTrail({
	site,
	application,
	runner,
	software,
	onClusterPage = false,
}: {
	/** The site that the cluster is deployed to, or undefined if it has none. */
	site: Site | undefined;

	/** The application, which is undefined on a site's page. */
	application?: { name: string; key: string };

	/**
	 * The cluster that runs the application, or the engine, which is undefined on
	 * a site's page.
	 */
	runner?: Runner;
	software?: Software;

	/** True on a cluster's own page, whose trail ends with the cluster. */
	onClusterPage?: boolean;
}) {
	const steps = stepsOf(site, application, runner, software);
	const shown = onClusterPage
		? steps
		: steps.filter((s) => s.kind !== "Cluster" && s.kind !== "Engine");

	// On a screen that is touched, a tap on the trail opens its hovercard, as a
	// tap on a bar's segment does, rather than following a step's link; the
	// names in the hovercard are the links there.
	const touched = useRef(false);

	return (
		<Popover
			card
			interactive
			content={
				<div className="flex min-w-64 flex-col divide-y divide-line">
					{steps.map((s) => (
						<StepHeading key={s.kind} step={s} />
					))}
				</div>
			}
		>
			<nav
				aria-label="Where this page is"
				className="flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted"
			>
				{shown.map((s, i) => (
					<Fragment key={s.kind}>
						{i > 0 && (
							<Icon name="chevron" className="size-3 flex-none text-faint" />
						)}
						<a
							href={s.href}
							onPointerDown={(e) => {
								touched.current = e.pointerType === "touch";
							}}
							onClick={(e) => {
								if (touched.current) {
									e.preventDefault();
								}
							}}
							className={cn(
								"no-underline decoration-from-font underline-offset-2 hover:underline",
								// The last step, which is where the page is, is cut short last.
								i === shown.length - 1
									? "flex-none font-medium text-fg-soft"
									: "min-w-0 truncate text-muted",
							)}
						>
							{s.name === undefined
								? `${s.kind.toLowerCase()} ${shortId(s.id?.id ?? "")}`
								: s.id !== undefined && s.idInTrail
									? `${s.name} ${shortId(s.id.id)}`
									: s.name}
						</a>
					</Fragment>
				))}
			</nav>
		</Popover>
	);
}

/** A step of a page's trail. */
interface Step {
	kind: "Site" | "Application" | "Cluster" | "Engine";
	icon: IconName;
	href: string;

	/** The step's name, or undefined for a cluster or engine with no name. */
	name?: string;

	/** The key or ID of the step, which can be copied, if it has one. */
	id?: { id: string; what: string };

	/** True if the trail shows the step's shortened ID after its name. */
	idInTrail?: boolean;

	/** The version of the step, as a tag after its name, if it has one. */
	version?: string;
}

/**
 * stepsOf returns the steps of a trail, the cluster or the engine last, of
 * those that it is given.
 */
function stepsOf(
	site: Site | undefined,
	application: { name: string; key: string } | undefined,
	runner: Runner | undefined,
	software: Software | undefined,
): Step[] {
	const range = software?.engineVersions;
	const engine = software?.engineName;

	// An application at no site has no site step, because there is no site to
	// go to or to copy the key of.
	const siteSteps: Step[] =
		site === undefined
			? []
			: [
					{
						kind: "Site",
						icon: "pin",
						href: sitePath(site.key),
						name: site.name,
						id: { id: site.key, what: "site key" },
					},
				];

	if (application === undefined) {
		return siteSteps;
	}

	const applicationStep: Step = {
		kind: "Application",
		icon: "application",
		href: applicationAtSitePath(site?.key, application.key),
		name: application.name,
		id: { id: application.key, what: "application key" },
		version: software?.applicationVersionsDiffer
			? "multiple versions"
			: software?.applicationVersion,
	};

	if (runner === undefined) {
		return [...siteSteps, applicationStep];
	}

	return [
		...siteSteps,
		applicationStep,
		{
			kind: runner.kind === "cluster" ? "Cluster" : "Engine",
			icon: runner.kind,
			href: clusterPath(runner.id),
			name: engine,
			id: { id: runner.id, what: `${runner.kind} ID` },
			idInTrail: true,
			// The versions of different engines can't be compared, so a cluster with
			// no name has no version either.
			version:
				engine === undefined || range === undefined
					? undefined
					: range.lowest === range.highest
						? range.lowest
						: `${range.lowest}–${range.highest}`,
		},
	];
}

/**
 * StepHeading is one step of the trail's hovercard, drawn as a card's heading:
 * the icon of its kind, its name, or its ID if it has no name, over its kind,
 * with its version at the right of its name and its key or ID at the right of its
 * kind, so that each lines up with the one of the other steps.
 */
function StepHeading({ step: s }: { step: Step }) {
	return (
		<div className="flex gap-3 px-3.5 py-3">
			<Icon name={s.icon} className="mt-px size-5 flex-none text-cluster" />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				{/* A long name is cut short before its version. The row is positioned,
				so that on a screen that is touched the name's link covers the row and
				no more. */}
				<span className="relative flex items-center justify-between gap-6">
					{s.name === undefined ? (
						<span className="min-w-0 truncate font-bold tracking-[0.04em] text-fg uppercase">
							{s.id && <Identifier id={s.id.id} what={s.id.what} />}
						</span>
					) : (
						<NameLink
							href={s.href}
							className="font-bold tracking-[0.04em] text-fg uppercase"
						>
							<span className="min-w-0 truncate">{s.name}</span>
						</NameLink>
					)}
					{s.version !== undefined && (
						<span className="flex-none rounded-full bg-sunk px-2 py-0.5 text-2xs font-medium text-fg-soft tabular-nums">
							{s.version}
						</span>
					)}
				</span>
				<span className="flex items-center justify-between gap-6">
					<span className="text-2xs font-semibold tracking-[0.08em] text-muted uppercase">
						{s.kind}
					</span>
					{s.name !== undefined && s.id !== undefined && (
						<span className="text-xs text-fg-soft tabular-nums">
							<Identifier id={s.id.id} what={s.id.what} />
						</span>
					)}
				</span>
			</div>
		</div>
	);
}
