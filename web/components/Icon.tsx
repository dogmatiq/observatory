import type { ReactNode, SVGProps } from "react";

/**
 * The names of the icons.
 *
 * An icon stands for a kind of thing in the engine, such as an event or a
 * queue, and its name is the name of that thing, or for an action or a state,
 * such as copying or working.
 */
export type IconName =
	| "aggregate"
	| "alert"
	| "application"
	| "chart"
	| "check"
	| "chevron"
	| "cluster"
	| "command"
	| "copy"
	| "deadline"
	| "engine"
	| "event"
	| "event-stream"
	| "globe"
	| "integration"
	| "message"
	| "minimize-concurrency"
	| "moon"
	| "node"
	| "pin"
	| "process"
	| "projection"
	| "queue"
	| "spinner"
	| "workload";

/** The shape of Lucide's `cpu`, which is the icon of an engine. */
function Cpu() {
	return (
		<>
			<path d="M12 20v2" />
			<path d="M12 2v2" />
			<path d="M17 20v2" />
			<path d="M17 2v2" />
			<path d="M2 12h2" />
			<path d="M2 17h2" />
			<path d="M2 7h2" />
			<path d="M20 12h2" />
			<path d="M20 17h2" />
			<path d="M20 7h2" />
			<path d="M7 20v2" />
			<path d="M7 2v2" />
			<rect x="4" y="4" width="16" height="16" rx="2" />
			<rect x="8" y="8" width="8" height="8" rx="1" />
		</>
	);
}

/**
 * The shapes of the icons, which are from Lucide (https://lucide.dev) 1.64.0,
 * under the ISC license.
 */
const shapes: Record<IconName, ReactNode> = {
	application: (
		<>
			<rect width="7" height="7" x="14" y="3" rx="1" />
			<path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />
		</>
	),
	alert: (
		<>
			<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
			<path d="M12 9v4" />
			<path d="M12 17h.01" />
		</>
	),
	engine: <Cpu />,
	globe: (
		<>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
			<path d="M2 12h20" />
		</>
	),
	pin: (
		<>
			<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
			<circle cx="12" cy="10" r="3" />
		</>
	),
	// The cluster's icon, with the box of one of its members filled.
	node: (
		<>
			<rect x="16" y="16" width="6" height="6" rx="1" />
			<rect x="2" y="16" width="6" height="6" rx="1" fill="currentColor" />
			<rect x="9" y="2" width="6" height="6" rx="1" />
			<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
			<path d="M12 12V8" />
		</>
	),
	check: <path d="M20 6 9 17l-5-5" />,
	chevron: <path d="m9 18 6-6-6-6" />,
	chart: (
		<>
			<path d="M3 3v16a2 2 0 0 0 2 2h16" />
			<path d="m19 9-5 5-4-4-3 3" />
		</>
	),
	moon: (
		<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
	),
	spinner: <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
	copy: (
		<>
			<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
			<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
		</>
	),
	message: (
		<>
			<rect width="20" height="16" x="2" y="4" rx="2" />
			<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
		</>
	),
	cluster: (
		<>
			<rect x="16" y="16" width="6" height="6" rx="1" />
			<rect x="2" y="16" width="6" height="6" rx="1" />
			<rect x="9" y="2" width="6" height="6" rx="1" />
			<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
			<path d="M12 12V8" />
		</>
	),
	// Lucide's "merge", turned to point right: several lanes joining one, as
	// handling many messages at once becomes handling them one at a time.
	"minimize-concurrency": (
		<g transform="rotate(90 12 12)">
			<path d="m8 6 4-4 4 4" />
			<path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22" />
			<path d="m20 22-5-5" />
		</g>
	),
	queue: (
		<>
			<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
			<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
		</>
	),
	command: (
		<>
			<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
			<path d="m21.854 2.147-10.94 10.939" />
		</>
	),
	deadline: (
		<>
			<circle cx="12" cy="13" r="8" />
			<path d="M12 9v4l2 2" />
			<path d="M5 3 2 6" />
			<path d="m22 6-3-3" />
			<path d="M6.38 18.7 4 21" />
			<path d="M17.64 18.67 20 21" />
		</>
	),
	event: (
		<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />
	),
	"event-stream": (
		<>
			<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
			<path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
			<path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
		</>
	),
	aggregate: (
		<>
			<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
			<path d="m3.3 7 8.7 5 8.7-5" />
			<path d="M12 22V12" />
		</>
	),
	// Lucide's `waypoints`: a process moves through its steps, and not always in a
	// line.
	process: (
		<>
			<path d="m10.586 5.414-5.172 5.172" />
			<path d="m18.586 13.414-5.172 5.172" />
			<path d="M6 12h12" />
			<circle cx="12" cy="20" r="2" />
			<circle cx="12" cy="4" r="2" />
			<circle cx="20" cy="12" r="2" />
			<circle cx="4" cy="12" r="2" />
		</>
	),
	integration: (
		<>
			<path d="M12 22v-5" />
			<path d="M15 8V2" />
			<path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" />
			<path d="M9 8V2" />
		</>
	),
	projection: (
		<>
			<ellipse cx="12" cy="5" rx="9" ry="3" />
			<path d="M3 5V19A9 3 0 0 0 21 19V5" />
			<path d="M3 12A9 3 0 0 0 21 12" />
		</>
	),
	workload: (
		<>
			<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
			<rect width="20" height="14" x="2" y="6" rx="2" />
		</>
	),
};

/**
 * Icon draws the icon for a kind of thing. It is decoration, so it is hidden
 * from assistive technology. Its size and color come from the `className`, and
 * it is drawn in the text color by default.
 */
export function Icon({
	name,
	...props
}: { name: IconName } & Omit<SVGProps<SVGSVGElement>, "children">) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			{shapes[name]}
		</svg>
	);
}
