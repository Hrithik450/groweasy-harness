/**
 * One live `session/follow` stream.
 *
 * Ported from the `SubscriptionManager.subscribe` flow this repository used
 * before the transport split, preserving its ordering contract exactly:
 *
 * 1. attach the live event and assistant-frame listeners first;
 * 2. read the durable window;
 * 3. emit one turn-aligned snapshot;
 * 4. drain whatever arrived while the window was read, then keep delivering.
 *
 * `lastSentSeq` is shared by the snapshot and the live path, so a client never
 * sees the same event twice and never skips one. The reference harness exposes
 * the equivalent ordering through its Session Controller; the frame shapes are
 * this repository's own {@link SessionFollowFrame} contract.
 *
 * This module lives with the Session commands, mirroring the reference
 * `SessionHistoryController.follow`. The Gateway only opens the transport
 * stream; storage and the buses arrive through the injected
 * `sessionFollow` service.
 *
 * @module @openai-harness/session-controller
 */

import type { SessionEvent } from "@openai-harness/session";
import {
  subscriptionParamsSchemas,
  type SessionAssistantStreamFrame,
  type SessionFollowFrame,
} from "@openai-harness/sdk-protocol";
import { Deque } from "@openai-harness/util-deque";
import { pageSessionEvents } from "./event-page";
import { RpcError } from "./errors";
import type { SessionFollowService } from "./types";

/** One live follow request as the Session Controller supplies it. */
export interface SessionFollowRequest {
  /** Authenticated owner of the requested session. */
  readonly userId: string;
  /** Wire `args` object of `session/follow`. */
  readonly args: unknown;
  /** Cancellation of the logical stream. */
  readonly signal: AbortSignal;
  /** Storage and bus operations, supplied by the `sessionFollow` service. */
  readonly source: SessionFollowService;
}

/**
 * Open one snapshot-then-live session stream.
 * @param request - owner, wire args, cancellation, and the injected source.
 * @returns frames in delivery order until the stream is cancelled.
 * @throws {RpcError} `bad_request` for invalid args or `not_found` for a session
 * the user does not own.
 */
export async function* openSessionFollow(
  request: SessionFollowRequest,
): AsyncGenerator<SessionFollowFrame> {
  const { source, signal } = request;

  const parsed =
    subscriptionParamsSchemas["session.follow"].safeParse(request.args);
  if (!parsed.success) {
    throw new RpcError(
      "bad_request",
      parsed.error.issues.map((issue) => issue.message).join("; ") ||
        "Invalid subscription params",
    );
  }
  const params = parsed.data;
  const sessionRes = await source.getSession(request.userId, params.sessionId);
  if (!sessionRes.success) {
    throw new RpcError("internal", sessionRes.error ?? "Failed to load session");
  }
  if (!sessionRes.data || sessionRes.data.id !== params.sessionId) {
    throw new RpcError("not_found", "Session not found");
  }

  const queue = new Deque<SessionFollowFrame>();
  let wake: (() => void) | undefined;
  const signalQueue = (): void => {
    const pending = wake;
    wake = undefined;
    pending?.();
  };
  const push = (frame: SessionFollowFrame): void => {
    queue.pushBack(frame);
    signalQueue();
  };
  const wait = (): Promise<void> =>
    new Promise<void>((resolve) => {
      wake = resolve;
      if (signal.aborted) signalQueue();
    });

  let active = true;
  let ready = false;
  let lastSentSeq = params.afterSeq ?? -1;
  const bufferedEvents: SessionEvent[] = [];
  const bufferedFrames: SessionAssistantStreamFrame[] = [];

  const deliver = (event: SessionEvent): void => {
    if (!active) return;
    if (!ready) {
      bufferedEvents.push(event);
      return;
    }
    if (event.seq <= lastSentSeq) return;
    lastSentSeq = event.seq;
    push({ type: "event", event });
  };

  // Attach before reading so events committed during the read are buffered.
  const stopEvents = source.onEvents((sessionId, events) => {
    if (sessionId !== params.sessionId) return;
    for (const event of events) deliver(event);
  });
  const stopFrames = source.onAssistantFrames((sessionId, frame) => {
    if (sessionId !== params.sessionId) return;
    if (!active) return;
    if (ready) push({ type: "assistant-stream", frame });
    else bufferedFrames.push(frame);
  });

  const onAbort = (): void => {
    active = false;
    signalQueue();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const events = await source.getEvents(params.sessionId);
    if (signal.aborted) return;

    const page = pageSessionEvents(events, {
      sessionId: params.sessionId,
      ...(params.afterSeq !== undefined
        ? { beforeSeq: params.afterSeq + 1 }
        : {}),
      ...(params.maxMessages !== undefined
        ? { maxMessages: params.maxMessages }
        : {}),
      ...(params.turnWindow !== undefined
        ? { turnWindow: params.turnWindow }
        : {}),
    });

    const last = page.records[page.records.length - 1]?.event;
    lastSentSeq = last?.seq ?? params.afterSeq ?? -1;
    ready = true;

    const baseline = source.getBaseline(params.sessionId);
    push({
      type: "snapshot",
      cursor: lastSentSeq,
      records: page.records,
      hasMore: page.hasMore,
      ...(baseline !== undefined ? { assistantStream: baseline } : {}),
    });

    for (const event of bufferedEvents.splice(0)) deliver(event);
    for (const frame of bufferedFrames.splice(0)) {
      push({ type: "assistant-stream", frame });
    }

    while (!signal.aborted) {
      const frame = queue.popFront();
      if (frame !== undefined) {
        yield frame;
        continue;
      }
      await wait();
    }
  } finally {
    active = false;
    signal.removeEventListener("abort", onAbort);
    stopEvents();
    stopFrames();
  }
}
