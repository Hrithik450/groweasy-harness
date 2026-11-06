---
description: "Model-facing image generation, inspection, and static-ad prompt tools registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-image

## Summary

Provides the model-facing image tool family: generate marketing visuals,
inspect user or generated images as vision content, and fetch calibrated
static-ad prompt templates by visual cluster. The cluster and prompt catalogs
ship in the same package because only these tools use them.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/image`. The package is a Cordis plugin that
registers the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as imageTools } from "@openai-harness/tool-image";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({ name: "tool-image", inject: ["tools"], apply: imageTools });
```

## Tools

| Tool | Source |
|---|---|
| `fetchImageTypes` | `src/fetch-image-types/tool.ts` |
| `generateImages` | `src/generate-images/tool.ts` |
| `readImages` | `src/read-images/tool.ts` |

`src/utils.ts` holds `IMAGE_TYPES_SLUG`, `imageClusters`, and `imagePrompts`,
plus the `ImageTypeSlug`, `ImageCluster`, and `ImagePrompt` types.

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition, argument type, and helper for
the existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/agent`, `@/lib/attachments`, `@/lib/llm/images`,
`@/lib/llm/message`, `@/lib/core/tools/schema`, `@/lib/core/tools/context`).
These are temporary shims to be rewired once the host packages are mounted in
the gateway.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — tool contract,
  `defineTool`, registry, and the `ctx.tools` service.
