---
description: "Model-facing Generative UI block renderer registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-generative-ui

## Summary

Provides the model-facing `renderUIBlock` tool. It validates and normalizes a
nested component tree, appends a durable `ui/block` event to the calling
session, and returns the normalized spec for the chat renderer.

The tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/generative-ui`. The package is a Cordis plugin that
registers the tool on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as generativeUiTools } from "@openai-harness/tool-generative-ui";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({
  name: "tool-generative-ui",
  inject: ["tools"],
  apply: generativeUiTools,
});
```

## Tools

| Tool | Source |
|---|---|
| `renderUIBlock` | `src/render-ui-block/tool.ts` |

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports the tool definition and argument type for the existing
application barrels. There is no default export.

The tool body still imports application modules through the `@/lib/*` alias
(`@/lib/generative.ui`, `@/lib/utils/uuid`, `@/lib/core/tools/*`). Those are
temporary shims and must be rewired before this package can build without the
gateway alias.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — registry, schema DSL, `defineTool`.
- [`@openai-harness/generative-ui`](../../core/generative-ui/README.md) — spec validation and catalog.
