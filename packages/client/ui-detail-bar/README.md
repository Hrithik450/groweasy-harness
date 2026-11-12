---
description: "Right-hand detail bar: the session-bound campaign, creative, and strategist panels registered into the frame's rightbar slot."
kind: "package-reference"
---

# @openai-harness/client-ui-detail-bar

## Summary

The product's right-hand detail bar, moved out of the Next application
unchanged. One Cordis browser plugin registers the bar into the frame's
`rightbar` slot and resolves the current Session's bar type from its slug
(`adManager`, `adCreator`, `adStrategist`, `businessProfile`, `default`).

The UI, its markup, classes, and copy are carried over verbatim. Only module
boundaries changed, and bar data now comes from the session's `detailBar`
projection rather than session `extra` or client-side demo fallbacks.

## Entries

| Entry | Emit | Contents |
|---|---|---|
| `.` | `lib/index.js` | Wire-safe types, constants, and pure helpers (`resolveDetailBarType`, `formatAlertTimestamp`). No React. |
| `./client` | `lib/client.js` | `apply(ctx)`, the registry, the seats, every component, and the browser store/RPC bridge. |

Both entries are flat emits from `tsdown.config.ts`; there is no nested
`client/index` output path.

## Slot

The plugin contributes one entry to the `rightbar` slot:

```ts
export const inject = ["slots"];

ctx.slots.inject("rightbar", () =>
  ctx.slots.register(
    {
      name: "rightbar",
      registrant: "@openai-harness/client-ui-detail-bar",
    },
    DetailBarSeat,
  ),
);
```

The frame owns the slot declaration; this package only injects.
`src/client/slots.ts` loads the frame's `SlotMap` row through a type-only
import from `@openai-harness/client-ui-layout/client`; it does not re-declare
`rightbar`, because a second declaration would conflict with the frame's.

The column's resize/collapse/pull-tab shell lives in the layout frame
(`packages/client/ui-layout/src/client/app-frame.tsx`); this package fills the
seat with the session-bound bar.

## Session and RPC boundary

- Stores come from `@openai-harness/client-ui-session`:
  `useSessionStore` (sessions, streaming), `useSidebarStore`
  (`toggleRightCollapsed`), and the shared `useBusinessProfile` /
  `normalizeDomainOrUrl` hooks.
- Bar data is the `detailBar` projection, read through
  `useSessionProjection` / `useDetailBar` (`ui-session`). The hook seeds from
  `session.projection`, then folds the live journal through
  `sessionProjectionRegistry` — the same definition the server appends with.
- Edits go through `detailBar.update` (`updateSessionDetailBar`); the server
  appends a committed `detailBar/update` event and every open client folds it
  in. There is no second write path.

The RPC client is constructed in `src/client/rpc.ts` from the browser build's
gateway base (`configureDetailBarGateway`, `VITE_GATEWAY_URL`,
`NEXT_PUBLIC_GATEWAY_URL`, default `http://localhost:4000`), matching the
sibling `ui-sidebar` and `ui-modals` packages. Method names, params, and
results are the typed `RpcClient` contract.

## Moved out of the app

- `src/lib/detail.bar/types.ts` → `src/types.ts`
- `src/lib/detail.bar/utils.ts` → `src/utils.ts`
- `src/lib/detail.bar/demo.ts` → `src/client/demo.ts`
- `src/components/detail.bar/registry.ts` → `src/client/registry.ts`
- `src/components/detail.bar/{common,sessions}/**` → `src/client/{common,sessions}/**`

The following small app-only dependencies were copied in (no behavior change):

- `formatAlertTimestamp` → `src/date.ts` (verbatim).
- The two campaign enums and `SESSION_SLUGS` → `src/constants.ts`.
- The `MetaCampaign` subset → `src/types.ts`.

The alert cards keep their chart call site in
`src/client/generative-ui.tsx`. This package installs the real json-render
renderer (`GenerativeUIRenderer` from `@openai-harness/client-ui-generative`)
in its own `apply`, so an alert chart renders with the same unit as a chat
Generative UI block.

## Test

`tests/registry.test.ts` covers type resolution and checks that every session
slug has a registry key. The components themselves are not rendered in this
snapshot.
