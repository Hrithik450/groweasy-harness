import type { UIBlockSpec } from "@/lib/generative.ui";

/** A live emission from a tool; the host persists it as a `ui/block` event. */
export type ToolEvent = { type: "ui/block"; spec: UIBlockSpec };

/** Arguments plus caller identity for one tool execution. */
export interface ToolInput<TArgs = Record<string, unknown>> {
  args: TArgs;
  context?: {
    userId?: string;
    sessionId?: string;
    /** Conversation turn number; the chat transcript's `turn-<n>` anchor. */
    turn?: number;
    emitEvent?: (event: ToolEvent) => void | Promise<void>;
  };
}

/** Uniform tool result: success flag, typed payload, readable failure. */
export interface ToolOutput<TData = Record<string, unknown>> {
  success: boolean;
  data?: TData;
  error?: string;
}
