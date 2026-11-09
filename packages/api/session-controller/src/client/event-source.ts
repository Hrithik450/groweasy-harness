/**
 * Client-side event window for one session journal.
 *
 * Mirrors the DeepSeek harness event source: the controller owns a contiguous
 * window of durable events and publishes a snapshot plus the exact delta that
 * produced it. UI projections fold the window; they never mutate it.
 *
 * @module @openai-harness/session-controller/client
 */

import type { SessionEvent } from "@openai-harness/session";

/** Exact delta that produced the latest window revision. */
export type SessionEventChange =
  | { readonly kind: "replace"; readonly events: readonly SessionEvent[] }
  | { readonly kind: "prepend"; readonly events: readonly SessionEvent[] }
  | { readonly kind: "append"; readonly events: readonly SessionEvent[] };

/** Current contiguous event window and its latest synchronous delta. */
export interface SessionEventWindow {
  readonly events: readonly SessionEvent[];
  readonly hasMore: boolean;
  readonly revision: number;
  readonly change: SessionEventChange;
}

/**
 * Session-owned event feed. Every accepted window mutation publishes
 * synchronously to subscribers.
 */
export class MutableSessionEventSource {
  private readonly listeners = new Set<() => void>();
  private events: SessionEvent[] = [];
  private hasMore = false;
  private revision = 0;
  private snapshot: SessionEventWindow = {
    events: [],
    hasMore: false,
    revision: 0,
    change: { kind: "replace", events: [] },
  };

  /** @returns the cached event-window snapshot. */
  getSnapshot(): SessionEventWindow {
    return this.snapshot;
  }

  /**
   * Subscribe to synchronous window publication.
   * @param listener - invalidation callback.
   * @returns the exact disposer.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Replace the complete contiguous window.
   * @param events - complete window in ascending seq order.
   * @param hasMore - whether older history remains.
   */
  replace(events: readonly SessionEvent[], hasMore: boolean): void {
    this.events = [...events].sort(bySeq);
    this.publish(hasMore, { kind: "replace", events: this.events });
  }

  /**
   * Prepend one older contiguous page.
   * @param events - older events in ascending seq order.
   * @param hasMore - whether still older history remains.
   */
  prepend(events: readonly SessionEvent[], hasMore: boolean): void {
    const first = this.events[0]?.seq;
    const older = events
      .filter((event) => first === undefined || event.seq < first)
      .sort(bySeq);
    if (older.length > 0) this.events = [...older, ...this.events];
    this.publish(hasMore, { kind: "prepend", events: older });
  }

  /**
   * Append one contiguous live event. Replayed duplicates are ignored.
   * @param event - live tail event.
   */
  append(event: SessionEvent): void {
    const last = this.events[this.events.length - 1]?.seq;
    if (last !== undefined && event.seq <= last) return;
    this.events.push(event);
    this.publish(this.hasMore, { kind: "append", events: [event] });
  }

  /**
   * Append one replay batch, ignoring events already inside the window.
   * @param events - events in ascending seq order.
   */
  appendBatch(events: readonly SessionEvent[]): void {
    const last = this.events[this.events.length - 1]?.seq;
    const fresh = events
      .filter((event) => last === undefined || event.seq > last)
      .sort(bySeq);
    if (fresh.length === 0) return;
    this.events.push(...fresh);
    this.publish(this.hasMore, { kind: "append", events: fresh });
  }

  private publish(hasMore: boolean, change: SessionEventChange): void {
    this.hasMore = hasMore;
    this.revision += 1;
    this.snapshot = {
      events: this.events,
      hasMore,
      revision: this.revision,
      change,
    };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A throwing subscriber must not break the append path.
      }
    }
  }
}

/** Ascending durable sequence order. */
function bySeq(left: SessionEvent, right: SessionEvent): number {
  return left.seq - right.seq;
}
