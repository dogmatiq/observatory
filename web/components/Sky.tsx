import {
	type CSSProperties,
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useId,
	useSyncExternalStore,
} from "react";
import { cn } from "../lib/cn.ts";
import { moonPhase } from "../lib/moon.ts";
import { PickedMoonCard } from "./MoonCard.tsx";
import { Popover } from "./Popover.tsx";

/**
 * seeded returns a function that gives the same numbers between 0 and 1, in the
 * same order, for the same seed.
 */
function seeded(seed: string): () => number {
	let state = 2166136261;
	for (const c of seed) {
		state = Math.imul(state ^ c.charCodeAt(0), 16777619);
	}

	return () => {
		state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
		state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
		return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
	};
}

/**
 * A record of the skies of one kind that are drawn at the moment, in the order
 * that they began, so that the one that has been drawn longest can be told, and
 * holds the moon.
 */
function createSkies() {
	const skies = {
		ids: [] as string[],
		listeners: new Set<() => void>(),
		subscribe(listener: () => void) {
			skies.listeners.add(listener);
			return () => skies.listeners.delete(listener);
		},
		change(update: (ids: string[]) => string[]) {
			skies.ids = update(skies.ids);
			for (const l of skies.listeners) {
				l();
			}
		},
	};

	return skies;
}

const allSkies = { night: createSkies(), day: createSkies() };

/** True inside a [MoonHolder]. */
const HeldMoon = createContext(false);

/**
 * MoonHolder makes each sky inside it have the moon, already risen, as a copy of
 * a card whose sky has the moon does, such as the copy that explains the card.
 */
export function MoonHolder({ children }: { children: ReactNode }) {
	return <HeldMoon.Provider value={true}>{children}</HeldMoon.Provider>;
}

/**
 * useHoldsMoon returns whether this sky is the one that has been drawn longest,
 * of the skies of its kind on the page, which is the one that has the moon, or
 * is inside a [MoonHolder].
 */
function useHoldsMoon(kind: "night" | "day"): boolean {
	const id = useId();
	const store = allSkies[kind];
	const held = useContext(HeldMoon);

	useEffect(() => {
		store.change((ids) => [...ids, id]);
		return () => store.change((ids) => ids.filter((i) => i !== id));
	}, [id, store]);

	const first = useSyncExternalStore(store.subscribe, () => store.ids[0]);
	return held || first === id;
}

/**
 * Sky fills the room that a chart would have, along the bottom of a card, when no
 * node reports what the chart is made from, with a scene of hills and a sky that
 * drift sideways very slowly. It is the night in the dark color mode, and the day
 * in the light one.
 *
 * In one sky of the page, which is the one that has been drawn longest, there is
 * the moon in its real phase, and its popover says what phase that is, and why
 * the card has no chart. `missing` says what there are no samples of, as a noun phrase,
 * such as "the rate of events".
 *
 * It is decoration, so it is hidden from assistive technology, and it draws
 * nothing that moves for a viewer who asks for less motion.
 */
export function Sky({
	missing,
	height = 64,
}: {
	missing: string;

	/** The height of the room, in pixels, which is the height of a chart and its margin. */
	height?: number;
}) {
	const random = seeded(useId());
	const night = useHoldsMoon("night");
	const day = useHoldsMoon("day");
	const moon = (holds: boolean, tone: "night" | "day") =>
		holds && <Moon missing={missing} tone={tone} />;

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
			style={{ height }}
		>
			<div className="absolute inset-0 hidden dark:block">
				<Night random={random} moon={moon(night, "night")} />
			</div>
			<div className="absolute inset-0 dark:hidden">
				<Day random={random} moon={moon(day, "day")} />
			</div>
		</div>
	);
}

/**
 * Drift is a layer that scrolls sideways, very slowly, and without a seam: it
 * draws its children twice, side by side, and moves by the width of one.
 */
function Drift({
	seconds,
	children,
}: {
	seconds: number;
	children: ReactNode;
}) {
	return (
		<div
			className="absolute inset-y-0 left-0 flex w-[200%] motion-safe:animate-[scroll_var(--seconds)_linear_infinite]"
			style={{ "--seconds": `${seconds}s` } as CSSProperties}
		>
			<div className="relative h-full w-1/2">{children}</div>
			<div className="relative h-full w-1/2">{children}</div>
		</div>
	);
}

/**
 * The ground: low hills that end where they begin, so that they can scroll
 * without a seam. They are opaque, so that what is behind them is hidden, and
 * are tinted by the color that they are given.
 */
function Ground({ tint }: { tint: string }) {
	const d = "M0 49C14 49 20 43 34 44S54 53 68 50S88 47 100 49V64H0Z";

	return (
		<svg
			aria-hidden="true"
			className="absolute inset-0 size-full"
			viewBox="0 0 100 64"
			preserveAspectRatio="none"
		>
			<path d={d} className="fill-panel" />
			<path d={d} className={tint} />
		</svg>
	);
}

/** A star, at a place given as a share of the width and a number of pixels down. */
function Star({
	x,
	y,
	size,
	opacity,
	twinkle,
}: {
	x: number;
	y: number;
	size: number;
	opacity: number;
	twinkle?: number;
}) {
	return (
		<span
			className={cn(
				"absolute rounded-full bg-current",
				twinkle !== undefined &&
					"motion-safe:animate-[twinkle_var(--twinkle)_ease-in-out_infinite]",
			)}
			style={
				{
					left: `${x}%`,
					top: y,
					width: size,
					height: size,
					opacity,
					animationDelay:
						twinkle === undefined ? undefined : `${-twinkle * 3}s`,
					"--twinkle": twinkle === undefined ? undefined : `${twinkle + 2}s`,
				} as CSSProperties
			}
		/>
	);
}

/** Some stars scattered over the sky above the ground, some of which twinkle. */
function Stars({ random, count }: { random: () => number; count: number }) {
	return Array.from({ length: count }, () => {
		const x = random() * 100;
		const y = random() * 44;
		const bright = random();

		return (
			<Star
				key={x}
				x={x}
				y={y}
				size={bright > 0.85 ? 2 : 1}
				opacity={0.3 + bright * 0.5}
				twinkle={random() > 0.6 ? random() * 3 : undefined}
			/>
		);
	});
}

/**
 * The night sky, for the dark color mode: stars that drift sideways very slowly
 * and twinkle, over hills that drift a little faster, and, in one sky of the page,
 * the moon, which does not move, being far away.
 */
function Night({ random, moon }: { random: () => number; moon: ReactNode }) {
	return (
		<div className="absolute inset-0 text-fg">
			<Drift seconds={900}>
				<Stars random={random} count={16} />
			</Drift>
			{moon}
			<div className="absolute inset-0 text-(--subsystem)">
				<Drift seconds={300}>
					<Ground tint="fill-current opacity-[0.16]" />
				</Drift>
			</div>
		</div>
	);
}

/**
 * The colors of the moon, by the color mode that it is in: a white disc, whose
 * part that the sun doesn't light is dark, and seas and craters that are only just
 * there. In the dark mode the dark part is the sky, with a faint light on it, and
 * in the light mode it is a shade of gray.
 */
const moonColors = {
	night: {
		base: "var(--color-panel)",
		shadow: "#e8ecf5",
		shadowOpacity: 0.12,
		lit: "#ffffff",
		marks: "#8693aa",
	},
	day: {
		base: "#ffffff",
		shadow: "#5d6b86",
		shadowOpacity: 0.5,
		lit: "#ffffff",
		marks: "#8693aa",
	},
};

/**
 * The moon as it is tonight, in its real phase, with its seas and some craters.
 * It rises from behind the hills when it comes to a sky, over half a minute.
 * It is opaque, so that nothing behind it shows through.
 */
function Moon({
	missing,
	tone,
}: {
	missing: string;
	tone: keyof typeof moonColors;
}) {
	const id = useId();
	const colors = moonColors[tone];
	// A copy of a card shows the moon where it already is, without rising.
	const held = useContext(HeldMoon);

	const phase = moonPhase(new Date());
	const waxing = phase <= 0.5;
	const lit = waxing ? phase : 1 - phase;

	// The edge between the lit part and the dark part is half of an ellipse as tall
	// as the moon, which is as wide as the moon at the full and the new moon, and
	// narrows to a straight line at the quarters.
	const r = 12;
	const k = Math.cos(2 * Math.PI * lit);
	const terminator = `A ${Math.abs(k) * r} ${r} 0 0 ${k > 0 ? 0 : 1} 0 ${-r}`;
	const shape = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} ${terminator} Z`;

	// The seas of the moon and a few of its craters, as seen from the Earth.
	const seas = (
		<>
			<path d="M-7 -7C-4 -9.5 0 -8.5 0 -5.5C0 -3 -4 -2 -7 -3.5C-8.5 -4.5 -8.5 -6 -7 -7Z" />
			<ellipse cx="2.6" cy="-4.6" rx="2.6" ry="2.3" />
			<path d="M3 -0.5C6 -1.5 9 0 8.5 2.2C8 4.2 3.5 3.5 3 -0.5Z" />
			<ellipse cx="9" cy="-2.6" rx="1.7" ry="1.2" />
			<path d="M-10.5 -1C-8.5 -3 -5 -1.5 -5 1.5C-5 4.5 -8.5 5.5 -10.5 3Z" />
			<ellipse cx="-2.4" cy="5.4" rx="2.6" ry="1.7" />
		</>
	);

	return (
		<Popover
			card
			interactive
			content={<PickedMoonCard phase={phase} missing={missing} />}
		>
			<svg
				data-moon=""
				aria-hidden="true"
				className={cn(
					"pointer-events-auto absolute top-[7px] right-[14%] size-[34px] overflow-visible transition-[filter] duration-300 ease-out motion-reduce:transition-none",
					// The moon glows while it is pointed at: white in the night, and a warm
					// light in the day, which a white glow would be lost in.
					tone === "night"
						? "hover:drop-shadow-[0_0_6px_rgb(255_255_255/0.75)]"
						: "hover:drop-shadow-[0_0_6px_rgb(255_214_120/0.95)]",
					!held && "motion-safe:animate-[moonrise_30s_ease-out_both]",
				)}
				viewBox="-15 -15 30 30"
			>
				<defs>
					<clipPath id={`${id}-disc`}>
						<circle r={r} />
					</clipPath>
					<clipPath id={`${id}-lit`}>
						<path d={shape} transform={waxing ? undefined : "scale(-1 1)"} />
					</clipPath>
				</defs>
				<circle r={r} fill={colors.base} />
				<circle r={r} fill={colors.shadow} opacity={colors.shadowOpacity} />
				<path
					d={shape}
					transform={waxing ? undefined : "scale(-1 1)"}
					fill={colors.lit}
				/>
				<g clipPath={`url(#${id}-lit)`} fill={colors.marks}>
					<g opacity="0.16">{seas}</g>
					<g fill="none" stroke={colors.marks} strokeWidth="0.5" opacity="0.14">
						<circle cx="-1" cy="8.6" r="1.1" />
						<circle cx="-4.4" cy="0.6" r="1" />
						<circle cx="6" cy="6" r="1.3" />
						<circle cx="-7" cy="7" r="0.8" />
						<circle cx="10" cy="-6.5" r="0.8" />
						<circle cx="1" cy="1.5" r="0.7" />
					</g>
				</g>
				<g clipPath={`url(#${id}-disc)`} fill={colors.marks} opacity="0.05">
					{seas}
				</g>
			</svg>
		</Popover>
	);
}

/**
 * The sky of a day, for the light color mode: a pale wash of the tile's color that
 * is deepest at the horizon, and, in one sky of the page, the moon, which is up by
 * day as well, with thin cloud in front of it that drifts sideways very slowly,
 * over hills that drift a little faster.
 */
function Day({ random, moon }: { random: () => number; moon: ReactNode }) {
	const clouds = Array.from({ length: 5 }, () => ({
		x: random() * 100,
		y: 6 + random() * 28,
		width: 16 + random() * 20,
	}));

	return (
		<div className="absolute inset-0 text-(--subsystem)">
			<Wash />
			{moon}
			<Drift seconds={500}>
				{clouds.map((c) => (
					<span
						key={c.x}
						className="absolute"
						style={{
							left: `${c.x}%`,
							top: c.y,
							width: `${c.width}%`,
						}}
					>
						{/* The cloud is white, with a shade of the tile's color under it. */}
						<span className="absolute top-[3px] -right-1 -left-1 h-[6px] rounded-[50%] bg-current opacity-[0.12] blur-[3px]" />
						<span className="relative block h-[7px] rounded-[50%] bg-white opacity-[0.85] blur-[2.5px]" />
					</span>
				))}
			</Drift>
			<Drift seconds={300}>
				<Ground tint="fill-current opacity-[0.16]" />
			</Drift>
		</div>
	);
}

/**
 * A wash of the tile's color that is deepest at the horizon, which is the sky of
 * the light color mode.
 */
function Wash() {
	return (
		<div
			className="absolute inset-0 opacity-80"
			style={{
				background:
					"linear-gradient(to top, var(--subsystem-soft), transparent 90%)",
			}}
		/>
	);
}
