---
description: "Model-facing Meta Ads tools registered as a Cordis plugin on the tools service."
kind: "package-reference"
---

# @openai-harness/tool-meta

## Summary

Provides the model-facing Meta Ads tool family: ad account, campaign, ad set,
and ad reads; campaign and ad creation; raw Graph API queries; Ad Library
search; Meta interest validation; and competitor research persistence.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/meta`. The package is a Cordis plugin that
registers the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as metaTools } from "@openai-harness/tool-meta";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({ name: "tool-meta", inject: ["tools"], apply: metaTools });
```

## Tools

| Tool | Source |
|---|---|
| `fetchMetaAdAccounts` | `src/ad-accounts/fetch-ad-accounts/tool.ts` |
| `fetchMetaCampaigns` | `src/ad-accounts/campaigns/fetch-campaigns/tool.ts` |
| `fetchMetaAdSets` | `src/ad-accounts/campaigns/ad-sets/fetch-ad-sets/tool.ts` |
| `fetchMetaAds` | `src/ad-accounts/campaigns/ad-sets/ads/fetch-ads/tool.ts` |
| `createMetaCampaigns` | `src/ad-accounts/campaigns/create-campaigns/tool.ts` |
| `createMetaAd` | `src/ad-accounts/campaigns/ad-sets/ads/create-ad/tool.ts` |
| `queryMetaGraphAPI` | `src/query-meta-graph-api/tool.ts` |
| `searchAdLibrary` | `src/search-ad-library/tool.ts` |
| `validateMetaInterests` | `src/validate-meta-interests/tool.ts` |
| `saveCompetitorResearch` | `src/competitor-research/save-competitor-research/tool.ts` |
| `fetchCompetitorResearches` | `src/competitor-research/fetch-competitor-researches/tool.ts` |

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition and argument type for the
existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/connectors/meta`, `@/lib/services`, `@/lib/session`,
`@/lib/core/tools/*`, `@/lib/detail.bar`, `@/lib/generative.ui`). Those are
temporary shims and must be rewired before this package can build without the
gateway alias. `searchAdLibrary` already imports `alternateWebSearchTool` from
the moved web family through `@openai-harness/tool-web`.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — registry, schema DSL, `defineTool`.
- [`@openai-harness/tool-account`](../tool-account/README.md) — business profile and Ad Manager alerts.
- [`@openai-harness/tool-shopify`](../tool-shopify/README.md) — Shopify product and collection reads.
