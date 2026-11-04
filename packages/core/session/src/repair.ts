/**
 * Pending tool-result recovery for interrupted logs.
 *
 * Tail repair preserves closed steps and supplies only the missing tool
 * results and lifecycle boundaries. Calls that were recorded as started but
 * never produced a durable outcome are closed conservatively
 * ({@link TOOL_OUTCOME_UNKNOWN}); calls that never reached a `tool/call` record
 * are closed as not started ({@link TOOL_NOT_STARTED}).
 *
 * @module @openai-harness/session
 */

import { brandString } from "@openai-harness/brand";
import type { MessageId, ToolResultMessage } from "@openai-harness/llm";
import { SessionSeq } from "./types";
import type { SessionEvent } from "./events";

/** Recovery code for an assistant tool request that never reached a recorded call start. */
export const TOOL_NOT_STARTED = "TOOL_NOT_STARTED";

/** Recovery code for a recorded tool call whose completed outcome was not durably recorded. */
export const TOOL_OUTCOME_UNKNOWN = "TOOL_OUTCOME_UNKNOWN";

/**
 * Why an open tail turn is closed with synthetic events. The monolith has no
 * fork seeds, so `interrupted` (crash recovery over a persisted log) is the
 * only cause this log vocabulary can express.
 */
export type OpenTurnCloseCause = { readonly kind: "interrupted" };

/** Model-visible wording of the synthetic error tool results, keyed by stack state. */
const CLOSER_TEXT = {
  started:
    "The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.",
  notStarted:
    "The tool call was interrupted before it was recorded as started. Retry it if it is still needed.",
} as const;

interface PendingCall {
  turn: number;
  step: number;
  callSeq?: SessionSeq;
}

/**
 * Track unanswered assistant tool requests from one session's committed
 * events. Observe from the start of the owned step or replay prefix and
 * recover before its step closes. This state retains pending identities, not
 * event history.
 */
export class ToolCallRecovery {
  private readonly pendingCalls = new Map<string, PendingCall>();
  private last: Pick<SessionEvent, "seq" | "time"> | undefined;

  /** @param cause - the close operation; defaults to interrupted log recovery. */
  constructor(
    private readonly cause: OpenTurnCloseCause = { kind: "interrupted" },
  ) {}

  /**
   * Consume the next committed event. Closed steps and turn boundaries discard
   * pending requests.
   * @param event - the next event from the same session, in sequence order.
   */
  observe(event: SessionEvent): void {
    this.last = {
      seq: event.seq,
      time: event.time,
    };
    switch (event.type) {
      case "turn/start":
      case "turn/end":
      case "step/end":
        this.pendingCalls.clear();
        break;
      case "assistant/message":
        for (const block of event.data.message.content) {
          if (block.type === "tool-call") {
            this.pendingCalls.set(String(block.id), {
              turn: event.data.turn,
              step: event.data.step,
            });
          }
        }
        break;
      case "tool/call": {
        const entry = this.pendingCalls.get(String(event.data.callId));
        if (entry) entry.callSeq = event.seq;
        break;
      }
      case "tool/result": {
        const callId = String(event.data.message.toolCallId);
        const entry = this.pendingCalls.get(callId);
        if (
          entry !== undefined &&
          entry.turn === event.data.turn &&
          entry.step === event.data.step
        ) {
          this.pendingCalls.delete(callId);
        }
        break;
      }
      // Other event types retain pending requests.
      default:
        break;
    }
  }

  /**
   * Build conservative error results in assistant order without changing
   * tracked state. Sequences follow the latest observed event and timestamps
   * reuse its creation time. Callers append the results and observe those
   * appends before recovering again.
   * @returns pending tool-result events, empty when no request remains unanswered.
   */
  results(): SessionEvent<"tool/result">[] {
    if (this.last === undefined) return [];
    let seq = Number(this.last.seq) + 1;
    const { time } = this.last;
    const results: SessionEvent<"tool/result">[] = [];

    // Close calls before their step: providers reject dangling assistant calls,
    // and Map insertion order preserves their transcript order.
    for (const [callId, { turn, step, callSeq }] of this.pendingCalls) {
      const started = callSeq !== undefined;
      const message: ToolResultMessage = {
        id: brandString<MessageId>(`${this.cause.kind}-tool-result-${callId}-${seq}`),
        role: "tool",
        toolCallId: callId,
        isError: true,
        content: [
          {
            type: "text",
            text: started ? CLOSER_TEXT.started : CLOSER_TEXT.notStarted,
          },
        ],
      };
      results.push({
        seq: SessionSeq(seq++),
        type: "tool/result",
        time,
        data: {
          turn,
          step,
          message,
          error: started
            ? { name: "ToolOutcomeUnknownError", code: TOOL_OUTCOME_UNKNOWN }
            : { name: "ToolNotStartedError", code: TOOL_NOT_STARTED },
        },
      });
    }

    return results;
  }
}

/**
 * Return deterministic synthetic events that close an open tail turn.
 * Unmatched calls receive error results first, followed by an open `step/end`
 * and an `interrupted` `turn/end`; sequences continue the log and timestamps
 * reuse the last real event. A balanced or empty log returns no events.
 *
 * @param events - the loaded durable log to scan (a valid committed prefix, possibly with a crash tail).
 * @param cause - the owning close operation.
 * @returns the synthetic closer events to append after `events`, in order; empty when the log is already balanced.
 */
export function openTurnClosers(
  events: readonly SessionEvent[],
  cause: OpenTurnCloseCause,
): SessionEvent[] {
  let openTurn: number | null = null;
  let openStep: number | null = null;
  const recovery = new ToolCallRecovery(cause);
  for (const event of events) {
    recovery.observe(event);
    switch (event.type) {
      case "turn/start":
        openTurn = event.data.turn;
        openStep = null;
        break;
      case "turn/end":
        openTurn = null;
        openStep = null;
        break;
      case "step/start":
        openStep = event.data.step;
        break;
      case "step/end":
        openStep = null;
        break;
      // Other event types do not move the turn/step boundary cursor.
      default:
        break;
    }
  }

  // Balanced log (no open tail turn): nothing to close. An open turn implies
  // `events` is non-empty (its turn/start was logged), so `last` exists.
  const last = events.at(-1);
  if (openTurn === null || last === undefined) return [];

  const closers: SessionEvent[] = recovery.results();
  let seq = Number(last.seq) + closers.length + 1;
  const time = last.time;

  // Close an open step before its turn.
  if (openStep !== null) {
    const stepSeq = seq++;
    closers.push({
      seq: SessionSeq(stepSeq),
      type: "step/end",
      time,
      data: { turn: openTurn, step: openStep },
    });
  }
  const turnSeq = seq++;
  closers.push({
    seq: SessionSeq(turnSeq),
    type: "turn/end",
    time,
    data: { turn: openTurn, reason: { kind: "interrupted" } },
  });
  return closers;
}

/**
 * Crash-recovery entry point: synthetic closers that balance a persisted log
 * whose tail turn was interrupted.
 *
 * @param events - the persisted log to scan, possibly ending inside an open turn.
 * @returns the synthetic `interrupted` closer events to append after `events`; empty when the log is already balanced.
 */
export function interruptedTurnClosers(
  events: readonly SessionEvent[],
): SessionEvent[] {
  return openTurnClosers(events, { kind: "interrupted" });
}
