/**
 * In-process fan-out for committed session events and live assistant frames.
 *
 * Listeners run only after a batch has committed to the durable log, so a
 * subscriber that replays from the log and then attaches here never observes
 * uncommitted data. Assistant text is process-local until its step commits, so
 * it cannot ride the event bus; the follow stream carries those frames
 * alongside committed events and a late subscriber receives the in-flight
 * baseline in its opening snapshot.
 *
 * Listener sets live on `globalThis` so a development reload does not lose live
 * subscribers (the same pattern as the session lock).
 *
 * @module @openai-harness/gateway/wiring/buses
 */

import type { AssistantStreamFrame } from "@openai-harness/agent-loop";
import type { SessionEvent } from "@openai-harness/session";
import type {
  SessionAssistantStreamBaseline,
  SessionAssistantStreamFrame,
} from "@openai-harness/sdk-protocol";

/** Committed-event listener. */
export type SessionEventsListener = (
  sessionId: string,
  events: readonly SessionEvent[],
) => void;

/** Assistant-frame listener. */
export type AssistantStreamListener = (
  sessionId: string,
  frame: SessionAssistantStreamFrame,
) => void;

interface LiveStream {
  attemptId: string;
  turn: number;
  step: number;
  revision: number;
  chunks: string[];
}

const globalForBuses = globalThis as unknown as {
  __sessionEventListeners?: Set<SessionEventsListener>;
  __assistantStreamListeners?: Set<AssistantStreamListener>;
  __assistantStreams?: Map<string, LiveStream>;
};

const eventListeners = (globalForBuses.__sessionEventListeners ??=
  new Set<SessionEventsListener>());
const streamListeners = (globalForBuses.__assistantStreamListeners ??=
  new Set<AssistantStreamListener>());
const streams = (globalForBuses.__assistantStreams ??=
  new Map<string, LiveStream>());

/**
 * Subscribe to committed session events for every session.
 * @returns an idempotent unsubscribe function.
 */
export function onSessionEvents(listener: SessionEventsListener): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

/**
 * Publish a committed batch to every listener.
 *
 * A throwing listener is isolated: it is skipped for this delivery only (the
 * subscription remains) and the remaining listeners still run.
 */
export function publishSessionEvents(
  sessionId: string,
  events: readonly SessionEvent[],
): void {
  if (events.length === 0 || eventListeners.size === 0) return;
  for (const listener of [...eventListeners]) {
    try {
      listener(sessionId, events);
    } catch {
      // Contained: one bad subscriber must not break the append path.
    }
  }
}

/** Map one internal loop frame onto the wire frame. */
export function toWireAssistantFrame(
  frame: AssistantStreamFrame,
): SessionAssistantStreamFrame {
  switch (frame.type) {
    case "start":
      return {
        type: "start",
        attemptId: frame.attemptId,
        revision: frame.revision,
        turn: frame.turn,
        step: frame.step,
        startedAfterSeq: frame.startedAfterSeq,
      };
    case "chunk":
      return {
        type: "chunk",
        attemptId: frame.attemptId,
        revision: frame.revision,
        index: frame.index,
        time: frame.time,
        chunk: { delta: frame.delta ?? "" },
      };
    case "end":
      return {
        type: "end",
        attemptId: frame.attemptId,
        revision: frame.revision,
        index: frame.index,
        outcome: frame.outcome,
      };
  }
}

/**
 * Subscribe to live assistant frames for every session.
 * @returns an idempotent unsubscribe function.
 */
export function onAssistantStreamFrames(
  listener: AssistantStreamListener,
): () => void {
  streamListeners.add(listener);
  return () => {
    streamListeners.delete(listener);
  };
}

/** Publish one internal frame, updating the in-flight baseline first. */
export function publishAssistantStream(
  sessionId: string,
  frame: AssistantStreamFrame,
): void {
  const wire = toWireAssistantFrame(frame);
  trackBaseline(sessionId, wire);
  for (const listener of [...streamListeners]) {
    try {
      listener(sessionId, wire);
    } catch {
      // Contained: one bad subscriber must not break the stream.
    }
  }
}

/** Compact in-flight stream for an opening snapshot, if one is running. */
export function getAssistantStreamBaseline(
  sessionId: string,
): SessionAssistantStreamBaseline | undefined {
  const live = streams.get(sessionId);
  if (!live) return undefined;
  return {
    attemptId: live.attemptId,
    revision: live.revision,
    turn: live.turn,
    step: live.step,
    chunks: live.chunks.map((delta) => ({ delta })),
  };
}

/** Drop every process-local stream, used by tests. */
export function resetAssistantStreams(): void {
  streams.clear();
}

function trackBaseline(
  sessionId: string,
  frame: SessionAssistantStreamFrame,
): void {
  switch (frame.type) {
    case "start":
      streams.set(sessionId, {
        attemptId: frame.attemptId,
        turn: frame.turn,
        step: frame.step,
        revision: frame.revision,
        chunks: [],
      });
      return;
    case "chunk": {
      const live = streams.get(sessionId);
      if (!live || live.revision >= frame.revision) return;
      live.revision = frame.revision;
      if (frame.chunk.delta) live.chunks.push(frame.chunk.delta);
      return;
    }
    case "end":
      streams.delete(sessionId);
      return;
  }
}
