/**
 * The color mode of the page: the browser's own preference, or one that the
 * viewer chose.
 */
export type ThemeMode = "auto" | "light" | "dark";

export const themeModes: readonly ThemeMode[] = ["auto", "light", "dark"];

/**
 * The key under which the viewer's choice is kept in the browser's storage. No
 * key means that the viewer has not chosen, so the page follows the browser.
 */
const storageKey = "observatory-theme";

/**
 * storedThemeMode returns the mode that the viewer chose earlier in this
 * browser, or "auto" if they have not, or if storage is unavailable.
 */
export function storedThemeMode(): ThemeMode {
	try {
		const stored = window.localStorage.getItem(storageKey);
		if (stored === "light" || stored === "dark") {
			return stored;
		}
	} catch {
		// Storage is unavailable, so the page follows the browser's preference.
	}

	return "auto";
}

/**
 * applyThemeMode makes the page use the given mode, and keeps it in this
 * browser. The page's stylesheet reads the mode from the `data-theme`
 * attribute of the root element, and follows the browser's preference when the
 * attribute is absent.
 */
export function applyThemeMode(mode: ThemeMode): void {
	if (mode === "auto") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}

	try {
		if (mode === "auto") {
			window.localStorage.removeItem(storageKey);
		} else {
			window.localStorage.setItem(storageKey, mode);
		}
	} catch {
		// Storage is unavailable, so the choice lasts only for this page.
	}
}

/**
 * nextThemeMode returns the mode after the given one, which wraps around.
 */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
	const i = themeModes.indexOf(mode);
	return themeModes[(i + 1) % themeModes.length] as ThemeMode;
}
