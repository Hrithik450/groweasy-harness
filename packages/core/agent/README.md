# @openai-harness/agent

Framework-free agent vocabulary: the append-only event envelope, the agent wire
event union, the agent execution parameters, and the loop execution defaults.

What it owns:
- `EventEnvelope`, `AgentEvent`, and `SessionMessageEvent` — the event
  vocabulary an agent run publishes to its caller;
- `MessageContent` and the per-event payload shapes;
- `AgentParams` — the execution request accepted by an agent run;
- `DEFAULT_MAX_PARALLEL_TOOL_CALLS` and `DEFAULT_TOOL_TIMEOUT_MS`.

What it does not own:
- the live `Agent` handle, durable inbox, turn/step driver, assistant streaming,
  and tool-call scheduling — those stay in `@openai-harness/agent-loop`;
- the host's concrete `Session` type and the `Session` class — the `session`
  package owns durable session vocabulary, while the application's Drizzle row
  type stays in the app;
- any database access. This package is types, pure constants, and no runtime
  dependencies on the app.

Host binding: `session/update` describes a snapshot of the host's session row,
so `AgentEvent` is generic over that snapshot. The application binds its own
`Session` in `src/lib/core/agent/events.ts`, which keeps the existing
`@/lib/core/agent/events` and `@/lib/core/agent/constants` import paths
resolving unchanged. `src/lib/core/agent/types.ts` keeps the app's narrowed
`Agent` alias over `@openai-harness/agent-loop`.

Source reference: `packages/core/agent` in the reference deepseek-harness
repository. That package's registry, initiator scope, and Cordis dispatch
surface are not portable here; the framework-free event/type vocabulary and
defaults are, and the app-side concerns remain in `src/lib/core/agent`.
