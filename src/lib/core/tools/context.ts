/**
 * Session context helpers available to a running tool.
 *
 * @module @/lib/core/tools/context
 */

/** Session identity and owner visible to a tool execution. */
export interface ToolSessionInfo {
  readonly sessionId: string;
  readonly userId?: string;
}

/** Minimal structural view of the agent/session pair carried by an execution. */
interface ExecutionWithAgent {
  readonly agent?: {
    readonly session?: {
      readonly id?: unknown;
      readonly header?: {
        readonly userId?: string;
      };
    };
  };
}

/**
 * Reads the owning session and authenticated user from a tool execution.
 *
 * @param exec - the execution handed to a tool body.
 * @returns the session id (empty when no agent is attached) and optional user id.
 */
export function toolSession(exec: ExecutionWithAgent): ToolSessionInfo {
  const session = exec.agent?.session;
  return {
    sessionId: session?.id == null ? "" : String(session.id),
    userId: session?.header?.userId,
  };
}
