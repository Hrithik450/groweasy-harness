# @openai-harness/workflows

Session agent workflows: the main turn workflow, the business-profile
workflow, and the cron-job dispatcher.

Moved from `apps/gateway/src/lib/agent/workflows/` and
`apps/gateway/src/lib/agent/utils.ts`. As with `@openai-harness/agent-loop` and
`@openai-harness/schedule`, the orchestration is framework-free and the
application keeps the bindings: package code never imports an `@/lib` alias,
the database module, or the product tool catalog.

## Layers

| File | Owns |
|---|---|
| `src/main.workflow.ts` | `executeMainWorkflow` — one admitted prompt becomes one `ReactLoopAgent` turn, with an optional submitted UI-block replacement committed before the turn starts. |
| `src/business.profile.workflow.ts` | `executeBusinessProfileWorkflow` — investigate a brand URL, translate durable session events into the caller's `onEvent` stream, and drive the turn to idle. |
| `src/dispatcher.ts` | `dispatcher` and `dispatchWorkflow` — map a session cron job type to its workflow, with `default` fallback. |
| `src/utils.ts` | Pure helpers moved with their only consumer: error/output sanitizers, tolerant JSON extraction, and the deterministic agent configuration hash. |

## The host seam

The workflows cannot own prompt compilation, durable session loading, the
canonical tool registry, the live assistant stream, the skill pre-step, or
connector lookup. The application binds those once:

```ts
import { configureWorkflows } from "@openai-harness/workflows";

configureWorkflows({
  compileSystemPrompt,
  compileBusinessProfilePrompt,
  loadSession: (row, agentPreset) =>
    Session.load({
      version: 1,
      id: SessionId(row.id),
      userId: row.userId,
      createdAt: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
      ...(agentPreset !== undefined ? { agentPreset } : {}),
    }),
  resolvePresetTools: (slug) => resolvePresetTools(slug),
  publishAssistantStream,
  preStep: skillPreStepMiddleware,
  businessProfileUrl: (userId) => readBusinessProfileUrl(userId),
});
```

That binding lives in `apps/gateway/src/lib/agent/workflows/host.ts`; the three
original workflow paths are temporary shims that import it and re-export the
package functions unchanged.

## Reference note

The deepseek-harness reference expresses orchestration as Cordis plugins and
services. This application has no workflow service yet, so the faithful shape
is named-export functions over a host seam — the same idiom already used by
`configureAgentLoop` and `configureScheduleStore`.
