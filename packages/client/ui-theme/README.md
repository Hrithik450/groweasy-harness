---
description: "Theme tokens, font faces, and host-side boot palette injection for the browser client."
kind: "package-reference"
---

# @openai-harness/client-ui-theme

## Summary

Owns the browser client's palette entry point and the pre-application
bootstrap. There is no reference-harness palette here: `src/styles/theme.css`
imports this package's `src/styles/theme.generated.css`, so the generated
token sheet stays the single source of truth, and adds the app's font faces
from `public/fonts`.

## Public surface

- `bootThemeInjections(preference)` — head style + body script rows for a
  host that serves the shell. The script installs `data-theme` and
  `data-theme-source` on `<html>` and sets `color-scheme`.
- `bootThemeStyle(preference)` / `bootThemeScript(preference)` — the rows
  individually.
- `THEME_PREFERENCES`, `DEFAULT_PREFERENCE`, `isThemePreference`,
  `resolveThemePreference` — the preference axis.
- `@openai-harness/client-ui-theme/theme.css` — tokens + font faces.

## Notes

- `BOOT_CANVAS_FALLBACK` mirrors `--background` only for the interval before
  the token sheet parses; everything after first paint reads the variable.
- The generated token sheet is currently light-only. Dark preference
  attributes and `color-scheme` are wired, but a dark palette layer does not
  exist yet; adding one belongs to the token sheet, not this package.
- `theme.css` imports the app token sheet by relative path so the workspace
  has one source. A future published build must inline that sheet (the
  package currently has no CSS build step).
