"use client";

/**
 * Live event stream for a session, shared by every consumer.
 *
 * `streams` is the registry: one `SessionStreamReader` per open session, holding the
 * socket and everyone listening to it. The transport stays event-only — it
 * delivers named SSE messages (`journal`, `connector`, `transport/error`, …)
 * as raw strings; parsing and state live in the consumers.
 *
 * @module @/lib/session/stream
 */

import { readFrames } from "@/lib/utils/sse";

/** Reconnect delays after a dropped stream; the last value repeats. */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000] as const;

/** One named SSE message, exactly as the server sent it. */
export interface SessionStreamMessage {
  event: string;
  data: string;
}

type Subscriber = (message: SessionStreamMessage) => void;

/**
 * One session's live socket and its listeners.
 *
 * The first subscriber opens it, the last one closes it. Reconnects are owned
 * here so every consumer shares the same retry and reconnect signal.
 */
class SessionStreamReader {
  private readonly subscribers = new Set<Subscriber>();
  private readonly reconnectHandlers = new Set<() => void>();
  private controller: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private stopped = false;

  constructor(private readonly sessionId: string) {
    void this.connect();
  }

  get isEmpty(): boolean {
    return this.subscribers.size === 0;
  }

  add(subscriber: Subscriber, onReconnect: () => void): void {
    this.subscribers.add(subscriber);
    this.reconnectHandlers.add(onReconnect);
  }

  remove(subscriber: Subscriber, onReconnect: () => void): void {
    this.subscribers.delete(subscriber);
    this.reconnectHandlers.delete(onReconnect);
  }

  close(): void {
    this.stopped = true;
    this.controller?.abort();
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private emit(message: SessionStreamMessage): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(message);
      } catch (error) {
        console.error("[stream] subscriber failed:", error);
      }
    }
  }

  private notifyReconnect(): void {
    for (const handler of this.reconnectHandlers) {
      try {
        handler();
      } catch (error) {
        console.error("[stream] reconnect handler failed:", error);
      }
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.controller = new AbortController();

    try {
      const response = await fetch(`/api/sessions/${this.sessionId}/stream`, {
        headers: { Accept: "text/event-stream" },
        signal: this.controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Stream unavailable (${response.status})`);
      }

      const retried = this.attempt > 0;
      this.attempt = 0;
      const isReconnect = openedSessions.has(this.sessionId) || retried;
      openedSessions.add(this.sessionId);
      if (isReconnect) this.notifyReconnect();

      for await (const frame of readFrames(response.body)) {
        if (this.stopped) return;
        this.emit({ event: frame.event, data: frame.data });
      }
    } catch (error: unknown) {
      if (!this.stopped) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[stream] disconnected; reconnecting:", message);
      }
    }

    if (this.stopped) return;
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }
}

/**
 * Sessions this tab has connected at least once. Survives reader close so a
 * re-opened session still catches up on what was missed while away.
 */
const openedSessions = new Set<string>();

/** Open sessions, keyed by session id. */
const streams = new Map<string, SessionStreamReader>();

/**
 * Subscribe to one session's event stream.
 *
 * The first subscriber opens the stream; later ones share it. The stream closes
 * when the last subscriber leaves.
 *
 * `onReconnect` fires only when a connection is restored — after a failed
 * attempt, after a drop, or when a session is re-opened. The first open is
 * silent: the page already rendered its journal.
 *
 * @returns the unsubscribe.
 */
export function subscribeSessionStream(
  sessionId: string,
  subscriber: Subscriber,
  onReconnect: () => void,
): () => void {
  let stream = streams.get(sessionId);

  if (!stream) {
    stream = new SessionStreamReader(sessionId);
    streams.set(sessionId, stream);
  }

  const current = stream;
  current.add(subscriber, onReconnect);

  return () => {
    current.remove(subscriber, onReconnect);
    if (!current.isEmpty) return;
    current.close();
    // Only drop the entry this subscription owned; a newer stream may exist.
    if (streams.get(sessionId) === current) streams.delete(sessionId);
  };
}
