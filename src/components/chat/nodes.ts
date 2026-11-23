import type { TokenUsage, ContentBlock } from "@/lib/llm/llm/message";
import type { UIBlockSpec } from "@/lib/generative.ui";
import type { ToolStatus, TurnStatus } from "./types";

interface ChatNodeBase {
  readonly kind:
    | "user"
    | "assistant-step"
    | "tool-call"
    | "ui-block"
    | "turn-end";
  /** Durable seq this row is anchored to. */
  readonly seq: number;
  readonly turn: number;
}

export interface UserChatNode extends ChatNodeBase {
  kind: "user";
  content: ContentBlock[];
}

export interface AssistantStepChatNode extends ChatNodeBase {
  kind: "assistant-step";
  /** Matches the live stream frame to its step. */
  step: number;
  /** Message content minus reasoning; same type and name as `user`. */
  content: ContentBlock[];
  reasoning?: string;
}

export interface ToolCallChatNode extends ChatNodeBase {
  kind: "tool-call";
  callId: string;
  name: string;
  args: Record<string, unknown>;
  /** Server-provided label; the client never derives it from internals. */
  label?: string;
  status: ToolStatus;
  error?: string;
  durationMs?: number;
}

export interface UIBlockChatNode extends ChatNodeBase {
  kind: "ui-block";
  /** Event id, for BlockHost's legacy id fallback. */
  messageId: string;
  spec: UIBlockSpec;
}

export interface TurnEndChatNode extends ChatNodeBase {
  kind: "turn-end";
  status: TurnStatus;
  error?: string;
  durationMs?: number;
  usage?: TokenUsage;
}

export type ChatNode =
  | UserChatNode
  | AssistantStepChatNode
  | ToolCallChatNode
  | UIBlockChatNode
  | TurnEndChatNode;
