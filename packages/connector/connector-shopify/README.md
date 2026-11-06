---
description: "Shopify connector: OAuth helpers, Admin GraphQL client, and provider descriptor."
kind: "package-reference"
---

# @openai-harness/connector-shopify

## Summary

Implements the Shopify connector half of the connector contract: OAuth login
URLs, code exchange, shop-domain normalisation, the Shopify Admin GraphQL client
(products and collections), connector synchronisation, and the
`shopifyConnectorProvider` descriptor a host registers on `ctx.connectors`.

## Use this package

```ts
import { shopifyConnectorProvider } from "@openai-harness/connector-shopify";

ctx.connectors.registerProvider(shopifyConnectorProvider);
```

Token persistence stays in `@openai-harness/connector`; this package only talks
to Shopify.
