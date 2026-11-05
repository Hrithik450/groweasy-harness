# @openai-harness/compaction-basic

The shipped compaction strategy: threshold-driven automatic compaction, a
deterministic model-free tool-result pruner, projection-aware range selection,
and one-shot summarization through the provider-neutral model driver.

What it owns:
- `BasicCompactionStrategy`, the host-agnostic engine with
  `compactIfNeeded`, `compactNow`, `compactRegion`, and `maybeCompact`;
- `BasicCompactionEngine`, the Cordis service form mounted as
  `ctx.compaction`;
- `resolveCompactionConfig` and `resolveToolResultPruneConfig`, the load-time
  validation for policy and pruning budgets;
- `projectCompaction`, `visibleEntries`, `selectCompactableRange`,
  `latestPromptTokens`, `estimateVisibleTokens`, `estimateRangeTokens`, and
  `selectRangeEvents`, the log projection and retention selection;
- `ToolResultPruner`, which replaces an over-budget tool-result middle with
  `PRUNE_MARKER` and records each replacement as `compaction/prune`;
- `summarizeWithDriver` and `frameSummary`, the default summary call and
  checkpoint framing;
- `deriveMessages`, a projection-aware fallback derivation for hosts that do
  not bind their own.

What it does not own:
- the abstract service, checkpoint source, or tool-pairing arithmetic — those
  belong to `@openai-harness/compaction`;
- the application's `Session` class, persistence, database access, or Next
  runtime;
- the full model-visible derivation used by the application's agent loop.

## Host bindings

The package imports no application alias. Two capabilities arrive through a
configure binder (or per-instance dependencies):

```ts
import {
  BasicCompactionStrategy,
  configureCompactionHost,
} from "@openai-harness/compaction-basic";
import { toChatMessages } from "@/lib/session/derive/chat";

configureCompactionHost({
  env: process.env,
  deriveMessages: (events) => toChatMessages(events),
});

const engine = new BasicCompactionStrategy({ auto: true });
await engine.maybeCompact(session, driver, signal);
```

`env` resolves `CONTEXT_WINDOW`; `deriveMessages` turns a selected event span
into canonical messages. Without a binder, the environment is empty and the
package's `deriveMessages` fallback is used.

The application keeps its existing construction shape through
`@/lib/core/compaction/engine`, which installs those bindings and exports
`BasicCompactionStrategy` as `CompactionEngine`.

## Mounting the service

```ts
import { Context } from "@deepseek-ai/cordis";
import { BasicCompactionEngine } from "@openai-harness/compaction-basic";

const ctx = new Context();
await ctx.plugin(BasicCompactionEngine, { auto: true });
```

Install host bindings before the plugin loads. `BasicCompactionEngine` declares
`static Config` with schemastery and `static inject = []`: the strategy needs no
other Cordis service, only the host binder.

## Source map

| File | Role |
|---|---|
| `src/strategy.ts` | Automatic/on-demand/region compaction and host binder |
| `src/service.ts` | Cordis `BasicCompactionEngine` adapter |
| `src/config.ts` | Policy and pruning-budget validation |
| `src/region.ts` | Projection, measurement, and range selection |
| `src/tool-result-pruner.ts` | Deterministic model-free pruning |
| `src/summarizer.ts` | Driver-backed summary call and checkpoint framing |
| `src/derive.ts` | Projection-aware fallback message derivation |
| `src/types.ts` | Configuration, pruning, and summarizer vocabulary |
