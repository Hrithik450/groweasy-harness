# @openai-harness/agent-loop

The concrete agent loop: `ReactLoopAgent` runs queued turns and step-boundary
input over a durable session log; `ReactLoopInbox` owns the two pending-message
lists and records every splice as an `agent/inbox/spliced` event;
`AssistantStreamAttempt` frames live assistant output; `runStep` drives one model
step; `executeToolCalls` schedules that step's calls with exclusive barriers and
a bounded parallel pool, committing results in model order.

What it owns:
- turn/step ordering, cancellation, wake latching, and turn-end reasons;
- the durable inbox and its splice semantics;
- assistant attempt framing and the process-local `AssistantStreamFrame` shape;
- the tool-call scheduler: classification re-reads, rolling pool, abort drain,
  synthetic results for skipped calls, and image-block-preserving results.

What it does not own:
- the session store, loading, repair, and persistence — the host supplies a
  session that satisfies `AgentSession`;
- the model driver, provider/model identity, chat derivation, and the compaction
  engine — supplied through `AgentLoopHost`;
- the tool registry and its pipeline (hooks, guards, timeout, projection) —
  supplied through `AgentLoopHost`.

Host binding mirrors `@openai-harness/session-persistence`: call
`configureAgentLoop(host)` once during host composition, or pass an explicit
`host` to `runStep`/`executeToolCalls`. The application's
`src/lib/core/agent-loop/host.ts` binds the driver, `toChatMessages`, the
compaction engine, and the tool registry, so existing import paths keep
resolving.

Source reference: the agent-loop package in the reference deepseek-harness
repository. Turn/step semantics, inbox replay, and scheduler ordering are
carried over unchanged; the reference's Cordis services are rendered here as the
`AgentLoopHost` seam because this repository's packages bind host storage the
same way.
