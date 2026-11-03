/**
 * Pure view-model types for the turn projection.
 *
 * These shapes are structurally identical to the application's
 * `@/components/chat/types`; the package owns them so the derive layer no
 * longer reaches into `src/components`. Components may keep their own copies
 * and pass either shape across the boundary.
 *
 * @module @openai-harness/session-projection/derive/types
 */

import type { TokenUsage } from "@openai-harness/llm";
import type { SurfaceItem } from "./surface";

/** Lifecycle state of one session turn. */
export type TurnStatus = "running" | "completed" | "error" | "aborted";

/** Lifecycle state of one tool activity. */
export type ToolStatus = "running" | "completed" | "error";

/** Presentation category of one tool call in the process fold. */
export type ProcessCategory =
  | "read"
  | "readImage"
  | "search"
  | "write"
  | "edit"
  | "commands"
  | "code"
  | "webSearch"
  | "webFetch"
  | "subagents"
  | "plan"
  | "questions"
  | "tools";

/** One tool call and its result, as rendered in the process fold. */
export interface ToolActivityItem {
  id: string;
  callId: string;
  name: string;
  arguments: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  data?: unknown;
  error?: string;
  meta?: unknown;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

/** One model step: its reasoning text and the tools it requested. */
export interface StepProcessNode {
  step: number;
  status: "running" | "completed" | "error";
  reasoning?: string;
  tools: ToolActivityItem[];
  startedAt?: string;
  completedAt?: string;
}

/** One turn: ordered inputs, collapsible process steps, and the final answer. */
export interface TurnNode {
  turn: number;
  sessionId: string;
  status: TurnStatus;
  inputs: SurfaceItem[];
  processSteps: StepProcessNode[];
  finalAnswer?: SurfaceItem;
  usage?: TokenUsage;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  isProcessCollapsed: boolean;
  error?: string;
}

/** A complete rendered transcript for one session. */
export interface ChatTranscript {
  sessionId: string;
  turns: TurnNode[];
}

/** Derived disclosure summary for one process fold. */
export interface ProcessSummary {
  title: string;
  toolCount: number;
  hasReasoning: boolean;
  categories: { category: ProcessCategory; count: number }[];
  durationMs?: number;
}
