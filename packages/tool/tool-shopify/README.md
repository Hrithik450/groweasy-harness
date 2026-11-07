---
description: "Model-facing Shopify product and collection tools registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-shopify

## Summary

Provides the model-facing Shopify tool family: product and collection reads
over the Shopify Graph API connector.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/shopify`. The package is a Cordis plugin that
registers the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as shopifyTools } from "@openai-harness/tool-shopify";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({ name: "tool-shopify", inject: ["tools"], apply: shopifyTools });
```

## Tools

| Tool | Source |
|---|---|
| `fetchShopifyProducts` | `src/products/tool.ts` |
| `fetchShopifyCollections` | `src/collections/tool.ts` |

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition and argument type for the
existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/connectors/shopify`, `@/lib/core/tools/*`). Those are temporary shims
and must be rewired before this package can build without the gateway alias.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — registry, schema DSL, `defineTool`.
- [`@openai-harness/tool-meta`](../tool-meta/README.md) — Meta Ads tools.
- [`@openai-harness/tool-account`](../tool-account/README.md) — business profile and Ad Manager alerts.
