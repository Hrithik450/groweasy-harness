import type {
  TokenUsage,
  ContentBlock,
  MessageSource,
} from "@/lib/llm/llm/message";
import type { UIBlockSpec } from "@/lib/generative.ui";
import type { ToolStatus, TurnStatus } from "./types";

export type { ToolStatus, TurnStatus } from "./types";

export type ChatNodeKind =
  | "user"
  | "assistant-step"
  | "tool-call"
  | "ui-block"
  | "turn-end";

interface ChatNodeBase {
  readonly kind: ChatNodeKind;
  /** Durable seq this row is anchored to. */
  readonly seq: number;
  readonly turn: number;
  /** ISO time of the anchoring event. */
  readonly time: string;
}

export interface UserChatNode extends ChatNodeBase {
  kind: "user";
  content: ContentBlock[];
  source?: MessageSource;
}

export interface AssistantStepChatNode extends ChatNodeBase {
  kind: "assistant-step";
  step: number;
  status: TurnStatus;
  /** Message content minus reasoning; same type and name as `user`. */
  content: ContentBlock[];
  reasoning?: string;
  usage?: TokenUsage;
  /** True only for the live-preview node layered from stream frames. */
  streaming?: boolean;
}

export interface ToolCallChatNode extends ChatNodeBase {
  kind: "tool-call";
  step: number;
  callId: string;
  name: string;
  argumentsRaw: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  data?: unknown;
  error?: string;
  meta?: unknown;
  startedAt?: string;
  completedAt?: string;
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
