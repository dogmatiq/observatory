import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Distrusted } from "../lib/distrust.tsx";
import { Figure, glitchTime, keepTime } from "./Figure.tsx";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

test("a figure that is known is its text", () => {
	const { container } = render(<Figure number={347} format={String} />);

	expect(container.innerHTML).toBe("347");
});

test("a figure that has never been known is a zero with no trust, that is not available", () => {
	render(<Figure number={undefined} format={String} />);

	const zero = screen.getByRole("img", { name: "not available" });
	expect(zero.textContent).toBe("0");
	expect(zero.className).toContain("distrust-");
});

test("a figure that is lost keeps its text in the same font, and loses trust over the time that it is kept", () => {
	const { container, rerender } = render(
		<Figure number={347} format={String} />,
	);

	rerender(<Figure number={undefined} format={String} />);

	const lost = container.querySelector("span");
	expect(lost?.textContent).toBe("347");
	expect(lost?.className).toContain("distrust-");
	expect(lost?.className).toContain("animate-[distrust_");
	expect(lost?.style.animationDuration).toBe(`${keepTime}ms`);
});

test("a lost zero is not the zero of a figure that has never been known", () => {
	const { container, rerender } = render(<Figure number={0} format={String} />);
	rerender(<Figure number={undefined} format={String} />);

	expect(container.textContent).toBe("0");
	expect(screen.queryByRole("img", { name: "not available" })).toBeNull();
});

test("a figure that has been lost for a minute is a zero with no trust", () => {
	const { rerender } = render(<Figure number={347} format={String} />);
	rerender(<Figure number={undefined} format={String} />);

	act(() => {
		vi.advanceTimersByTime(keepTime + 1);
	});
	act(() => {
		vi.advanceTimersByTime(1000);
	});

	expect(screen.getByRole("img", { name: "not available" }).textContent).toBe(
		"0",
	);
});

test("a figure that has been lost for a minute ramps down to its zero, and doesn't skip", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const { container, rerender } = render(
		<Figure number={12} format={String} />,
	);
	rerender(<Figure number={undefined} format={String} />);

	act(() => {
		vi.advanceTimersByTime(keepTime + 1);
	});
	const seen = [container.textContent];
	for (let t = 0; t < 600; t += 16) {
		act(() => {
			vi.advanceTimersByTime(16);
		});
		seen.push(container.textContent);
	}

	expect([...new Set(seen)]).toEqual(
		["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0"].filter(
			(v) => seen.includes(v),
		),
	);
	expect(seen.at(0)).toBe("12");
	expect(seen.at(-1)).toBe("0");
	expect(new Set(seen).size).toBeGreaterThan(5);
	vi.unstubAllGlobals();
});

test("a figure that is lost glitches in the last of the time that it is kept, and not before", () => {
	const { container, rerender } = render(
		<Figure number={347} format={String} />,
	);
	rerender(<Figure number={undefined} format={String} />);

	act(() => {
		vi.advanceTimersByTime(keepTime - glitchTime - 1);
	});
	expect(container.querySelector(".glitch")).toBeNull();

	act(() => {
		vi.advanceTimersByTime(2);
	});
	expect(container.querySelector(".glitch")?.textContent).toBe("347347347");

	act(() => {
		vi.advanceTimersByTime(glitchTime);
	});
	expect(container.querySelector(".glitch")).toBeNull();
});

test("a figure that has never been known doesn't glitch", () => {
	const { container } = render(<Figure number={undefined} format={String} />);

	act(() => {
		vi.advanceTimersByTime(keepTime);
	});

	expect(container.querySelector(".glitch")).toBeNull();
});

test("a figure that is kept for less time glitches at the end of it, and ramps down when it is up", () => {
	const { container, rerender } = render(
		<Figure number={30} format={String} keep={1000} />,
	);
	rerender(<Figure number={undefined} format={String} keep={1000} />);

	act(() => {
		vi.advanceTimersByTime(600);
	});
	expect(container.querySelector(".glitch")).not.toBeNull();

	act(() => {
		vi.advanceTimersByTime(500);
	});
	act(() => {
		vi.advanceTimersByTime(1000);
	});
	expect(screen.getByRole("img", { name: "not available" }).textContent).toBe(
		"0",
	);
});

test("a lost figure's zero has the color of the text while it ramps down, and fades to muted when it is there", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const { rerender } = render(<Figure number={12} format={String} />);
	rerender(<Figure number={undefined} format={String} />);

	act(() => {
		vi.advanceTimersByTime(keepTime + 1);
	});
	act(() => {
		vi.advanceTimersByTime(100);
	});
	const ramping = screen.getByRole("img", { name: "not available" });
	expect(ramping.textContent).not.toBe("0");
	expect(ramping.className).not.toContain("text-muted");
	expect(ramping.className).toContain("transition-colors");

	act(() => {
		vi.advanceTimersByTime(1000);
	});
	expect(
		screen.getByRole("img", { name: "not available" }).className,
	).toContain("text-muted");
	vi.unstubAllGlobals();
});

test("a figure that comes back gets its trust back, and then is only its text", () => {
	const { container, rerender } = render(
		<Figure number={347} format={String} />,
	);
	rerender(<Figure number={undefined} format={String} />);

	rerender(<Figure number={351} format={String} />);
	const settling = container.querySelector("span");
	expect(settling?.className).toContain("distrust-");
	expect(settling?.style.getPropertyValue("--distrust")).toBe("0");

	act(() => {
		vi.advanceTimersByTime(1000);
	});
	expect(container.innerHTML).toBe("351");
});

test("a figure of a cluster that goes down is the same as one on a page that loads with the cluster down", () => {
	const loaded = render(
		<Distrusted value>
			<Figure number={undefined} format={String} />
		</Distrusted>,
	);
	const expected = loaded.container.innerHTML;
	loaded.unmount();

	const { container, rerender } = render(
		<Distrusted value={false}>
			<Figure number={347} format={String} />
		</Distrusted>,
	);

	rerender(
		<Distrusted value>
			<Figure number={undefined} format={String} />
		</Distrusted>,
	);

	// It ramps down to the zero, and doesn't keep the number for a minute.
	act(() => {
		vi.advanceTimersByTime(5000);
	});

	expect(container.innerHTML).toBe(expected);
});
