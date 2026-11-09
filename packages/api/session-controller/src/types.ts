/**
 * Service contracts the Session Controller consumes from its host.
 *
 * The Controller owns the Session RPC surface but not the host's storage,
 * buses, agent workflow, or block-submission vocabulary. Those arrive as the
 * two injected services declared here:
 *
 * - `sessionFollow` — durable session lookup and log reads plus the
 *   committed-event and assistant-frame buses.
 * - `sessionAgent` — one admitted prompt's agent turn and the model-facing
 *   text for a submitted interactive block.
 *
 * Both are Cordis services (`static inject` in {@link SessionController}), so
 * the host configures real services rather than passing a hand-rolled deps
 * object through every call.
 *
 * @module @openai-harness/session-controller
 */

import type { UIBlockSpec } from "@openai-harness/generative-ui";
import type { ContentBlock, UserMessageSource } from "@openai-harness/llm";
import type {
  SessionAssistantStreamBaseline,
  SessionAssistantStreamFrame,
} from "@openai-harness/sdk-protocol";
import type { SessionEvent } from "@openai-harness/session";
import type { SessionRecord } from "@openai-harness/session-persistence";

/** Caller binding every Session endpoint method receives from the Gateway. */
export type { SessionCaller } from "@openai-harness/sdk-protocol";

/** The subset of a session lookup the follow stream and page need. */
export interface FollowSessionLookup {
  readonly success?: boolean;
  readonly data?: { readonly id: string } | null;
  readonly error?: string | null;
}

/**
 * Host storage and bus operations backing session reads and the live follow
 * stream. The host registers one implementation as the `sessionFollow`
 * service.
 */
export interface SessionFollowService {
  /** Resolve a session only when the user owns it. */
  getSession(
    userId: string,
    sessionId: string,
  ): Promise<FollowSessionLookup>;
  /** Read the durable session log. */
  getEvents(sessionId: string): Promise<readonly SessionEvent[]>;
  /** Observe committed events; returns the stop function. */
  onEvents(
    listener: (sessionId: string, events: readonly SessionEvent[]) => void,
  ): () => void;
  /** Observe process-local assistant frames; returns the stop function. */
  onAssistantFrames(
    listener: (sessionId: string, frame: SessionAssistantStreamFrame) => void,
  ): () => void;
  /** Current in-flight assistant baseline, when one exists. */
  getBaseline(
    sessionId: string,
  ): SessionAssistantStreamBaseline | undefined;
}

/** One prompt admitted into the session's agent inbox. */
export interface SessionTurnPrompt {
  /** Durable identity of the user message the turn claims. */
  readonly id: string;
  /** Admitted durable content blocks. */
  readonly content: ContentBlock[];
  /** Where the prompt came from for transcript projection. */
  readonly source: UserMessageSource;
}

/** Everything one admitted prompt needs from the host's agent runtime. */
export interface SessionTurnRequest {
  /** Owned session row the turn runs against. */
  readonly session: SessionRecord;
  /** Prompt admitted into the inbox. */
  readonly prompt: SessionTurnPrompt;
  /**
   * Submitted interactive block: its updated spec is committed as a
   * replacement `ui/block` event before the turn starts.
   */
  readonly block?: { readonly id: string; readonly spec: UIBlockSpec };
  /** Cancellation owned by the admitting endpoint. */
  readonly signal: AbortSignal;
}

/**
 * Host agent runtime the Controller admits prompts into. The host registers
 * one implementation as the `sessionAgent` service.
 */
export interface SessionAgentService {
  /** Run one admitted turn. The endpoint acknowledges before this settles. */
  executeTurn(request: SessionTurnRequest): Promise<void>;
  /** Model-facing text for one submitted interactive block. */
  blockSubmissionText(spec: UIBlockSpec): string;
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Host storage and buses backing session reads and follow. */
    sessionFollow: SessionFollowService;
    /** Host agent runtime prompts are admitted into. */
    sessionAgent: SessionAgentService;
  }
}
