---
description: "Slot registry pure core for the browser client: typed ordinary slots, derived props, scopes, and the renderer installation contract."
kind: "package-library"
---

# @openai-harness/client-ui-slots

## Summary

Typed UI extension points for the browser client, ported from the reference
harness's `ui-slots` core. Owners merge their slot contracts into `SlotMap`
and one `register` call contributes a component, an optional child-slot
declaration table, and an optional injected business face. The package is
React-free at runtime (React types only) and has no cordis runtime import
beyond the renderer-host type.

## What is ported

- **Kinds** — `single`, `list`, `keyed`, `chain`, with the reference's
  priority/shadowing rules and chain election semantics.
- **Scopes** — `root`, `session-maybe`, `session`, including standard-source
  bindings, `SessionProvider`, and the adoption/remount rules of optional
  scopes.
- **Props runtime** — `OwnerOf`, `KeyPropsOf`, `PropsRuntime`,
  `ScopeStandardProps`, `ComposedProps`, the `hooks`/`keyedHooks` inject
  face, `hookContext`, and the `matched` chain seat.
- **Ledger** — declaration epochs, microtask-batched registration
  notifications, synchronous declaration notifications, recursive child
  collapse, crash reports with one-shot abdication, and the JSON-safe
  `snapshot()` topology.

## What is intentionally absent

The reference package also carries three layers that depend on packages this
repository does not have yet. They are left out rather than stubbed:

- `StoreDecl` / `defineStore` seats and the `useStore` + `actions` props.
- Reusable Component Factories (`SlotFactoryMap`, `registerFactory`,
  `renderFactorySlot`, `useFactorySlot`).
- Locale namespaces and the `t` standard seat.

Those can be added as additive layers without changing the exported slot
core.

## Use

```ts
declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    "shell.overlay": { kind: "list"; scope: "root" };
  }
}

ctx.slots.register({ name: "shell.overlay", id: "toasts" }, ({ renderSlot }) => (
  <Overlay />
));
```

The renderer service (`@openai-harness/client-ui-renderer`) owns
`ctx.slots` and installs a `SlotRenderer`; this package owns only registration
semantics and the declaration ledger.
