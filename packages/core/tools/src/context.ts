/**
 * Agent-bound execution helpers shared by tool bodies.
 *
 * Tools receive the owning agent rather than loose identity fields, so every
 * execution resolves its durable session through one checked accessor. The
 * session type itself is host-owned; callers bind it as the type argument so
 * this package imports no application session module.
 *
 * @module @openai-harness/tools
 */

import type { ToolExecution } from "./types";

/**
 * Resolve the durable session owned by the caller's agent.
 *
 * The package's {@link ToolExecution} carries the loop's structural
 * `Agent<AgentSession>`; the host narrows it back to its concrete session type
 * at the call site with the type argument.
 *
 * @typeParam TSession - the host's concrete session type.
 * @param exec - execution carrying the agent bound by the agent loop.
 * @returns the agent's session.
 * @throws when the execution has no agent-bound caller.
 */
export function toolSession<TSession = unknown>(
  exec: Pick<ToolExecution, "agent">,
): TSession {
  const agent = exec.agent as unknown as { session?: TSession } | undefined;
  if (!agent) throw new Error("tool requires an agent-bound caller");
  return agent.session as TSession;
}
