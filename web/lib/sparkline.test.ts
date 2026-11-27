import { expect, test } from "vitest";
import { overview } from "../fixtures/overview.ts";
import { golden } from "../fixtures/prototype-golden.ts";
import type { Chart } from "../model.ts";
import { heightOf, isIdle, sparklineGeometry, valueAt } from "./sparkline.ts";

const [account, schedule, mailer, balances] = overview.handlers;

test.each([
	["events", overview.events.history, golden.lines.events],
	["queues", overview.queues.history, golden.lines.queues],
	["account", account?.history, golden.lines.account],
	["statement-schedule", schedule?.history, golden.lines.statementSchedule],
	["mailer", mailer?.history, golden.lines.mailer],
	["balances", balances?.history, golden.lines.balances],
])("the %s chart's line is what the prototype drew", (_, chart, line) => {
	expect(chart).toBeDefined();
	expect(sparklineGeometry(chart as Chart)?.line).toBe(line);
});

test("the area is the line, closed along the bottom of the chart", () => {
	const line = golden.lines.events;
	const startX = line.match(/^M(\S+)/)?.[1];

	expect(sparklineGeometry(overview.events.history)?.area).toBe(
		`${line} L340.00 48 L${startX} 48 Z`,
	);
});

test("a chart that has no points has no geometry", () => {
	expect(sparklineGeometry({ end: 0, points: [] })).toBeUndefined();
});

test("the largest value reaches the top, and zero the bottom", () => {
	const geometry = sparklineGeometry({
		end: 0,
		points: [
			{ at: -60_000, value: 0 },
			{ at: -30_000, value: 5 },
			{ at: 0, value: 0 },
		],
	});

	expect(geometry?.line).toBe(
		"M0.00 46.00 L120.00 2.00 L240.00 46.00 L300.00 46.00",
	);
});

test("a chart of zeros is flat at the bottom", () => {
	const geometry = sparklineGeometry({
		end: 0,
		points: [
			{ at: -60_000, value: 0 },
			{ at: 0, value: 0 },
		],
	});

	expect(geometry?.line).toBe("M0.00 46.00 L240.00 46.00 L300.00 46.00");
});

test("a chart whose points begin inside the window has a lead-in", () => {
	const geometry = sparklineGeometry({
		end: 0,
		points: [
			{ at: -30_000, value: 1 },
			{ at: 0, value: 1 },
		],
	});

	expect(geometry?.leadIn).toEqual({ from: 60, to: 120 });
	expect(geometry?.line).toBe(
		"M60.00 2.00 L120.00 2.00 L240.00 2.00 L300.00 2.00",
	);
	expect(geometry?.area).toBe(
		"M60.00 2.00 L120.00 2.00 L240.00 2.00 L300.00 2.00 L300.00 48 L60.00 48 Z",
	);
});

test("a chart whose points fill the window has no lead-in", () => {
	expect(sparklineGeometry(overview.events.history)?.leadIn).toBeUndefined();
});

test("a point after the chart's end is beyond its right-hand edge", () => {
	const geometry = sparklineGeometry({
		end: 0,
		points: [
			{ at: -60_000, value: 1 },
			{ at: 10_000, value: 1 },
		],
	});

	expect(geometry?.line).toBe("M0.00 2.00 L280.00 2.00 L340.00 2.00");
});

test("a chart has the value of the line between its points at a time", () => {
	const chart: Chart = {
		end: 0,
		points: [
			{ at: -40_000, value: 10 },
			{ at: -20_000, value: 30 },
			{ at: -10_000, value: 30 },
		],
	};

	expect(valueAt(chart, -30_000)).toBe(20);
	expect(valueAt(chart, -20_000)).toBe(30);
	expect(valueAt(chart, -5_000)).toBe(30);
});

test("a chart has no value before its first point", () => {
	const chart: Chart = { end: 0, points: [{ at: -20_000, value: 10 }] };

	expect(valueAt(chart, -30_000)).toBeUndefined();
	expect(valueAt({ end: 0, points: [] }, 0)).toBeUndefined();
});

test("the largest value of a chart is drawn at its top, and nothing at its bottom", () => {
	const chart: Chart = {
		end: 0,
		points: [
			{ at: -20_000, value: 0 },
			{ at: -10_000, value: 50 },
		],
	};

	expect(heightOf(chart, 50)).toBeCloseTo(46 / 48);
	expect(heightOf(chart, 0)).toBeCloseTo(2 / 48);
});

/** A chart that ends at 0, of the values given, one a second, the last at 0. */
const chartOf = (values: number[]): Chart => ({
	end: 0,
	points: values.map((value, i) => ({
		at: (i - values.length + 1) * 1000,
		value,
	})),
});

test("a chart that has been at zero for the whole of its window is idle", () => {
	expect(isIdle(chartOf(Array(61).fill(0)))).toBe(true);
});

test("a chart with a value above zero in its window isn't idle", () => {
	const values = Array(61).fill(0);
	values[30] = 1;
	expect(isIdle(chartOf(values))).toBe(false);
});

test("a chart whose line enters its window from above zero isn't idle", () => {
	expect(isIdle(chartOf([1, ...Array(60).fill(0)]))).toBe(false);
});

test("a chart that has been at zero since a time before its window is idle", () => {
	expect(isIdle(chartOf([5, 0, ...Array(60).fill(0)]))).toBe(true);
});

test("a chart that has been recorded for less than its window isn't idle", () => {
	expect(isIdle(chartOf(Array(30).fill(0)))).toBe(false);
});
