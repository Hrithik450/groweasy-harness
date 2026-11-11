---
description: "Browser UI renderer: React bindings for ordinary slots, ctx.slots, ctx.uiRenderer, and the assembled browser application root."
kind: "package-reference"
---

# @openai-harness/client-ui-renderer

## Summary

Mounts the assembled browser client GUI. The boot kernel creates the root
Cordis `Context`, loads this package's `client` entry, then calls
`ctx.uiRenderer.mount(container)`. The renderer installs the React slot
machinery, renders the `root` slot, and returns a disposer that unmounts the
React root.

## Public surface

- `apply(ctx)` — creates `SlotRegistry` (`ctx.slots`), installs
  `createSlotRenderer()`, and provides `ctx.uiRenderer`.
- `SlotRegistry` — the Cordis service over `SlotCore`:
  `register`, `inject`, `install`, `provideRoot`, `installScope`,
  `renderSlot('root')`, `entries`, `entriesOfSlot`, `snapshot`,
  `onEntryError`, `subscribe`, `getVersion`.
- `createSlotRenderer()` — the React outlet machinery. All four kinds,
  scopes, inject hooks, fallback/crash faces, and entry-error abdication are
  ported from the reference.

## Foundation differences

Two behaviors differ from the reference because this shell has no product
layout or session package yet. Both are marked in the source:

1. `renderSlot('root')` no longer throws when the root ledger is empty; the
   root anchor renders empty. A registered-but-fully-abdicated root still
   shows the crash face.
2. `ScopeProvider` publishes an absent binding when no scope adapter is
   installed instead of throwing at the provider. Strict session entries that
   actually render still fail loudly; root and session-maybe entries work.

Store seats, Component Factories, and the locale `t` seat are absent with
their ui-slots counterparts.

The uSES selector bridge is implemented directly over React's
`useSyncExternalStore` (`src/client/bind.ts`) because
`use-sync-external-store` is not a dependency here; the observable contract
and equality semantics are the same.
