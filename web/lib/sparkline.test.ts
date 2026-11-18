import { expect, test } from "vitest";
import { overview } from "../fixtures/overview.ts";
import { golden } from "../fixtures/prototype-golden.ts";
import type { Chart } from "../model.ts";
import { sparklineGeometry } from "./sparkline.ts";

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
