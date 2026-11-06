---
description: "Connector contract, durable state, and the ctx.connectors provider registry."
kind: "package-reference"
---

# @openai-harness/connector

## Summary

Owns the connector vocabulary shared by every provider: the request/response
contract, the `connectors` storage domain (tokens included), the repository
semantics over that domain, and the `ctx.connectors` Cordis facade that keeps a
named provider registry.

Providers (`@openai-harness/connector-meta`, `-shopify`, `-business-profile`)
register their descriptors with the facade at composition time; this package
owns no provider implementation.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ConnectorService } from "@openai-harness/connector";
import { metaConnectorProvider } from "@openai-harness/connector-meta";

const ctx = new Context();
await ctx.plugin(ConnectorService);
ctx.connectors.registerProvider(metaConnectorProvider);
```

The service injects `storageDomain` and opens the `connectors` domain in its
constructor effect.
