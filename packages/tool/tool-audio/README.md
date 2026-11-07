---
description: "Model-facing audio generation, accent conversion, dubbing, and voice-catalog tools registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-audio

## Summary

Provides the model-facing audio tool family: list curated voice personas,
synthesize speech, convert an existing recording to another voice, and dub
speech into another language. The marketing voice catalog ships in the same
package because every audio tool resolves personas through it.

Each tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/audio`. The package is a Cordis plugin that
registers the family on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as audioTools } from "@openai-harness/tool-audio";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({ name: "tool-audio", inject: ["tools"], apply: audioTools });
```

## Tools

| Tool | Source |
|---|---|
| `convertAccent` | `src/convert-accent/tool.ts` |
| `dubAudio` | `src/dub-audio/tool.ts` |
| `generateAudio` | `src/generate-audio/tool.ts` |
| `listVoiceCatalog` | `src/list-voice-catalog/tool.ts` |

`src/utils.ts` holds the voice catalog (`VOICE_CATALOG`, `DEFAULT_VOICE_ID`,
`resolveVoiceId`, `getVoiceCatalogList`) and its language, accent, and entry
types.

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports every tool definition, argument type, and helper for
the existing application barrels. There is no default export.

The tool bodies still import application modules through the `@/lib/*` alias
(`@/lib/attachments`, `@/lib/core/tools/schema`, `@/lib/core/tools/context`).
These are temporary shims to be rewired once the host packages are mounted in
the gateway.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — tool contract,
  `defineTool`, registry, and the `ctx.tools` service.
