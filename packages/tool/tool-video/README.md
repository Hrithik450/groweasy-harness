---
description: "Model-facing subtitle, image-to-video, lip-sync, and video inspection tools registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-video

## Summary

Provides the model-facing video tool family: transcribe audio into styled
`.ass` subtitles, generate video motion from anchor stills, synchronize lip
movement to an audio track, and inspect videos via transcript, keyframes, and
metadata.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/video`. The package is a Cordis plugin that
registers the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as videoTools } from "@openai-harness/tool-video";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({ name: "tool-video", inject: ["tools"], apply: videoTools });
```

## Tools

| Tool | Source |
|---|---|
| `createSubtitles` | `src/create-subtitles/tool.ts` |
| `imageToVideo` | `src/image-to-video/tool.ts` |
| `readVideos` | `src/read-videos/tool.ts` |
| `syncLips` | `src/sync-lips/tool.ts` |

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition, argument type, and helper for
the existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/agent`, `@/lib/agent/video`, `@/lib/attachments`, `@/lib/utils/uuid`,
`@/lib/core/tools/schema`, `@/lib/core/tools/context`). These are temporary
shims to be rewired once the host packages are mounted in the gateway.
FFmpeg helpers are already imported from `@openai-harness/tool-composition`.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — tool contract,
  `defineTool`, registry, and the `ctx.tools` service.
- [`@openai-harness/tool-composition`](../tool-composition/README.md) — FFmpeg
  probing and execution used by `syncLips`.
