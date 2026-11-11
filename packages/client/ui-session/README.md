---
description: "Shared client state layer for the browser UI packages: the Zustand session/sidebar/modal/connector/user stores and the chat-stream and business-profile hooks."
kind: "package-library"
---

# @openai-harness/client-ui-session

## Summary

The shared client state layer that the browser UI packages import. It owns the
five client stores and the two session hooks that used to live in the Next
application's `src/store` and `src/hooks` directories.

The package is framework-light on purpose: the stores are plain Zustand stores
and the hooks are the only modules that import React. There are no components
and no application aliases. Everything application-specific — the RPC client,
the session-journal hook, the optimized prompt fold, id minting — is injected
through {@link configureClientSession} by the application shim.

## Exports

These names are fixed because other packages code against them:

**Stores**

- `useSessionStore`
- `useSidebarStore`
- `useModalStore`
- `useConnectorStore`
- `useUserStore`

**Hooks**

- `useChatStream`
- `useBusinessProfile`

The store state shapes and action names are byte-for-byte the ones the Next app
used before the move. `normalizeDomainOrUrl`, `SettingsTab`, `LightboxImage`,
`ChatStream`, `ChatTurnPayload`, `UseBusinessProfileResult`, and the connector
catalog types are exported additively.

## Injection contract

```ts
import { configureClientSession } from "@openai-harness/client-ui-session";

configureClientSession({
  // The browser RPC client; a lazily-called provider is accepted too.
  rpc: () => getRpcClient(),
  // The app-owned React binding that opens one session journal.
  useSessionJournal,
});
```

`useChatStream` uses the injected `rpc` for `session.prompt`,
`session.block.submit`, and `session.cancel`. The journal itself remains
app-owned: `useSessionJournal` returns a structurally-compatible
`{ snapshot, controller }` pair. `resolveRpcClient()` throws a guidance error
until `rpc` is bound, so the package never imports `@/lib` or guesses a gateway
URL.

Optional bindings:

- `pendingPrompts` — replace the default optimistic-prompt fold.
- `createId` — replace the default UUID v4 minter.
- `fetch` — transport used by `useBusinessProfile`.
- `businessProfileUrl` — defaults to `/api/connectors/business.profile`.
- `logoutUrl` — defaults to `/api/auth/logout`.

`resetClientSession()` clears every binding; tests use it to isolate cases.

## Application shims

`src/store/*` and `src/hooks/*` in the Next app are now thin re-exports of this
package. The chat-stream shim also performs the one-time
`configureClientSession` call, so the app compiles without touching its call
sites.

## Tests

`tests/store.test.ts` covers the store shapes and actions. `tests/rpc.test.ts`
covers the RPC binding, the lazy provider, the unconfigured error, and the
default optimistic-prompt fold.
