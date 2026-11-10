/**
 * Theme bootstrap rows for the browser's pre-application interval.
 *
 * A host that serves the Vite shell can prepend these rows to the document:
 * the style colors the canvas before first paint and the body script installs
 * the resolved palette attributes before the application mounts. Values come
 * from the generated token sheet; the one duplicated value is the canvas
 * fallback used before that sheet has parsed (CSS cannot read a variable it
 * has not loaded yet).
 */
import {
  DEFAULT_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_SOURCE_ATTRIBUTE,
  type ThemePreference,
} from "./theme-settings";

/** One host-side document injection row. */
export interface BootInjection {
  /** Row type. */
  kind: "style" | "script";
  /** Script placement; styles always go in the head. */
  placement?: "head" | "body";
  /** Inline row text. */
  text: string;
}

/**
 * Canvas fallback mirroring `--background` in `theme.generated.css` in this package.
 * Used only until that variable is defined by the token sheet.
 */
export const BOOT_CANVAS_FALLBACK = "#f3efe4";

/**
 * CSS that colors the document canvas before any script executes.
 * @param preference - stored preference (`system` adds the media override).
 * @returns the head style text.
 */
export function bootThemeStyle(preference: ThemePreference): string {
  const light = `:root{color-scheme:light}body{background-color:var(--background, ${BOOT_CANVAS_FALLBACK})}`;
  const dark = `:root{color-scheme:dark}body{background-color:var(--background, ${BOOT_CANVAS_FALLBACK})}`;
  if (preference === "light") return light;
  if (preference === "dark") return dark;
  return `${light}@media(prefers-color-scheme:dark){${dark}}`;
}

/**
 * Build the body script that installs the resolved palette attributes.
 * @param preference - stored preference.
 * @returns the body script text.
 */
export function bootThemeScript(preference: ThemePreference): string {
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = preference === 'dark' || systemDark ? 'dark' : 'light'
  document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)}, resolved)
  document.documentElement.setAttribute(${JSON.stringify(THEME_SOURCE_ATTRIBUTE)}, preference)
  document.documentElement.style.setProperty('color-scheme', resolved)
})()`;
}

/**
 * Theme bootstrap rows: head CSS colors the document canvas before first
 * paint, then the body script installs the palette attributes before the
 * application mounts.
 * @param preference - stored preference.
 * @returns head style and body script rows in execution order.
 */
export function bootThemeInjections(
  preference: ThemePreference = DEFAULT_PREFERENCE,
): BootInjection[] {
  return [
    { kind: "style", text: bootThemeStyle(preference) },
    { kind: "script", placement: "body", text: bootThemeScript(preference) },
  ];
}
