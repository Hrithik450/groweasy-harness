---
description: "Tool vocabulary, registry, and the pre/guard/around/post execution pipeline mounted as ctx.tools."
kind: "package-reference"
---

# @openai-harness/tools

## Summary

Owns the tool vocabulary (`defineTool`, `ToolDefinition`, execution types), the
`ToolRegistry` that runs one call to completion, the hook waterfalls
(`preExecute`, `execute`, `postExecute`), the guard pipeline, argument
validation, and the `ToolRuntime` Cordis service mounted as `ctx.tools`.

Execution is host-supplied: a call carries its agent, signal, and scope, and
this package never imports the application's session, model driver, or product
tools. Product tool families live in `@openai-harness/tool-*` packages and
register themselves on `ctx.tools`.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime, toolHooks, toolRegistry } from "@openai-harness/tools";

const ctx = new Context();
await ctx.plugin(ToolRuntime, { registry: toolRegistry });
```

Passing the process-wide `toolRegistry` keeps module-level consumers and
`ctx.tools` on one pipeline.
