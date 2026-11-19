import { expect, test } from "vitest";
import {
	burstTime,
	flatlineAt,
	frameAt,
	sightingAt,
	sightingFrameAt,
} from "./flatline.ts";

/** A sequence of numbers from 0 up to 1 that is the same each time. */
function seeded(seed: number): () => number {
	let state = seed;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

test("the line is quiet until its first burst, which is after at least six seconds and at most twelve", () => {
	for (const random of [0, 0.5, 0.999999]) {
		const line = flatlineAt(0, () => random);
		expect(line.burstStart).toBeGreaterThanOrEqual(6000);
		expect(line.burstStart).toBeLessThanOrEqual(12000);
	}

	const line = flatlineAt(0, () => 0);
	expect(frameAt(line, 5999, () => 0)).toEqual({});
	expect(frameAt(line, 6000, () => 0).burst).toBe(0);
});

test("a burst runs through once, and the lens begins to scan as it ends", () => {
	const random = seeded(1);
	const line = flatlineAt(0, () => 0);

	expect(frameAt(line, 6000 + burstTime / 2, random).burst).toBeCloseTo(0.5);
	expect(frameAt(line, 6000 + burstTime / 2, random).scan).toBeUndefined();

	const after = frameAt(line, 6000 + burstTime + 1, random);
	expect(after.burst).toBeUndefined();
	expect(after.scan).toBeDefined();
});

test("the lens stays on the line, fades in and out, and goes back and forth at different speeds", () => {
	const random = seeded(7);
	const line = flatlineAt(0, () => 0);
	const start = 6000 + burstTime;

	const places: number[] = [];
	let strongest = 0;
	let scanning = 0;
	for (let time = start; time < start + 60000; time += 20) {
		const frame = frameAt(line, time, random);
		if (frame.scan === undefined) {
			// The first scan is over.
			if (places.length > 0) {
				break;
			}
			continue;
		}

		scanning = time - start;
		places.push(frame.scan.place);
		expect(frame.scan.place).toBeGreaterThanOrEqual(0);
		expect(frame.scan.place).toBeLessThanOrEqual(1);
		expect(frame.scan.strength).toBeGreaterThanOrEqual(0);
		expect(frame.scan.strength).toBeLessThanOrEqual(1);
		strongest = Math.max(strongest, frame.scan.strength);
	}

	// It scans for a good while, and not for ever.
	expect(scanning).toBeGreaterThan(9000);
	expect(scanning).toBeLessThan(40000);
	expect(strongest).toBe(1);

	// It reverses: the moves do not all go one way.
	const steps = places.slice(1).map((p, i) => p - (places[i] as number));
	expect(steps.some((s) => s > 0.001)).toBe(true);
	expect(steps.some((s) => s < -0.001)).toBe(true);

	// Its speeds differ.
	const speeds = steps.map(Math.abs).filter((s) => s > 0.0005);
	expect(Math.max(...speeds) / Math.min(...speeds)).toBeGreaterThan(3);
});

test("the lens gets bigger and smaller as it scans, within bounds, and without jumping", () => {
	const random = seeded(11);
	const line = flatlineAt(0, () => 0);
	const start = 6000 + burstTime;

	const sizes: number[] = [];
	for (let time = start; time < start + 8000; time += 20) {
		const size = frameAt(line, time, random).scan?.size;
		expect(size).toBeDefined();
		sizes.push(size as number);
	}

	expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.6);
	expect(Math.max(...sizes)).toBeLessThanOrEqual(1.5);
	expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(0.2);
	for (let i = 1; i < sizes.length; i++) {
		expect(
			Math.abs((sizes[i] as number) - (sizes[i - 1] as number)),
		).toBeLessThan(0.05);
	}
});

test("when the lens gives up, it stays where it is and fades over its last two and a half seconds, and loses its focus as it goes", () => {
	const random = seeded(3);
	const line = flatlineAt(0, () => 0);
	const start = 6000 + burstTime;

	// Run the scan to its end.
	frameAt(line, start + 1000, random);
	const end = line.scan?.end ?? NaN;
	expect(end).toBeGreaterThan(start);

	const at = (ms: number) => frameAt(line, end - ms, random).scan;
	const steady = at(4000);
	const giving = [2000, 1500, 1000, 500, 100].map((ms) => at(ms));

	// It doesn't move sideways, or change its size, while it gives up.
	const stopped = at(2500);
	for (const frame of giving) {
		expect(frame?.place).toBe(stopped?.place);
		expect(frame?.size).toBe(stopped?.size);
	}

	expect(steady?.strength).toBe(1);
	for (let i = 0; i < giving.length; i++) {
		const previous = i === 0 ? steady : giving[i - 1];
		expect(giving[i]?.strength).toBeLessThan(previous?.strength ?? 0);
		expect(giving[i]?.focus).toBeLessThan(previous?.focus ?? 0);
	}
});

test("after a scan the line is quiet again for at least three seconds, and then there is another burst", () => {
	const random = seeded(3);
	const line = flatlineAt(0, () => 0);

	let end = 0;
	for (let t = 6000; t < 90000; t += 20) {
		const frame = frameAt(line, t, random);
		if (frame.scan !== undefined) {
			end = t;
		}
		if (end > 0 && frame.scan === undefined && frame.burst === undefined) {
			break;
		}
	}
	expect(end).toBeGreaterThan(0);

	// The next burst begins no sooner than three seconds after the scan ended.
	expect(line.burstStart - end).toBeGreaterThanOrEqual(2980);
});

test("a line that was not drawn for a long time catches up, and then goes on as usual", () => {
	const random = seeded(5);
	const line = flatlineAt(0, () => 0);

	const frame = frameAt(line, 100_000, random);
	if (frame.scan !== undefined) {
		expect(frame.scan.place).toBeGreaterThanOrEqual(0);
		expect(frame.scan.place).toBeLessThanOrEqual(1);
	}

	// Nothing is left behind in the past: the next burst, or the scan, is now or
	// later.
	expect(
		line.scan !== undefined
			? line.scan.end > 100_000
			: line.burstStart + burstTime > 100_000,
	).toBe(true);
});

test("when the first node comes back there is a burst, then the lens looks to one side and back a little, and finds it and zooms in, and the heartbeat grows out of that place", () => {
	const c = sightingAt(
		{ burstStart: 0, place: 0.1, size: 0.8 },
		1000,
		() => 0.5,
	);
	expect(c.burst).toBe(true);
	expect(c.from).toBe(0.1);

	// It looks away from the edge that it is nearer to, and comes back a little.
	expect(c.via).toBeGreaterThan(c.from + 0.15);
	expect(c.found).toBeLessThan(c.via);
	expect(c.found).toBeGreaterThan(c.from);

	const at = (ms: number) => sightingFrameAt(c, 1000 + ms);

	// First the static, with no lens, and nothing revealed.
	expect(at(0).burst).toBe(0);
	expect(at(burstTime / 2).burst).toBeCloseTo(0.5);
	expect(at(burstTime / 2).scan).toBeUndefined();
	expect(at(burstTime / 2).reveal).toBe(0);

	// Then the lens appears where it was, and moves sideways to look, and has not
	// zoomed in.
	expect(at(500).scan?.place).toBeCloseTo(c.from, 1);
	const looking = [600, 800, 1000].map((ms) => at(ms).scan?.place ?? NaN);
	for (let i = 1; i < looking.length; i++) {
		expect(looking[i]).toBeGreaterThan(looking[i - 1] as number);
	}
	for (const ms of [500, 900, 1300]) {
		expect(at(ms).scan?.zoom).toBe(0);
		expect(at(ms).scan?.size).toBe(0.8);
	}
	expect(at(450 + 900 * 0.55).scan?.place).toBeCloseTo(c.via);

	// Then it comes back a little, finds it, and stays there.
	expect(at(450 + 900).scan?.place).toBeCloseTo(c.found);
	expect(at(450 + 900 + 300).scan?.place).toBe(c.found);
	expect(at(450 + 900 + 300).reveal).toBe(0);

	// It zooms in with a start, goes past where it stops, and comes back.
	const zooms = [100, 250, 400, 650].map((ms) => at(1350 + ms).scan?.zoom ?? 0);
	expect(Math.max(...zooms)).toBeGreaterThan(1.3);
	expect(zooms[3]).toBeLessThan(Math.max(...zooms));
	expect(at(1350 + 650).scan?.zoom).toBeCloseTo(1.3, 1);

	// What it shows resolves from the roughness to a clean heartbeat as it does.
	expect(at(1350).scan?.resolve).toBe(0);
	const resolving = [100, 250, 400, 550].map(
		(ms) => at(1350 + ms).scan?.resolve ?? NaN,
	);
	for (let i = 1; i < resolving.length; i++) {
		expect(resolving[i]).toBeGreaterThan(resolving[i - 1] as number);
	}
	expect(at(1350 + 650).scan?.resolve).toBe(1);

	// Then the heartbeat grows out of that place, and the lens that was there is
	// gone in a moment, as big as it was, and it is over.
	expect(at(2010).scan?.fade).toBeGreaterThan(0);
	expect(at(2010).scan?.size).toBe(0.8);
	expect(at(2500).scan?.fade).toBe(0);
	const revealing = at(2500);
	expect(revealing.reveal).toBeGreaterThan(0);
	expect(revealing.reveal).toBeLessThan(1);
	expect(revealing.done).toBe(false);
	expect(at(3400)).toEqual({ reveal: 1, done: true });
	expect(at(5000)).toEqual({ reveal: 1, done: true });
});

test("when the first node comes back while the lens is scanning, there is no burst, and the lens goes on from where it was", () => {
	const random = seeded(5);
	const line = flatlineAt(0, () => 0);
	const now = 6000 + burstTime + 3000;
	const before = frameAt(line, now, random);
	expect(before.scan).toBeDefined();

	const c = sightingAt(line, now, random);
	expect(c.burst).toBe(false);
	expect(c.from).toBeCloseTo(before.scan?.place ?? NaN);
	expect(c.found).toBe(c.from);

	const first = sightingFrameAt(c, now);
	expect(first.burst).toBeUndefined();
	expect(first.scan?.place).toBeCloseTo(before.scan?.place ?? NaN);
	expect(first.scan?.size).toBeCloseTo(before.scan?.size ?? NaN);
	expect(first.scan?.strength).toBeCloseTo(before.scan?.strength ?? NaN);

	// It finds what it is looking for where it is.
	expect(sightingFrameAt(c, now + 700).scan?.place).toBeCloseTo(
		before.scan?.place ?? NaN,
	);
	expect(sightingFrameAt(c, now + 650 + 1300).done).toBe(true);
});

test("a sighting with no lens to start from begins somewhere on the line, with the usual size", () => {
	const c = sightingAt({ burstStart: 0 }, 0, () => 0.7);
	expect(c.from).toBe(0.7);
	expect(c.fromSize).toBe(1);
});
