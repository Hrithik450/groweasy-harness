---
description: "Model-facing Firecrawl search, page scrape, and alternate scraper tools registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-web

## Summary

Provides the model-facing web tool family: Firecrawl search, Firecrawl page
scraping with a direct-asset fallback, and the self-hosted alternate scraper
with media extraction and optional anchor grouping.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/web`. The package is a Cordis plugin that registers
the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as webTools } from "@openai-harness/tool-web";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({ name: "tool-web", inject: ["tools"], apply: webTools });
```

## Tools

| Tool | Source |
|---|---|
| `searchWeb` | `src/search/tool.ts` |
| `scrapeWebPage` | `src/scrape/tool.ts` |
| `alternateWebSearch` | `src/alternate-scrape/tool.ts` |

`src/alternate-scrape/tool.ts` also exports `associateMediaByAnchor`, covered by
`tests/alternate-scrape.test.ts`.

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition, argument type, and helper for
the existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/core/tools/*`, plus the `AnchoredMedia` type from
`@/lib/services/scraper/ingestion.service`). Those are temporary shims and must
be rewired before this package can build without the gateway alias.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — registry, schema DSL, `defineTool`.
