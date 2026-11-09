/**
 * Transport-agnostic client controller for one session follow stream.
 *
 * Mirrors the DeepSeek harness session client: the server owns the durable
 * event window and the live assistant presentation; the controller only tracks
 * the contiguous window, the resume cursor, and the in-flight assistant text.
 * UI code subscribes to the controller and folds the window into turns.
 *
 * @module @openai-harness/session-controller/client
 */

import type { SessionEvent } from "@openai-harness/session";
import type {
  SessionAssistantStreamBaseline,
  SessionAssistantStreamFrame,
} from "@openai-harness/sdk-protocol";
import {
  MutableSessionEventSource,
  type SessionEventWindow,
} from "./event-source";

/** Compact in-flight assistant text for rendering. */
export interface SessionAssistantStreamState {
  readonly attemptId: string;
  readonly turn: number;
  readonly step: number;
  readonly text: string;
}

/** One initial or live delivery from the journal transport. */
export interface SessionJournalDelivery {
  readonly events: readonly SessionEvent[];
  /** True for the opening window; false for later live batches. */
  readonly initial: boolean;
  /** Whether older history exists before the delivered window. */
  readonly hasMore: boolean;
  /** In-flight assistant text carried by the opening snapshot. */
  readonly assistantStream?: SessionAssistantStreamBaseline;
}

/** Older-page request/result for backward pagination. */
export interface SessionJournalPage {
  readonly events: readonly SessionEvent[];
  readonly hasMore: boolean;
}

/** Transport contract implemented by the RPC client. */
export interface SessionJournalTransport {
  /**
   * Open the follow stream and keep delivering contiguous batches.
   * @param params - session, optional resume cursor, and frame callbacks.
   * @returns the exact disposer that stops delivery.
   */
  subscribe(params: {
    sessionId: string;
    afterSeq?: number;
    /** Opening-window size; the transport may cap it. */
    limit?: number;
    onDelivery: (delivery: SessionJournalDelivery) => void;
    onAssistantFrame?: (frame: SessionAssistantStreamFrame) => void;
    onError?: (error: unknown) => void;
  }): () => void;

  /**
   * Load one older page strictly before `beforeSeq`.
   * @param params - session, cursor, and page size.
   */
  loadOlder(params: {
    sessionId: string;
    beforeSeq?: number;
    limit?: number;
  }): Promise<SessionJournalPage>;
}

export type SessionControllerStatus = "closed" | "loading" | "open" | "error";

export interface SessionControllerSnapshot {
  readonly sessionId: string;
  readonly status: SessionControllerStatus;
  readonly window: SessionEventWindow;
  /** Oldest loaded seq; the cursor for the next older page. */
  readonly baseSeq: number | undefined;
  readonly loadingOlder: boolean;
  /** Live assistant output that has not committed to the log yet. */
  readonly assistantStream?: SessionAssistantStreamState;
  readonly error?: unknown;
}

interface LiveStream {
  attemptId: string;
  revision: number;
  turn: number;
  step: number;
  chunks: string[];
  /** Committed seq that will replace this text; cleared when it arrives. */
  awaitingSeq?: number;
}

/**
 * Owns the event window, the history cursor, and the assistant stream for one
 * session. `open()` is idempotent; `loadOlder()` no-ops while a page is in
 * flight, when no older history exists, or before the opening window arrived.
 */
export class SessionController {
  private readonly source = new MutableSessionEventSource();
  private readonly listeners = new Set<() => void>();
  private status: SessionControllerStatus = "closed";
  private stopDelivery: (() => void) | undefined;
  private loadingOlder = false;
  private error: unknown;
  private stream: LiveStream | undefined;
  private snapshot: SessionControllerSnapshot;

  constructor(
    readonly sessionId: string,
    private readonly transport: SessionJournalTransport,
    private readonly initialLimit?: number,
  ) {
    this.snapshot = this.buildSnapshot();
  }

  /** @returns the cached controller snapshot. */
  getSnapshot(): SessionControllerSnapshot {
    return this.snapshot;
  }

  /** Subscribe to controller state changes. @returns the exact disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Open the journal stream. Idempotent. */
  open(): void {
    if (this.status === "loading" || this.status === "open") return;
    this.status = "loading";
    this.publish();

    this.stopDelivery = this.transport.subscribe({
      sessionId: this.sessionId,
      ...(this.initialLimit !== undefined ? { limit: this.initialLimit } : {}),
      onDelivery: (delivery) => {
        if (delivery.initial) {
          this.source.replace(delivery.events, delivery.hasMore);
          this.stream = delivery.assistantStream
            ? {
                attemptId: delivery.assistantStream.attemptId,
                revision: delivery.assistantStream.revision,
                turn: delivery.assistantStream.turn,
                step: delivery.assistantStream.step,
                chunks: delivery.assistantStream.chunks.map(
                  (chunk) => chunk.delta,
                ),
              }
            : undefined;
          this.status = "open";
        } else {
          this.source.appendBatch(delivery.events);
          this.settleAwaitingCommit(delivery.events);
          if (this.status !== "open") this.status = "open";
        }
        this.publish();
      },
      onAssistantFrame: (frame) => {
        this.applyAssistantFrame(frame);
      },
      onError: (error) => {
        this.status = "error";
        this.error = error;
        this.publish();
      },
    });
  }

  /** Close the journal stream. Idempotent. */
  close(): void {
    this.stopDelivery?.();
    this.stopDelivery = undefined;
    this.stream = undefined;
    if (this.status !== "closed") {
      this.status = "closed";
      this.publish();
    }
  }

  /**
   * Prepend one older page. Mirrors the DeepSeek session client: page only
   * while the journal is open, keep the stream alive on failure, and publish
   * the loading flag around the request.
   */
  async loadOlder(limit = 50): Promise<void> {
    if (this.status !== "open" || this.loadingOlder) return;
    if (!this.source.getSnapshot().hasMore) return;

    this.loadingOlder = true;
    this.publish();
    try {
      const page = await this.transport.loadOlder({
        sessionId: this.sessionId,
        beforeSeq: this.baseSeq,
        limit,
      });
      this.source.prepend(page.events, page.hasMore);
    } catch (error) {
      // History paging never tears down an open journal; the next scroll retries.
      console.error("[session-controller] loadOlder failed:", error);
    } finally {
      this.loadingOlder = false;
      this.publish();
    }
  }

  /** Oldest loaded durable sequence. */
  get baseSeq(): number | undefined {
    return this.source.getSnapshot().events[0]?.seq;
  }

  /** Applies one live assistant frame, ignoring stale revisions. */
  private applyAssistantFrame(frame: SessionAssistantStreamFrame): void {
    switch (frame.type) {
      case "start":
        this.stream = {
          attemptId: frame.attemptId,
          revision: frame.revision,
          turn: frame.turn,
          step: frame.step,
          chunks: [],
        };
        break;
      case "chunk": {
        const stream = this.stream;
        if (!stream || stream.attemptId !== frame.attemptId) return;
        if (frame.revision <= stream.revision) return;
        stream.revision = frame.revision;
        stream.chunks.push(frame.chunk.delta);
        break;
      }
      case "end": {
        const stream = this.stream;
        if (!stream || stream.attemptId !== frame.attemptId) return;
        if (frame.revision <= stream.revision) return;
        stream.revision = frame.revision;
        if (frame.outcome.kind === "committed") {
          // Keep the text on screen until the durable message that replaced it
          // arrives; the committed event may trail this frame by a tick.
          stream.awaitingSeq = frame.outcome.seq;
        } else {
          this.stream = undefined;
        }
        break;
      }
    }
    this.publish();
  }

  /** Drops a committed stream once its durable message is in the window. */
  private settleAwaitingCommit(events: readonly SessionEvent[]): void {
    const stream = this.stream;
    if (!stream?.awaitingSeq) return;
    if (events.some((event) => event.seq >= stream.awaitingSeq!)) {
      this.stream = undefined;
    }
  }

  private buildSnapshot(): SessionControllerSnapshot {
    const stream = this.stream;
    return {
      sessionId: this.sessionId,
      status: this.status,
      window: this.source.getSnapshot(),
      baseSeq: this.baseSeq,
      loadingOlder: this.loadingOlder,
      ...(stream !== undefined
        ? {
            assistantStream: {
              attemptId: stream.attemptId,
              turn: stream.turn,
              step: stream.step,
              text: stream.chunks.join(""),
            },
          }
        : {}),
      ...(this.error !== undefined ? { error: this.error } : {}),
    };
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // UI subscribers are contained.
      }
    }
  }
}
