---
description: "Model-facing FFmpeg, SVG rendering, overlay-template, and asset-save tools registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-composition

## Summary

Provides the model-facing composition tool family: universal FFmpeg execution,
SVG element rendering to PNG, vector overlay-template lookup, and durable asset
saving. The FFmpeg probe/tokenizer and overlay-template catalog ship in the
same package because only these tools use them.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/composition`. The package is a Cordis plugin that
registers the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as compositionTools } from "@openai-harness/tool-composition";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({
  name: "tool-composition",
  inject: ["tools"],
  apply: compositionTools,
});
```

## Tools

| Tool | Source |
|---|---|
| `ffmpeg` | `src/ffmpeg/tool.ts` |
| `renderElement` | `src/render-element/tool.ts` |
| `fetchOverlayTypes` | `src/fetch-overlay-types/tool.ts` |
| `saveAsset` | `src/save-asset/tool.ts` |

`src/ffmpeg/probe.ts` and `src/ffmpeg/utils.ts` hold binary discovery,
probing, encoder detection, asynchronous execution, and command tokenization.
`src/render-element/utils.ts` holds the overlay cluster catalog and SVG
templates.

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition, argument type, and helper for
the existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/attachments`, `@/lib/utils/uuid`, `@/lib/paths`,
`@/lib/core/tools/*`). Those are temporary shims and must be rewired before
this package can build without the gateway alias.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — registry, schema DSL, `defineTool`.
