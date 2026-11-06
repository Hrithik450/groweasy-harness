---
description: "Model-facing session message history tool registered as a Cordis plugin."
kind: "package-reference"
---

# @openai-harness/tool-session

## Summary

Provides the model-facing `fetchSessionMessages` tool. It folds the current
session's durable events into a message surface and returns a bounded,
role-filtered, cursor-paginated transcript.

The tool is a `defineTool` definition moved verbatim from
`apps/gateway/src/lib/tools/session`. The package is a Cordis plugin that
registers the tool on the `tools` service; it owns no execution pipeline.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@openai-harness/tools";
import { apply as sessionTools } from "@openai-harness/tool-session";

const ctx = new Context();
await ctx.plugin(ToolRuntime);
await ctx.plugin({
  name: "tool-session",
  inject: ["tools"],
  apply: sessionTools,
});
```

## Tools

| Tool | Source |
|---|---|
| `fetchSessionMessages` | `src/fetch-session-messages/tool.ts` |

## Implementation

`src/index.ts` exports the Cordis plugin symbols `name`, `inject`, and
`apply`, and re-exports the tool definition and argument type for the existing
application barrels. There is no default export.

The tool body still imports application modules through the `@/lib/*` alias
(`@/lib/session`, `@/lib/core/tools/*`). Those are temporary shims and must be
rewired before this package can build without the gateway alias.

## Related packages

- [`@openai-harness/tools`](../../core/tools/README.md) — registry, schema DSL, `defineTool`.
- [`@openai-harness/session`](../../core/session/README.md) — durable session events and folding.
