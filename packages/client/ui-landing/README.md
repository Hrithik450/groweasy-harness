---
description: "Marketing landing screen for the browser client, registered as the root route entry."
kind: "package-reference"
---

# @openai-harness/client-ui-landing

## Summary

The marketing landing screen, moved out of the Next.js app without changing
its markup or Tailwind classes. The browser half is one Cordis client plugin:
its single `register()` call contributes `LandingPage` into the runtime's
built-in `root` slot, so loading this package makes the screen the
application's root route entry.

## Public surface

- `apply(ctx)` — registers `LandingPage` into the `root` slot.
- `inject` — `['slots']`.
- `LandingPage` — the composite screen (`Header`, hero, sections, `Footer`).
- `LANDING_TITLE` — `"Uno — AI that finds winning ads"`, applied through a
  `document.title` effect when the screen mounts.
- Every section component (`Hero`, `AdSet`, `Ticker`, `Header`, `Footer`, …)
  and the shared `ui.tsx` atoms are exported for composition.

## Fonts and metadata

The package imports no `next/font` and declares no font faces. Font faces and
the `--font-syne`, `--font-space-grotesk`, and `--font-jetbrains-mono`
variables are owned by `@openai-harness/client-ui-theme`; the consuming shell
must load that package's theme entry. The former Next.js `metadata` export is
replaced by the `document.title` effect in `LandingPage`.

## Composition note

`root` is a `single` slot. Load this package in a composition with no other
root occupant (a marketing build). A shell that already contributes a layout
to `root` cannot also load this plugin at the same priority; that build should
host the landing screen through one of the shell's `main` routes instead.

## Boundaries

No `next/*`, `@/components`, `@/lib`, or `@/store` imports; all component
imports inside the package are relative.
