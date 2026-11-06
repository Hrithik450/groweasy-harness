---
description: "Meta Ads connector: OAuth helpers, Graph API client, and provider descriptor."
kind: "package-reference"
---

# @openai-harness/connector-meta

## Summary

Implements the Meta Ads connector half of the connector contract: OAuth login
URLs and code exchange, the Meta Graph API client (accounts, campaigns, ad
sets, ads, creatives, Ad Library, interest validation), connector
synchronisation, and the `metaConnectorProvider` descriptor a host registers on
`ctx.connectors`.

## Use this package

```ts
import { metaConnectorProvider } from "@openai-harness/connector-meta";

ctx.connectors.registerProvider(metaConnectorProvider);
```

The OAuth helpers (`getMetaOAuthLoginUrl`, `exchangeMetaCodeForToken`,
`isMetaOAuthConfigured`) are transport-free and read their app credentials from
the environment.
