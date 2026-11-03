/**
 * Host-owned pub/sub seam for committed events and live assistant frames.
 *
 * The package never creates or owns a bus: the application binds its
 * process-local event bus and assistant-stream bus to these structural ports.
 * That keeps the derive layer free of `@/lib` and of any storage or Node
 * runtime dependency, while still letting hosts compose it with live data.
 *
 * @module @openai-harness/session-projection/buses
 */

import type { SessionEvent } from "@openai-harness/session";
import type {
  SessionAssistantStreamBaseline,
  SessionAssistantStreamFrame,
} from "@openai-harness/sdk-protocol";

/** Receives one committed batch of session events. */
export type SessionEventsListener = (
  sessionId: string,
  events: readonly SessionEvent[],
) => void;

/** Receives one live assistant frame. */
export type AssistantStreamListener = (
  sessionId: string,
  frame: SessionAssistantStreamFrame,
) => void;

/**
 * Host-owned committed-event fan-out.
 *
 * `emit` is called only after the append transaction commits.
 */
export interface SessionEventBusPort {
  /** Subscribe to committed events; returns the exact disposer. */
  subscribe(listener: SessionEventsListener): () => void;
  /** Publish one committed batch. */
  emit(sessionId: string, events: readonly SessionEvent[]): void;
}

/**
 * Host-owned live-assistant fan-out.
 *
 * Frames are process-local until the step commits and therefore never enter
 * the durable event log.
 */
export interface AssistantStreamBusPort {
  /** Subscribe to live frames; returns the exact disposer. */
  subscribe(listener: AssistantStreamListener): () => void;
  /** Publish one live frame. */
  emit(sessionId: string, frame: SessionAssistantStreamFrame): void;
  /** Compact in-flight stream for an opening snapshot, if one is running. */
  baseline(sessionId: string): SessionAssistantStreamBaseline | undefined;
}
