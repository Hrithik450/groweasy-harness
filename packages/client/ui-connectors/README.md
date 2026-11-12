# @openai-harness/client-ui-connectors

Connector catalogue and per-provider manager overlays for the browser client:
Meta Ads, Shopify, and Business Profile, with their tabs, forms, and detail
views. The markup and Tailwind classes are the application's existing
connector UI, unchanged.

## Usage

Register the plugin in the browser composition and the layout's `shell.overlay`
seat renders two list entries:

| Slot | Entry id | Surface |
| --- | --- | --- |
| `shell.overlay` | `connectors` | Connector catalogue (`ConnectorsModal`) |
| `shell.overlay` | `connectors.manager` | Active provider manager (`ConnectorManagerModal`) |

`shell.overlay` is declared by `@openai-harness/client-ui-layout` as a
root-scoped list. This package waits for that declaration with
`ctx.slots.inject`, so composition order does not matter.

```ts
import { apply } from "@openai-harness/client-ui-connectors/client";

apply(ctx);
```

The host entry (`@openai-harness/client-ui-connectors`) is a no-op; the
surfaces are browser-only.

## Shared bot character

`BotDollAvatar` and `BotDollLoader` are not defined here. They are imported
from `@openai-harness/client-ui-chat/client`, which owns the single bot
implementation shared by the chat seats and the connector loaders.

## Store and transport bindings

State comes only from `@openai-harness/client-ui-session`
(`useConnectorStore`). Connector HTTP calls no longer use document-relative
`fetch("/api/...")`: `src/client/connectors.client.ts` resolves the same routes
on the Gateway origin. The origin comes from `NEXT_PUBLIC_GATEWAY_URL` (or
`VITE_GATEWAY_URL` through the injected config) and can be overridden:

```ts
import { configureConnectorsClient } from "@openai-harness/client-ui-connectors/client";

configureConnectorsClient({ baseUrl: "https://gateway.example.com" });
```

`connectorsUrl` resolves OAuth start routes (`/api/auth/meta/login`,
`/api/auth/shopify/login`) to the same Gateway origin. The original app-side
`/api/connectors/...` route handlers and their server connector modules stay in
the application; this package only consumes the HTTP contract.

## Package shape

- Flat emit: `lib/index.js` (host) and `lib/client.js` (browser plugin).
- `./client` export for the Cordis plugin and every exported surface.
- JSX-aware `tsconfig.json` (`jsx: "react-jsx"`).
- Test: `tests/connectors.client.test.ts` covers Gateway URL resolution and the
  injected fetch path.
