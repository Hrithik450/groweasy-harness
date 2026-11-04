import type { Session } from "@openai-harness/session";
/**
 * Core agent types, contracts, and lifecycle status definitions.
 *
 * The concrete session implementation belongs to the host: this package sees it
 * only through {@link AgentSession}, the structural surface the loop appends to
 * and replays. That keeps the loop free of the application's database-backed
 * `Session` class while still letting a host parameterize {@link Agent} with its
 * own session type.
 *
 * @module @openai-harness/agent-loop
 */

import type {
  SessionEvent,
  SessionEventMap,
  SessionEventType,
  SessionHeader,
  SessionId,
  SessionSeq,
} from "@openai-harness/session";
import type { MessageId, UserMessage } from "@openai-harness/llm";

/**
 * The append-only session surface the agent loop depends on.
 *
 * The host's session class satisfies this structurally: identities, the durable
 * event log, and the typed append entry point. Persistence, loading, and repair
 * remain host concerns.
 */
export interface AgentSession {
  readonly id: SessionId;
  readonly userId: string | undefined;
  readonly header: SessionHeader;
  readonly seq: SessionSeq;
  readonly events: readonly SessionEvent[];
  append<K extends SessionEventType>(
    type: K,
    data: SessionEventMap[K],
    opts?: {
      surfaceOp?: "append" | "replace";
      sourceEventSeqs?: SessionSeq[];
    },
  ): SessionEvent<K>;
}

/** One of the two ordered pending-message lists owned by an agent. */
export type InboxTarget = "next-turn" | "next-step";

/** Complete pending Inbox value reconstructed from durable splices. */
export interface InboxState {
  readonly "next-turn": readonly UserMessage[];
  readonly "next-step": readonly UserMessage[];
}

/**
 * An agent's lifecycle state:
 * - `idle`: no active driver
 * - `running`: driver is processing pre-step, turns, or steps
 */
export type AgentStatus = "idle" | "running";

/** Why an active turn or step was cancelled. */
export type AgentCancelCause =
  | { readonly kind: "user" | "parent" | "disposed" }
  | { readonly kind: "hook"; readonly reason?: string };

/** Options for `Agent.cancel`. */
export interface CancelOptions {
  /**
   * Preserve queued and steering inbox items instead of discarding them.
   */
  readonly keepInbox?: boolean;
}

/** Agent-owned access to pending work; concrete storage belongs to the driver. */
export interface Inbox {
  /** Prompts awaiting individual turns. */
  readonly nextTurn: readonly UserMessage[];
  /** Input awaiting the next step boundary. */
  readonly nextStep: readonly UserMessage[];
  /** Whether either pending list contains work. */
  readonly hasPending: boolean;

  /** Durably cancel all pending input, clearing next-step before next-turn. */
  clear(): void;

  /** Append one message to a pending list. */
  append(target: InboxTarget, message: UserMessage): void;

  /** Prepend one message to a pending list. */
  prepend(target: InboxTarget, message: UserMessage): void;

  /** Replace one pending message in place. */
  replace(messageId: MessageId | string, newMessage: UserMessage): boolean;

  /** Remove one pending message. */
  remove(messageId: MessageId | string): boolean;

  /** Apply splice semantics and durably record the result. */
  splice(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    inserted: UserMessage[],
  ): UserMessage[];

  /** Claim messages for the upcoming step/turn. */
  claim(target: InboxTarget, turn: number): UserMessage[];
}

/** Merge-extensible agent creation options. */
export interface AgentOptions {
  model?: string;
  provider?: string;
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens?: number;
}

/** Turn and step boundaries folded from one agent session log. */
export interface TurnBoundaryProjection {
  readonly openTurnStartSeq: SessionSeq | null;
  readonly lastStepStartSeq: SessionSeq | null;
  readonly lastStepBoundary: {
    readonly kind: "start" | "end";
    readonly seq: SessionSeq;
  } | null;
  readonly lastTurn: number;
}

/** Whether and with which messages the loop enters a proposed step. */
export type PreStepDecision =
  | { readonly kind: "reject" }
  | {
      readonly kind: "enter";
      readonly messages: UserMessage[];
      readonly startsRequestSeries?: true;
    };

/** One process-local live assistant streaming publication frame. */
export type AssistantStreamFrame =
  | {
      readonly type: "start";
      readonly attemptId: string;
      readonly revision: number;
      readonly turn: number;
      readonly step: number;
      /**
       * Next durable seq when the attempt began: no committed event carries
       * this attempt's output until an event at or after it lands.
       */
      readonly startedAfterSeq: number;
    }
  | {
      readonly type: "chunk";
      readonly attemptId: string;
      readonly revision: number;
      readonly index: number;
      readonly time: number;
      readonly text?: string;
      readonly delta?: string;
    }
  | {
      readonly type: "end";
      readonly attemptId: string;
      readonly revision: number;
      readonly index: number;
      readonly outcome:
        | {
            readonly kind: "committed";
            readonly eventType: "assistant/message" | "assistant/attempt";
            readonly seq: SessionSeq;
          }
        | { readonly kind: "abandoned" };
    };

/**
 * Public live-agent handle.
 *
 * Generic over the host session so a host can keep its concrete session type
 * in `toolSession<Session>(exec)` and in pre-step hooks; the loop itself only requires
 * {@link AgentSession}.
 */
export interface Agent<S extends AgentSession = AgentSession> {
  readonly id: SessionId;
  readonly options: AgentOptions;
  readonly session: S;
  readonly inbox: Inbox;
  readonly status: AgentStatus;

  /** Cancel active turn or work. */
  cancel(cause: AgentCancelCause, options?: CancelOptions): void;

  /** Resolves after current activity reaches quiescence. */
  whenIdle(): Promise<void>;

  /** Route input to inbox boundary and optionally wake driver. */
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void;

  /** Queue follow-up turn and wake driver. */
  followup(message: UserMessage): void;

  /** Submit steering for nearest step boundary and wake driver. */
  steer(message: UserMessage): void;

  /** Inject context for nearest step boundary without waking driver. */
  inject(message: UserMessage): void;
}
