/**
 * Server end of one open session stream.
 *
 * Writes frames from `STREAM_SOURCES` into one SSE response and owns that
 * response's teardown. `SessionStreamReader` in `./stream` is the browser end.
 *
 * @module @/lib/session/channel
 */

import { subscribe } from "@/lib/session/bus";
import { sessionKey, userKey } from "@/lib/session/keys";

const PING_INTERVAL_MS = 15_000;

export class SessionStreamWriter {
  readonly stream: ReadableStream<Uint8Array>;

  private readonly encoder = new TextEncoder();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly onAbort = (): void => this.close();
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private signal: AbortSignal | undefined;
  private ping: ReturnType<typeof setInterval> | undefined;
  private closed = false;

  constructor(
    private readonly sessionId: string,
    private readonly userId: string,
    signal: AbortSignal,
  ) {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
        this.open(signal);
      },
      cancel: () => this.close(),
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.ping !== undefined) clearInterval(this.ping);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.signal?.removeEventListener("abort", this.onAbort);

    try {
      this.controller.close();
    } catch {}
  }

  private open(signal: AbortSignal): void {
    const write = (message: { event: string; data: unknown }): void =>
      this.send(message.event, message.data);

    // One bus, two keys: this session's events and this user's connectors.
    this.unsubscribers.push(
      subscribe(sessionKey(this.sessionId), write),
      subscribe(userKey(this.userId), write),
    );

    this.ping = setInterval(() => this.sendRaw(": ping\n\n"), PING_INTERVAL_MS);

    if (signal.aborted) {
      this.close();
      return;
    }

    this.signal = signal;
    signal.addEventListener("abort", this.onAbort, { once: true });
  }

  private send(event: string, payload: unknown): void {
    this.sendRaw(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  private sendRaw(frame: string): void {
    if (this.closed) return;
    try {
      this.controller.enqueue(this.encoder.encode(frame));
    } catch {
      this.close();
    }
  }
}
