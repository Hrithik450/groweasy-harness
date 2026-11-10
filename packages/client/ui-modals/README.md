# @openai-harness/client-ui-modals

Settings, New Session, and image lightbox overlays for the browser client.
Markup and Tailwind classes are the application's existing modal UI, unchanged.
All three use the headless mode of the `@openai-harness/client-ui-primitives`
`Modal` for its portal, Escape handling, and focus restore.

## Usage

Register the plugin in the browser composition; the layout's `shell.overlay`
seat renders the entries:

| Slot | Entry id | Surface |
| --- | --- | --- |
| `shell.overlay` | `settings` | Settings (`SettingsModal`) |
| `shell.overlay` | `new-session` | New Session (`NewSessionModal`) |
| `shell.overlay` | `image-lightbox` | Image lightbox (`ImageboxModal`) |

`shell.overlay` is declared by `@openai-harness/client-ui-layout` as a
root-scoped list. Each entry self-gates on its `useModalStore` flag and renders
nothing while closed. Registration waits for the declaration through
`ctx.slots.inject`, so composition order does not matter.

```ts
import { apply } from "@openai-harness/client-ui-modals/client";

apply(ctx);
```

The host entry (`@openai-harness/client-ui-modals`) is a no-op; the surfaces
are browser-only.

## Store and navigation bindings

State comes only from `@openai-harness/client-ui-session` (`useModalStore`,
`useUserStore`, `useSessionStore`). Next imports are gone:

- `useRouter().push` → `navigateToSession(id)`, which uses the host hook when
  one is bound and otherwise performs a normal browser visit.
- `getRpcClient().call("session.create", ...)` → this package's lazy
  `RpcClient` in `src/client/session-rpc.ts`.
- `/api/download?url=...` → `gatewayFetch(...)` on the Gateway origin.

The Gateway origin comes from `VITE_GATEWAY_URL` or
`NEXT_PUBLIC_GATEWAY_URL`, and can be overridden:

```ts
import {
  configureModalsGateway,
  configureShellNavigation,
} from "@openai-harness/client-ui-modals/client";

configureModalsGateway({ url: "https://gateway.example.com" });
configureShellNavigation((href) => router.push(href));
```

## Package shape

- Flat emit: `lib/index.js` (host) and `lib/client.js` (browser plugin).
- `./client` export for the Cordis plugin and every exported surface.
- JSX-aware `tsconfig.json` (`jsx: "react-jsx"`).
- Test: `tests/gateway.test.ts` covers Gateway URL resolution, the injected
  fetch path, and shell navigation binding.

## App-side leftovers

The Next application keeps its own `/api/download` and session routes, the
`Image`/lightbox mount points, and its `src/components/modals/**` sources until
the app swaps to this package. The host must supply `configureShellNavigation`
to keep client-side routing.
