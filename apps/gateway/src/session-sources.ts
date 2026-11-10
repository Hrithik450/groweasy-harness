/**
 * Session Controller service seams.
 *
 * The Session Controller owns prompt admission, acknowledgement, and the live
 * follow stream protocol. These services supply the pieces that belong to this
 * deployment: the workflow that runs one admitted turn, the model-facing text
 * for a submitted UI block, and the storage and bus operations the follow
 * stream reads.
 *
 * @module @openai-harness/gateway/session-sources
 */

import { Context, Service } from "@deepseek-ai/cordis";
import type { UIBlockSpec } from "@openai-harness/generative-ui";
import { blockSubmissionText } from "@openai-harness/generative-ui";
import type { SessionEvent } from "@openai-harness/session";
import {
  getSessionByUserIdAndSessionId,
  sessionEventsRepo,
} from "@openai-harness/session-persistence";
import type {
  SessionAgentService,
  SessionFollowService,
  SessionTurnRequest,
} from "@openai-harness/session-controller";
import {
  getAssistantStreamBaseline,
  onAssistantStreamFrames,
  onSessionEvents,
} from "./buses";
import { executeMainWorkflow } from "./workflows";

/** Runs one admitted prompt through the main agent workflow. */
export class SessionAgentSource extends Service implements SessionAgentService {
  constructor(ctx: Context) {
    super(ctx, "sessionAgent");
  }

  executeTurn(request: SessionTurnRequest): Promise<void> {
    return executeMainWorkflow({
      session: request.session,
      prompt: request.prompt,
      ...(request.block !== undefined ? { block: request.block } : {}),
      signal: request.signal,
    });
  }

  blockSubmissionText(spec: UIBlockSpec): string {
    return blockSubmissionText(spec);
  }
}

/** Storage and bus operations the live session follow stream reads. */
export class SessionFollowSource
  extends Service
  implements SessionFollowService
{
  constructor(ctx: Context) {
    super(ctx, "sessionFollow");
  }

  /** Resolve a session only when the authenticated user owns it. */
  getSession(
    userId: string,
    sessionId: string,
  ): ReturnType<SessionFollowService["getSession"]> {
    return getSessionByUserIdAndSessionId(userId, sessionId);
  }

  /** Read the durable session log. */
  getEvents(sessionId: string): Promise<readonly SessionEvent[]> {
    return sessionEventsRepo.getEvents(sessionId);
  }

  /** Observe committed events; returns the stop function. */
  onEvents(
    listener: (sessionId: string, events: readonly SessionEvent[]) => void,
  ): () => void {
    return onSessionEvents((sessionId, events) => {
      listener(sessionId, events);
    });
  }

  /** Observe process-local assistant frames; returns the stop function. */
  onAssistantFrames(
    listener: Parameters<SessionFollowService["onAssistantFrames"]>[0],
  ): () => void {
    return onAssistantStreamFrames((sessionId, frame) => {
      listener(sessionId, frame);
    });
  }

  /** Current in-flight assistant baseline, when one exists. */
  getBaseline(
    sessionId: string,
  ): ReturnType<SessionFollowService["getBaseline"]> {
    return getAssistantStreamBaseline(sessionId);
  }
}
