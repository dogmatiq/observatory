/** How long a burst of interference lasts, in milliseconds. */
export const burstTime = 450;

/**
 * The shortest and the longest quiet time before the first burst, and between a
 * scan and the next burst, in milliseconds.
 */
const firstQuiet = { shortest: 6000, longest: 12000 };
const quiet = { shortest: 3000, longest: 8000 };

/**
 * Leg is one move of the lens while it scans: from one place on the line to
 * another, between two times in milliseconds. A leg that stays in one place is a
 * pause.
 */
interface Leg {
	from: number;
	to: number;

	/** How big the lens is at the start and at the end of the leg. */
	sizes: readonly [number, number];
	start: number;
	end: number;
}

/** Scan is the lens sweeping the line, after a burst of interference. */
interface Scan {
	start: number;
	end: number;
	legs: Leg[];
}

/**
 * Flatline is what the flat line of a cluster with no live node remembers between
 * frames: when its next burst of interference starts, and, after a burst, the scan
 * that follows it.
 */
export interface Flatline {
	burstStart: number;
	scan?: Scan;

	/** Where the lens was last, as a share of the way across the line. */
	place?: number;

	/** How big the lens was last, as a multiple of its usual size. */
	size?: number;

	/** How bright the lens was last, from 0 to 1. */
	strength?: number;
}

/**
 * flatlineAt returns the flat line as it begins, at the time `now` in
 * milliseconds. It is quiet for a while before its first burst. `random` gives
 * numbers from 0 up to 1.
 */
export function flatlineAt(
	now: number,
	random: () => number = Math.random,
): Flatline {
	return {
		burstStart:
			now +
			firstQuiet.shortest +
			random() * (firstQuiet.longest - firstQuiet.shortest),
	};
}

/**
 * randomSize returns how big the lens is, as a multiple of its usual size, as it
 * is while it scans: it gets bigger and smaller as it goes, as a lens does that is
 * being adjusted.
 */
function randomSize(random: () => number): number {
	return 0.6 + random() * 0.9;
}

function quietTime(random: () => number): number {
	return quiet.shortest + random() * (quiet.longest - quiet.shortest);
}

/**
 * newScan returns a scan that begins at `start`: a lens that darts about the
 * line at different speeds, slow creeps and quick runs, to and fro, with pauses,
 * as if searching for something in the dark. Where it goes, and how fast, are
 * chosen at random.
 */
function newScan(start: number, random: () => number): Scan {
	const legs: Leg[] = [];
	let place = random();
	let size = randomSize(random);
	let time = start;

	for (let i = 9 + Math.floor(random() * 8); i > 0; i--) {
		if (random() < 0.3) {
			// A pause, to listen.
			const end = time + 400 + random() * 900;
			legs.push({
				from: place,
				to: place,
				sizes: [size, size],
				start: time,
				end,
			});
			time = end;
			continue;
		}

		// A move to or fro, of some distance, at a speed that is mostly slow.
		const direction = random() < 0.5 ? -1 : 1;
		const target = Math.min(
			1,
			Math.max(0, place + direction * (0.15 + random() * 0.5)),
		);
		const speed = 0.1 + random() * random() * 1.4;
		const end = time + Math.max(250, (Math.abs(target - place) / speed) * 1000);
		const next = randomSize(random);
		legs.push({
			from: place,
			to: target,
			sizes: [size, next],
			start: time,
			end,
		});
		place = target;
		size = next;
		time = end;
	}

	return { start, end: time, legs };
}

/**
 * Frame is how the flat line looks at one moment: how far a burst of interference
 * is through, from 0 to 1, if there is one, and, while the lens scans, where
 * it is, as a share of the way across the line, and how bright it is, from 0 to 1.
 */
export interface Frame {
	burst?: number;
	scan?: Lens;
}

/**
 * Lens is how the lens looks at one moment: where it is, as a share of the way
 * across the line, how bright it is, from 0 to 1, how big it is, as a multiple of its
 * usual size, which is 1 unless it says otherwise, how well it is in focus, from 0,
 * when what it shows is soft, to 1, which it is unless it says otherwise, how far it
 * has zoomed in, from 0, when it has not, to 1 and more, when what it shows is
 * greatly magnified, and how much of its brightness is left, from 0 to 1, which it
 * is unless it says otherwise, as it fades without getting any smaller, and how far
 * the roughness that it shows has resolved into a clean heartbeat, from 0 to 1, which
 * it has not unless it says otherwise.
 */
export interface Lens {
	place: number;
	strength: number;
	size?: number;
	focus?: number;
	zoom?: number;
	fade?: number;
	resolve?: number;
}

/** How well the lens is in focus while it scans: what it shows is a little soft. */
const scanFocus = 0.7;

/** How long the lens takes to appear and to fade away, in milliseconds. */
const appears = 300;
const fades = 2500;

/**
 * frameAt returns how the flat line looks at the time `now`. It moves the line
 * on: after a burst the lens scans, then the line is quiet again, until the
 * next burst.
 */
export function frameAt(
	line: Flatline,
	now: number,
	random: () => number = Math.random,
): Frame {
	// A page that has not drawn for a while, such as one in another tab, catches up.
	for (;;) {
		if (line.scan === undefined) {
			if (now < line.burstStart + burstTime) {
				break;
			}
			line.scan = newScan(line.burstStart + burstTime, random);
		}

		if (now < line.scan.end) {
			break;
		}

		line.burstStart = line.scan.end + quietTime(random);
		line.scan = undefined;
	}

	const scan = line.scan;
	if (scan === undefined) {
		const through = (now - line.burstStart) / burstTime;
		return { burst: through >= 0 ? through : undefined };
	}

	// The lens stops moving when it begins to give up, and then only shrinks, where
	// it is, as of a sigh.
	const moving = Math.max(scan.start, Math.min(now, scan.end - fades));

	const leg = scan.legs.find((l) => moving < l.end) as Leg;
	const u = Math.min(
		1,
		Math.max(0, (moving - leg.start) / (leg.end - leg.start)),
	);
	const eased = u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;

	// A pause is not quite still.
	const wobble = leg.from === leg.to ? 0.006 * Math.sin(moving / 90) : 0;

	const place = Math.min(
		1,
		Math.max(0, leg.from + (leg.to - leg.from) * eased + wobble),
	);
	line.place = place;

	const size = leg.sizes[0] + (leg.sizes[1] - leg.sizes[0]) * eased;
	line.size = size;

	const strength = Math.min(
		1,
		(now - scan.start) / appears,
		(scan.end - now) / fades,
	);
	line.strength = strength;

	// A lens that is giving up loses its focus, as it shrinks, and a lens that is
	// appearing gains it.
	return {
		scan: {
			place,
			size,
			strength,
			focus: scanFocus * (0.35 + 0.65 * strength),
		},
	};
}

/**
 * Sighting is the end of the scan, when the first node of a cluster that had none
 * comes back: the lens finds it, comes into focus and zooms in there, and the
 * heartbeat grows out of that place, as of something found.
 *
 * If the lens was scanning, it finds it where it is, with no static. If it was not,
 * there is first a burst of interference, as of static, the lens appears, and it
 * moves sideways, to one side and back a little, before it finds it.
 */
export interface Sighting {
	start: number;

	/** Whether there is a burst of interference and a search first. */
	burst: boolean;

	/** Where the lens was when the node came back. */
	from: number;

	/** Where it goes first, if there is a search. */
	via: number;

	/** Where it finds it, which is where the heartbeat grows out of. */
	found: number;

	/** How big it was, as a multiple of its usual size. */
	fromSize: number;

	/** How bright it was, from 0 to 1. */
	fromStrength: number;
}

/**
 * sightingAt returns the sighting that begins at the time `now`, with the lens
 * where `line` last had it, or somewhere on the line if it had none.
 */
export function sightingAt(
	line: Flatline,
	now: number,
	random: () => number = Math.random,
): Sighting {
	const scanning =
		line.scan !== undefined && now >= line.scan.start && now < line.scan.end;

	const from = line.place ?? random();
	const base = {
		start: now,
		burst: !scanning,
		from,
		fromSize: line.size ?? 1,
		fromStrength: scanning ? (line.strength ?? 1) : 0,
	};

	if (scanning) {
		return { ...base, via: from, found: from };
	}

	// It looks to one side, which is away from the nearer edge, and then comes back
	// a little, and finds it there.
	const direction = from < 0.5 ? 1 : -1;
	const clamp = (n: number) => Math.min(0.95, Math.max(0.05, n));
	const via = clamp(from + direction * (0.15 + random() * 0.15));
	const found = clamp(via - direction * (0.04 + random() * 0.08));

	return { ...base, via, found };
}

/** The parts of a sighting, in milliseconds from its start. */
const sightingTimes = {
	burst: burstTime,
	search: 900,
	zoom: 650,
	reveal: 1300,
};

/**
 * SightingFrame is how a sighting looks at one moment: how far a burst of
 * interference is through, if there is one, how the lens looks, how much of the
 * wave of the heartbeat has spread from the place of the lens, from 0 to 1, and
 * whether the sighting is over.
 */
export interface SightingFrame {
	burst?: number;
	scan?: Lens;
	reveal: number;
	done: boolean;
}

/** smoothly eases from 0 to 1 as `t` goes from 0 to 1, and stays at either end. */
function smoothly(t: number): number {
	const u = Math.min(1, Math.max(0, t));
	return u * u * (3 - 2 * u);
}

/** easeOutBack eases from 0 to 1, going past 1 a little on the way. */
function easeOutBack(t: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return t <= 0 ? 0 : t >= 1 ? 1 : 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** sightingFrameAt returns how the sighting looks at the time `now`. */
export function sightingFrameAt(c: Sighting, now: number): SightingFrame {
	const t = now - c.start;
	const lead = c.burst ? sightingTimes.burst : 0;
	const searched = lead + (c.burst ? sightingTimes.search : 0);
	const zoomed = searched + sightingTimes.zoom;
	const end = zoomed + sightingTimes.reveal;

	if (t >= end) {
		return { reveal: 1, done: true };
	}

	if (t < lead) {
		return { burst: t / lead, reveal: 0, done: false };
	}

	// The heartbeat is released as the lens finds it, and the lens is gone almost
	// at once.
	const reveal = Math.min(1, Math.max(0, (t - zoomed) / sightingTimes.reveal));

	// Where the lens is: it looks to one side, and then back a little, and has
	// found it, where it stays.
	let place = c.found;
	if (t < searched) {
		const ease = (n: number) =>
			n < 0.5 ? 2 * n * n : 1 - (-2 * n + 2) ** 2 / 2;
		const s = (t - lead) / sightingTimes.search;
		place =
			s < 0.55
				? c.from + (c.via - c.from) * ease(s / 0.55)
				: c.via + (c.found - c.via) * ease((s - 0.55) / 0.45);
	}

	// The lens comes into focus, and zooms in with a start, going past where it
	// stops and coming back: it has found it.
	const u = Math.min(1, Math.max(0, (t - searched) / sightingTimes.zoom));

	return {
		scan: {
			place,
			strength: Math.min(1, c.fromStrength + (t - lead) / 250),
			size: c.fromSize,

			// It gains clarity as it zooms in: what it shows was a little soft, and is
			// sharp.
			focus: scanFocus + (1 - scanFocus) * (u * u * (3 - 2 * u)),

			// What it shows resolves from the roughness into a clean heartbeat, which it
			// has done by the time that the zoom is over.
			resolve: smoothly((u - 0.1) / 0.8),

			// It goes on zooming as it goes, and is as big as it was all the while, and
			// fades.
			zoom: 1.3 * easeOutBack(u) + 0.6 * Math.min(1, reveal / 0.15),
			fade: (1 - Math.min(1, reveal / 0.15)) ** 2,
		},
		reveal,
		done: false,
	};
}
