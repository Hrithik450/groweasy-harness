---
description: "Model-facing business-profile, alerts, and suggestions account tools registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-account

## Summary

Provides the model-facing account tool family: fetch and save the business
profile, update account diagnostic alerts, and update optimization
suggestions. The business-profile normalization and merge helpers ship in the
same package because only these tools use them.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/account`. The package is a Cordis plugin that
registers the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as accountTools } from "@openai-harness/tool-account";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({ name: "tool-account", inject: ["tools"], apply: accountTools });
```

## Tools

| Tool | Source |
|---|---|
| `fetchBusinessProfile` | `src/business.profile/fetch.business.profile/tool.ts` |
| `saveBusinessProfile` | `src/business.profile/save.business.profile/tool.ts` |
| `updateAlerts` | `src/alerts/update.alerts/tool.ts` |
| `updateSuggestions` | `src/suggestions/update.suggestions/tool.ts` |

`src/business.profile/utils.ts` holds the shared URL, keyword, competitor, and
payload normalization used by both profile tools.

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition, argument type, and helper for
the existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/services`, `@/lib/session`, `@/lib/core/tools/*`, `@/lib/detail.bar`,
`@/lib/generative.ui`, `@/lib/utils/date`, `@/lib/connectors/business.profile`).
Those are temporary shims and must be rewired before this package can build
without the gateway alias.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — registry, schema DSL, `defineTool`.
- [`@openai-harness/tool-meta`](../tool-meta/README.md) — Meta Ads tools.
- [`@openai-harness/tool-shopify`](../tool-shopify/README.md) — Shopify product and collection reads.
