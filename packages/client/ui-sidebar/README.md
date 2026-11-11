---
description: "Sidebar plugin for the browser client: the app's existing left navigation column, registered into the layout-owned `sidebar` slot."
kind: "package-reference"
---

# @openai-harness/client-ui-sidebar

## Summary

Contributes the app's existing sidebar (markup, Tailwind classes, drag-resize
geometry, mobile drawer, session rows, profile popover, and Google sign-in)
into the root-scoped `sidebar` slot declared by
`@openai-harness/client-ui-layout`. The occupant is browser-only and exposes
no host-side behavior.

## Slot

- **Slot name:** `sidebar` (`single`, `root` scope).
- **Declared by:** `@openai-harness/client-ui-layout` (`AppFrame` renders it
  with `{ initialSessions, initialUser }`).
- **Registered by:** this package through declaration-aware
  `ctx.slots.inject("sidebar", …)`, so plugin load order does not matter.

Optional host bindings may be layered on the layout owner share:
`pathname`, `onNavigate`, `onOpenSettings`, and `onNewSession`. They are
optional; the layout contract is unchanged.

## Next.js API replacements

| App-side (Next) | Package replacement |
| --- | --- |
| `next/link` `<Link href>` | plain `<a href>`; `onNavigate` may intercept for shell/SPA navigation |
| `next/navigation` `usePathname()` | `useRoutePath()` (or the host-supplied `pathname`) reading `window.location.pathname` + `popstate` |
| `window.location.href = "/api/auth/google/login?returnTo=…"` | `googleLoginUrl(returnTo)` on the gateway HTTP origin (`VITE_GATEWAY_URL`, then `NEXT_PUBLIC_GATEWAY_URL`, default `http://localhost:4000`) |

## Data coupling

- Stores come **only** from `@openai-harness/client-ui-session`:
  `useSidebarStore`, `useSessionStore`, `useUserStore`.
- Session actions go through `@openai-harness/client-rpc` using a lazily
  constructed `RpcClient` pointed at the configured gateway base:
  - list: `session.list`
  - new session: `session.create` (then navigate to `/c/<id>`)
  - select: `session.inspect` while the link opens the session
- The host may call `configureGatewayBaseUrl(url)` at any time; the cached
  `RpcClient` is rebuilt when the base changes (`resetSessionRpc()` clears it
  explicitly). Otherwise the base comes from `VITE_GATEWAY_URL` /
  `NEXT_PUBLIC_GATEWAY_URL`, defaulting to `http://localhost:4000`.
- No import of `@/store`, `@/components`, Next, or `@/lib` appears in this
  package.

## `data-sidebar-*` sync

The HTML dataset sync (`data-sidebar-left`, `data-sidebar-right`) remains
exactly as before. It lives in the `useSidebarStore` implementation that moved
to `@openai-harness/client-ui-session`; the sidebar calls only
`toggleLeftCollapsed`, `closeMobile`, and their siblings, so each action still
mirrors the attribute on `<html>`.

## Package layout

```
src/index.ts                     host no-op apply
src/client/index.tsx             Cordis client plugin (apply/inject)
src/client/SidebarRoot.tsx       the occupant
src/client/avatar.tsx            animated bot avatar (dependency-free)
src/client/route.ts              pathname binding replacing usePathname
src/client/auth.ts               gateway auth URL builder
src/client/session-rpc.ts        client-rpc session actions
src/client/contract/slots.ts     slot prop composition and host bindings
tests/sidebar-avatar.test.ts     render test for the avatar surface
```

## Configuration this package expects (not edited here)

`tsconfig.base.json` — `client-ui-session`, `client-rpc`, and `client-ui-layout`
rows already exist; only these three sidebar rows are missing:

```json
"@openai-harness/client-ui-sidebar": ["./packages/client/ui-sidebar/src/index.ts"],
"@openai-harness/client-ui-sidebar/client": ["./packages/client/ui-sidebar/src/client/index.tsx"],
"@openai-harness/client-ui-sidebar/src/*": ["./packages/client/ui-sidebar/src/*"]
```

`pnpm-workspace.yaml` already includes `packages/*/*`; no change is needed.

`apps/web/package.json` — add `@openai-harness/client-ui-sidebar` as a
dependency (and load its `./client` entry from the boot composition).
`apps/web/src/styles.css` — add
`@source "../../../packages/client/ui-sidebar/src";` so Tailwind emits the
class strings used here (the file is outside the shell's default content
scan).

Root `tsdown.config.ts` — no change needed. That workspace list is the
Node-side build (`packages/client/rpc`, `ui-session`, …); browser packages
such as `ui-layout`, `ui-theme`, and this one build through their own flat
`tsdown.config.ts` (`pnpm --filter @openai-harness/client-ui-sidebar bundle`).

## Stays app-side

- `src/app/globals.css`: brand/agent tokens and `animate-sidebar-*` keyframes.
- Modals and settings/new-session surfaces (supplied through
  `onOpenSettings` / `onNewSession` when the host wants the existing modal
  flow instead of direct RPC creation).
- Next route pages (`/c/[threadId]`), auth route handlers, and bootstrap data
  (`initialSessions`, `initialUser`) assembled by the app/layout plugin.
- The app frame (`ui-layout`), main/rightbar content, and `src/components/chat/**`,
  `detail.bar/**`, `modals/**`, `src/store/**`, `src/hooks/**`.

## Known limitations

- The default New Session action creates a session through RPC rather than
  opening the app's multi-step modal; pass `onNewSession` to preserve the
  modal flow (the modal package itself creates through `client-rpc`).
- Without `onOpenSettings`, the Settings row and `⌘,` are inert: the settings
  surface belongs to the host's modal/overlay package.
- Offline or unauthenticated `session.list` leaves the store untouched and the
  occupant falls back to `initialSessions`.
