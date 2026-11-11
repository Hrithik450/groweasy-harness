---
description: "Business profile screen for the browser client, registered into the keyed main slot."
kind: "package-reference"
---

# @openai-harness/client-ui-profile

## Summary

The business profile screen, moved out of the Next.js app without changing its
markup or Tailwind classes. The browser half is one Cordis client plugin: it
registers `ProfilePage` into the shell's keyed `main` slot under the
`profile` key.

Registration uses `ctx.slots.inject("main", …)`, so the package may load
before or after the layout package that declares the `main` slot. The plugin
also merges the `main` contract into `SlotMap` (`keyed`, `root` scope) for
type checking.

## Public surface

- `apply(ctx)` — waits for `main` to be declared, then registers
  `ProfilePage` under `PROFILE_PANEL_ID`.
- `inject` — `['slots']`.
- `PROFILE_PANEL_ID` — `"profile"`.
- `ProfilePage` — the composite screen (`ProfileHeader`, `ProfileHero`,
  section nav, and the six profile sections).
- `PROFILE_TITLE` — `"Uno — Business profile"`, applied through a
  `document.title` effect when the screen mounts.
- Every section component and the `styles.ts` tokens are exported for
  composition.

## Fonts and metadata

The package imports no `next/font` and declares no font faces. Font faces and
the `--font-syne`, `--font-space-grotesk`, and `--font-jetbrains-mono`
variables are owned by `@openai-harness/client-ui-theme`; the consuming shell
must load that package's theme entry. The former Next.js `metadata` export is
replaced by the `document.title` effect in `ProfilePage`.

## Integration

A layout package must declare `main` as a keyed root-scoped slot, for example:

```ts
ctx.slots.register({
  name: "root",
  children: { main: { kind: "keyed", scope: "root" } },
}, AppFrame);
```

The layout then renders `props.renderSlot("main", { key: selectedKey })`.
Selecting the `profile` key displays this screen.

## Boundaries

No `next/*`, `@/components`, `@/lib`, or `@/store` imports; all component
imports inside the package are relative.
