/**
 * Conversation message value types and their content blocks.
 *
 * These types cross inbox, session-log, and model-request boundaries, so they
 * live with the LLM identity brands and are imported by the session core.
 *
 * @module @/lib/llm/message
 */

import type { FileAttachmentRef, ImageAttachmentRef } from "@openai-harness/attachment";
import type { MessageId, ToolCallId } from "./brand";
import type { UIBlockSpec } from "@openai-harness/generative-ui";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ReasoningBlock {
  type: "reasoning";
  reasoning: string;
}

export interface ImageBlock {
  type: "image";
  ref: ImageAttachmentRef;
  mimeType?: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface FileBlock {
  type: "file";
  ref: FileAttachmentRef;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface UIBlock {
  type: "block";
  spec: UIBlockSpec;
  /** Identity of the `ui/block` session event this block projects. */
  id?: string;
}

export interface ToolCallBlock {
  type: "tool-call";
  id: ToolCallId | string;
  name: string;
  arguments: string;
}

export type ContentBlock =
  | TextBlock
  | ReasoningBlock
  | ImageBlock
  | FileBlock
  | UIBlock
  | ToolCallBlock;

export type ContentBlockType = ContentBlock["type"];

export interface ModelMessageSource {
  kind: "model";
  provider?: string;
  model?: string;
}

/**
 * Merge-extensible map from a user-message source kind to its payload.
 *
 * Packages that inject durable context augment this interface with their own
 * kind. Recognised kinds stay discriminable, while {@link UserMessageSource}'s
 * open index-signature member keeps an unknown persisted or resumed source
 * readable without a cast.
 */
export interface MessageSourceMap {
  /** Direct human input. */
  user: { kind: "user" };
  /**
   * Browser prompt admitted through the gateway: correlation id, optional
   * client zone, and the caller that submitted it.
   */
  "user-rpc": { kind: "user"; rpcId: string; clientTimeZone?: string };
  /** Scheduled automation input. */
  cron: { kind: "cron"; cronJobId?: string };
  /** Input relayed from another agent. */
  agent: { kind: "agent"; agentId?: string };
  /** Host-authored context. */
  system: { kind: "system" };
  /** Synthetic input submitted by an interactive UI block. */
  "ui-action": { kind: "ui-action"; blockId?: string };
  /** Durable tool-result context. */
  "tool-result": {
    kind: "tool-result";
    callId: string;
    turnId?: string;
    name: string;
    success: boolean;
    output: unknown;
    error?: string;
  };
  /** Durable auto-compaction checkpoint summary replacing a shadowed range. */
  "compact-checkpoint": {
    kind: "compact-checkpoint";
    compactionId: string;
  };
}

export type UserMessageSource =
  | MessageSourceMap[keyof MessageSourceMap]
  | { kind: string; [key: string]: unknown };

export type MessageSource = UserMessageSource | ModelMessageSource;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UserMessage {
  id: MessageId;
  role: "user";
  content: ContentBlock[];
  source?: UserMessageSource;
}

export interface AssistantMessage {
  id: MessageId;
  role: "assistant";
  content: ContentBlock[];
  source?: ModelMessageSource;
  usage?: TokenUsage;
  interrupted?: boolean;
}

export interface SystemMessage {
  role: "system";
  content: string | ContentBlock[];
}

export interface ToolResultMessage {
  id?: MessageId;
  role: "tool";
  toolCallId: ToolCallId | string;
  content: ContentBlock[] | string;
  isError?: boolean;
}

/** Any canonical conversation message, discriminated by `role`. */
export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolResultMessage;
