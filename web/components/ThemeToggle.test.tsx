import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ThemeToggle } from "./ThemeToggle.tsx";

beforeEach(() => {
	window.localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
});

afterEach(cleanup);

const button = () => screen.getByRole("button");
const theme = () => document.documentElement.getAttribute("data-theme");

test("it starts as automatic", () => {
	render(<ThemeToggle />);

	expect(button().textContent).toBe("auto");
	expect(button().getAttribute("aria-label")).toBe("Color mode: automatic");
	expect(theme()).toBeNull();
});

test("each press chooses the next mode, and the page follows", () => {
	render(<ThemeToggle />);

	fireEvent.click(button());
	expect(button().textContent).toBe("light");
	expect(button().getAttribute("aria-label")).toBe("Color mode: light");
	expect(theme()).toBe("light");

	fireEvent.click(button());
	expect(button().textContent).toBe("dark");
	expect(theme()).toBe("dark");

	fireEvent.click(button());
	expect(button().textContent).toBe("auto");
	expect(theme()).toBeNull();
});

test("it remembers the choice for the next time the page opens", () => {
	const first = render(<ThemeToggle />);
	fireEvent.click(button());
	fireEvent.click(button());
	first.unmount();

	render(<ThemeToggle />);

	expect(button().textContent).toBe("dark");
	expect(window.localStorage.getItem("observatory-theme")).toBe("dark");
});

test("a choice of automatic is forgotten", () => {
	render(<ThemeToggle />);
	fireEvent.click(button());
	fireEvent.click(button());
	fireEvent.click(button());

	expect(window.localStorage.getItem("observatory-theme")).toBeNull();
});
