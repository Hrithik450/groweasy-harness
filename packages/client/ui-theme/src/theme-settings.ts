/**
 * Theme preference vocabulary for the browser client.
 *
 * The palette itself lives in `src/styles/theme.css`, which imports the app's
 * generated token sheet — that file is the single source of truth. This
 * module owns only the preference axis and resolution rules.
 */

/** Built-in preferences accepted at the settings boundary. */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

/** Selected palette preference. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Default preference when no stored override exists. */
export const DEFAULT_PREFERENCE: ThemePreference = "system";

/** Root document attribute carrying the resolved palette. */
export const THEME_ATTRIBUTE = "data-theme";

/** Root document attribute carrying the stored preference (including `system`). */
export const THEME_SOURCE_ATTRIBUTE = "data-theme-source";

/**
 * Whether one value is an accepted preference.
 * @param value - candidate value.
 * @returns true for a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/**
 * Resolve a stored preference against the live OS color scheme.
 * @param preference - stored preference.
 * @param systemPrefersDark - whether `prefers-color-scheme: dark` matches.
 * @returns the concrete palette.
 */
export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}
