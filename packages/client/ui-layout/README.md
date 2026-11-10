---
description: "App frame as a slot plugin: the root shell frame and its sidebar, main, rightbar, and overlay seats."
kind: "package-reference"
---

# @openai-harness/client-ui-layout

## Summary

Owns the application frame and nothing inside it. One Cordis client plugin
registers the frame into the renderer's built-in `root` slot and declares four
root-scoped child seats:

| Slot | Kind | Owner share | Rendered as |
| --- | --- | --- | --- |
| `sidebar` | `single` | `{ initialSessions, initialUser }` | First flex child |
| `main` | `keyed` | `{}` | Inside the `flex-1` content column; key from `mainKey` (default `conversation`) |
| `rightbar` | `single` | `{}` | Sibling after the content column |
| `shell.overlay` | `list` | `{}` | Last child of the frame (modals, toasts, status surfaces) |

The markup and Tailwind classes are this repository's existing
`app.shell.tsx` frame, unchanged:

```
main.h-screen.w-screen.flex.overflow-hidden.bg-background
├── [sidebar outlet]
├── div.flex-1.flex.h-full.min-w-0.bg-background.overflow-hidden
│   └── [main outlet]
├── [rightbar outlet]
└── [shell.overlay outlet]
```

Every outlet anchor is `display: contents`, so an empty seat adds no box and
does not change the flex layout. No Sidebar, chat, or modal component is
imported here.

## Setup

The host boots `@openai-harness/client-ui-renderer/client` first (it provides
`ctx.slots`), then activates this package:

```ts
import * as layoutPlugin from "@openai-harness/client-ui-layout/client";

await ctx.plugin(layoutPlugin, {
  // Fetched at the server boundary, passed as a binding — not a server prop.
  initialSessions,
  initialUser,
  mainKey: "conversation",
});
```

`apply(ctx, config)` resolves the config once and injects it into the frame as
props (`inject: () => bootstrap`). `AppFrame` is also exported directly for
tests or hosts that compose it themselves; it accepts
`initialSessions`, `initialUser`, `mainKey`, and the `renderSlot` share.

Registrants compose the full component props from the framework shares:

```tsx
ctx.slots.register(
  { name: "sidebar", registrant: "web:sidebar" },
  ({ initialSessions, initialUser }: SidebarOwnerProps) => (
    <Sidebar initialSessions={initialSessions} initialUser={initialUser} />
  ),
);

ctx.slots.register(
  { name: "main", key: "conversation", registrant: "web:chat" },
  () => <ChatWorkspace />,
);

ctx.slots.register(
  { name: "shell.overlay", id: "modals", registrant: "web:modals" },
  () => <ShellModals />,
);
```

The package requires the `slots` service (`export const inject = ["slots"]`).

## App-side responsibilities

- Server data fetching and auth redirects stay in the app layout/page; only
  plain bootstrap values cross into `apply`'s config.
- Sidebar, chat, right detail bar, and modal components stay in `src/` and
  register into the seats above.
- `src/app/globals.css` must scan this package's sources for the frame's
  Tailwind utilities (see the config lines in the handoff report).

## Packaging

- Host entry `lib/index.js` is a no-op `apply()`.
- Browser entry `lib/client.js` exports `apply`, `inject`, `AppFrame`,
  `DEFAULT_MAIN_KEY`, and the slot/config types.
- `tsdown.config.ts` emits `index` and `client` flat into `lib/` with
  declarations beside them; `tsconfig.json` follows `ui-renderer` (JSX).
