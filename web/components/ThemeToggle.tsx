import { useState } from "react";
import {
	applyThemeMode,
	nextThemeMode,
	storedThemeMode,
	type ThemeMode,
} from "../lib/theme.ts";

/**
 * ThemeToggle is the button that cycles the page through automatic, light and
 * dark colors. The choice is kept in this browser only, and applies the next
 * time the page opens too.
 */
export function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>(storedThemeMode);

	function cycle() {
		const next = nextThemeMode(mode);
		applyThemeMode(next);
		setMode(next);
	}

	const title = `Color mode: ${mode === "auto" ? "automatic" : mode}`;

	return (
		<button
			type="button"
			className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-line bg-panel px-[9px] py-[5px] text-xs text-fg-soft hover:border-line-strong"
			title={title}
			aria-label={title}
			onClick={cycle}
		>
			<svg
				viewBox="0 0 24 24"
				className="size-3.5 fill-current stroke-current [stroke-width:2]"
				aria-hidden="true"
			>
				<circle className="fill-none" cx="12" cy="12" r="9" />
				<path d="M12 3a9 9 0 0 0 0 18z" />
			</svg>
			<span>{mode}</span>
		</button>
	);
}
