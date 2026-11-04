/**
 * Process-local assistant attempt framing and stream accumulation.
 *
 * @module @openai-harness/agent-loop
 */

import type { SessionId, SessionSeq } from "@openai-harness/session";
import type { AssistantStreamFrame } from "./agent-types";

export class AssistantStreamAttempt {
  private _revision = 0;
  private _index = 0;
  private _terminal = false;
  private _accumulatedText = "";
  readonly attemptId: string;

  constructor(
    readonly sessionId: SessionId,
    attempt: number,
    readonly turn: number,
    readonly step: number,
    /** Next durable seq at attempt start; see {@link AssistantStreamFrame}. */
    readonly startedAfterSeq: number,
    private readonly emit: (frame: AssistantStreamFrame) => void,
  ) {
    this.attemptId = `${sessionId}:${attempt}`;
  }

  get ended(): boolean {
    return this._terminal;
  }

  get text(): string {
    return this._accumulatedText;
  }

  start(): void {
    this.emit({
      type: "start",
      attemptId: this.attemptId,
      revision: ++this._revision,
      turn: this.turn,
      step: this.step,
      startedAfterSeq: this.startedAfterSeq,
    });
  }

  push(delta: string): void {
    if (this._terminal || !delta) return;
    this._accumulatedText += delta;
    this.emit({
      type: "chunk",
      attemptId: this.attemptId,
      revision: ++this._revision,
      index: this._index++,
      time: Date.now(),
      delta,
      text: this._accumulatedText,
    });
  }

  settle(
    eventType: "assistant/message" | "assistant/attempt",
    append: () => SessionSeq,
  ): void {
    let seq: SessionSeq;
    try {
      seq = append();
    } catch (err) {
      this.abandon();
      throw err;
    }

    this._terminal = true;
    this.emit({
      type: "end",
      attemptId: this.attemptId,
      revision: ++this._revision,
      index: this._index,
      outcome: {
        kind: "committed",
        eventType,
        seq,
      },
    });
  }

  abandon(): void {
    this._terminal = true;
    this.emit({
      type: "end",
      attemptId: this.attemptId,
      revision: ++this._revision,
      index: this._index,
      outcome: { kind: "abandoned" },
    });
  }
}
