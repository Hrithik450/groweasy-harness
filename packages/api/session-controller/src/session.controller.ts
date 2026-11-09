/**
 * Session Remote owner: session CRUD, prompt admission, cold reads, and the
 * live follow stream.
 *
 * Structurally mirrors `SessionController` in the reference deepseek-harness
 * repository (`packages/api/session-controller`): one Cordis Service that owns
 * every `session.*` method and declares the host services it needs through
 * `static inject`.
 *
 * Adaptations:
 * - Session records are read and written through
 *   `@openai-harness/session-persistence`; the reference's richer Session
 *   query/projection services have no counterpart here.
 * - A prompt is admitted into the host's agent inbox and acknowledged
 *   immediately; the turn itself streams over `follow`. The reference resumes
 *   an Agent service; here the host binds its workflow behind the injected
 *   `sessionAgent` service.
 * - `block.submit` is this harness's only extension: DeepSeek has no
 *   generative UI, so rendered-block interaction needs an admission path that
 *   commits the updated block and carries its values as UI-action context. The
 *   block's model-facing text also arrives through `sessionAgent`.
 *
 * @module @openai-harness/session-controller
 */

import { randomUUID } from "node:crypto";
import { Service, type Context } from "@deepseek-ai/cordis";
import type { UIBlockSpec } from "@openai-harness/generative-ui";
import type { ContentBlock, UserMessageSource } from "@openai-harness/llm";
import type {
  SessionFollowFrame,
  SessionPage,
  SessionPageRequest,
  SessionProjectionValue,
  SessionPromptValue,
  SessionCancelValue,
} from "@openai-harness/sdk-protocol";
import { interruptedTurnClosers, type SessionView } from "@openai-harness/session";
import {
  createSession,
  getSessionByUserIdAndSessionId,
  getSessionsByUserIdView,
  readDetailBarState,
  replaceDetailBarState,
  sessionEventsRepo,
  sessionViewSchema,
  toSessionView,
  DETAIL_BAR_KEY,
  type DetailBarRead,
  type SessionRecord,
} from "@openai-harness/session-persistence";
import { detailBarStateSchema } from "@openai-harness/session-projection";
import { pageSessionEvents } from "./event-page";
import { RpcError } from "./errors";
import { openSessionFollow } from "./follow.stream";
import { acquireSessionLock, SessionBusyError } from "./lock";
import type { SessionCaller } from "./types";

/** One admitted prompt before the host turn starts. */
interface AdmitRequest {
  readonly content: ContentBlock[];
  readonly source: UserMessageSource;
  readonly block?: { readonly id: string; readonly spec: UIBlockSpec };
}

/**
 * Resolves a session the connection's user actually owns.
 *
 * The repository falls back to the user's default session when the requested
 * id is not owned, so the id must match exactly before we trust it.
 */
async function requireOwnedSession(
  userId: string,
  sessionId: string,
): Promise<SessionRecord> {
  const result = await getSessionByUserIdAndSessionId(userId, sessionId);
  if (!result.success) {
    throw new RpcError("internal", result.error ?? "Failed to load session");
  }
  if (!result.data || result.data.id !== sessionId) {
    throw new RpcError("not_found", "Session not found");
  }
  return result.data;
}

/** Shape one detail-bar read into the wire projection snapshot. */
function toProjectionValue(snapshot: DetailBarRead): SessionProjectionValue {
  return {
    key: DETAIL_BAR_KEY,
    asOfSeq: snapshot.asOfSeq,
    stateVersion: snapshot.stateVersion,
    state: snapshot.state,
  };
}

/** Converts admitted prompt parts into durable content blocks. */
function toContentBlocks(
  parts: readonly { type: string; text?: string }[],
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const part of parts) {
    if (part.type !== "text") {
      throw new RpcError(
        "bad_request",
        `Prompt part "${part.type}" is not admitted yet`,
      );
    }
    if (part.text?.trim()) blocks.push({ type: "text", text: part.text });
  }
  if (blocks.length === 0) {
    throw new RpcError("bad_request", "Prompt requires text content");
  }
  return blocks;
}

/**
 * The `sessionController` service: every unary method the Gateway exposes
 * under `/api/session/<method>` plus the `session/follow` stream.
 */
export class SessionController extends Service {
  static inject = ["sessionFollow", "sessionAgent"];

  /** Turns currently running, keyed by session id. */
  private readonly activeTurns = new Map<string, AbortController>();

  /**
   * @param ctx - owning Context with the follow source and agent seam
   *   available through `static inject`.
   */
  constructor(ctx: Context) {
    super(ctx, "sessionController");
    ctx.effect(() => () => {
      for (const controller of this.activeTurns.values()) controller.abort();
      this.activeTurns.clear();
    }, "session-controller: active turns");
  }

  /**
   * List the caller's sessions.
   * @param _args - zero-parameter method.
   * @param caller - authenticated user binding.
   * @returns the caller's session views.
   */
  async list(_args: void, caller: SessionCaller): Promise<SessionView[]> {
    const result = await getSessionsByUserIdView(caller.userId);
    if (!result.success || !result.data) {
      throw new RpcError("internal", result.error ?? "Failed to list sessions");
    }
    return result.data;
  }

  /**
   * Read one session the caller owns.
   * @param params - requested session id.
   * @param caller - authenticated user binding.
   * @returns the session view.
   */
  async inspect(
    params: { sessionId: string },
    caller: SessionCaller,
  ): Promise<SessionView> {
    const session = await requireOwnedSession(caller.userId, params.sessionId);
    return sessionViewSchema.parse(toSessionView(session));
  }

  /**
   * Create one session owned by the caller.
   * @param params - requested title.
   * @param caller - authenticated user binding.
   * @returns the created session view.
   */
  async create(
    params: { title: string },
    caller: SessionCaller,
  ): Promise<SessionView> {
    const result = await createSession({
      title: params.title,
      userId: caller.userId,
    });
    if (!result.success || !result.data) {
      throw new RpcError("internal", result.error ?? "Failed to create session");
    }
    return sessionViewSchema.parse(toSessionView(result.data));
  }

  /**
   * Read one projection over the session's committed log.
   *
   * Only the `detailBar` projection is served; it is whole-value state read
   * through the persistence layer's checkpoint plus log tail.
   *
   * @param params - target session and optional projection key (default `detailBar`).
   * @param caller - authenticated user binding.
   * @returns the whole projected state and the log cut it reflects.
   */
  async projection(
    params: { sessionId: string; key?: string },
    caller: SessionCaller,
  ): Promise<SessionProjectionValue> {
    const session = await requireOwnedSession(caller.userId, params.sessionId);
    const key = params.key ?? DETAIL_BAR_KEY;
    if (key !== DETAIL_BAR_KEY) {
      throw new RpcError(
        "bad_request",
        `Unsupported session projection "${key}"`,
      );
    }
    const snapshot = await readDetailBarState(
      session.id,
      session.slug ?? "default",
    );
    return toProjectionValue(snapshot);
  }

  /**
   * Replace one owned session's whole detail-bar state.
   *
   * The writer is the single path that appends `detailBar/update` and advances
   * the checkpoint, so the returned snapshot reflects the append.
   *
   * @param params - target session and the complete next detail-bar state.
   * @param caller - authenticated user binding.
   * @returns the written state and its new log cut.
   */
  async "detailBar.update"(
    params: { sessionId: string; detailBar: unknown },
    caller: SessionCaller,
  ): Promise<SessionProjectionValue> {
    const session = await requireOwnedSession(caller.userId, params.sessionId);
    const state = detailBarStateSchema.parse(params.detailBar);
    await replaceDetailBarState(session.id, state);
    const snapshot = await readDetailBarState(
      session.id,
      session.slug ?? "default",
    );
    return toProjectionValue(snapshot);
  }

  /**
   * Admit one prompt into the session's agent inbox.
   * @param params - prompt request.
   * @param caller - authenticated user binding.
   * @returns the acceptance receipt.
   */
  async prompt(
    params: {
      sessionId: string;
      content: readonly { type: string; text?: string }[];
      origin?: "ui-action";
      requestId: string;
      clientTimeZone?: string;
    },
    caller: SessionCaller,
  ): Promise<SessionPromptValue> {
    const session = await requireOwnedSession(caller.userId, params.sessionId);
    return this.admitPrompt(session, {
      content: toContentBlocks(params.content),
      source:
        params.origin === "ui-action"
          ? { kind: "ui-action" }
          : {
              kind: "user",
              rpcId: params.requestId,
              ...(params.clientTimeZone !== undefined
                ? { clientTimeZone: params.clientTimeZone }
                : {}),
            },
    });
  }

  /**
   * Read one backwards-history page of a session the caller owns.
   * @param params - page request.
   * @param caller - authenticated user binding.
   * @returns the page records plus whether older history remains.
   */
  async page(
    params: SessionPageRequest,
    caller: SessionCaller,
  ): Promise<SessionPage> {
    await requireOwnedSession(caller.userId, params.sessionId);
    const events = await this.ctx.sessionFollow.getEvents(params.sessionId);
    return pageSessionEvents(events, params);
  }

  /**
   * Follow one session log from its opening or resume cursor.
   * @param args - wire `args` of `session/follow`.
   * @param caller - authenticated user and stream cancellation.
   * @returns an opening snapshot followed by ordered events and assistant
   *   frames until the stream is cancelled.
   */
  follow(
    args: unknown,
    caller: SessionCaller,
  ): AsyncIterable<SessionFollowFrame> {
    return openSessionFollow({
      userId: caller.userId,
      args,
      signal: caller.signal,
      source: this.ctx.sessionFollow,
    });
  }

  /**
   * Cancel the turn currently running for a session the caller owns.
   * @param params - cancellation request.
   * @param caller - authenticated user binding.
   * @returns whether a turn was running.
   */
  async cancel(
    params: { sessionId: string },
    caller: SessionCaller,
  ): Promise<SessionCancelValue> {
    await requireOwnedSession(caller.userId, params.sessionId);
    const abortController = this.activeTurns.get(params.sessionId);
    if (abortController) {
      abortController.abort();
      return { cancelled: true };
    }

    // No turn is running in this process, but the log can still hold one whose
    // writer died with the previous process (crash, `tsx watch` restart). A
    // transcript with an open turn reads as "thinking" forever, so Stop closes
    // it durably — the same synthetic closers a cold session load would append.
    const events = await this.ctx.sessionFollow.getEvents(params.sessionId);
    const closers = interruptedTurnClosers(events);
    if (closers.length === 0) return { cancelled: false };
    // A turn admitted while the log was being read owns the repair instead.
    if (this.activeTurns.has(params.sessionId)) return { cancelled: true };
    await sessionEventsRepo.appendBatch(params.sessionId, closers);
    return { cancelled: true };
  }

  /**
   * Commit one rendered block's interaction state and admit its hidden prompt.
   * The dotted member name is the transport-boundary translation of
   * `session.block.submit`; every other endpoint drops its `session.` prefix.
   * @param params - block submission.
   * @param caller - authenticated user binding.
   * @returns the acceptance receipt.
   */
  async "block.submit"(
    params: {
      sessionId: string;
      blockId: string;
      spec: UIBlockSpec;
    },
    caller: SessionCaller,
  ): Promise<SessionPromptValue> {
    const session = await requireOwnedSession(caller.userId, params.sessionId);
    if (!(await this.hasBlock(params.sessionId, params.blockId))) {
      throw new RpcError("not_found", "UI block not found");
    }
    return this.admitPrompt(session, {
      content: [
        {
          type: "text",
          text: this.ctx.sessionAgent.blockSubmissionText(params.spec),
        },
      ],
      source: { kind: "ui-action", blockId: params.blockId },
      block: { id: params.blockId, spec: params.spec },
    });
  }

  /** True when the session log contains the given spawned block id. */
  private async hasBlock(sessionId: string, blockId: string): Promise<boolean> {
    const events = await this.ctx.sessionFollow.getEvents(sessionId);
    return events.some(
      (event) => event.type === "ui/block" && event.data.id === blockId,
    );
  }

  /**
   * Admits one prompt under the per-session lock and runs its turn in the
   * background. Callers get the receipt as soon as the turn is scheduled;
   * every observable state change travels over the session log and follow
   * stream.
   */
  private async admitPrompt(
    session: SessionRecord,
    request: AdmitRequest,
  ): Promise<SessionPromptValue> {
    let releaseLock: (() => void) | undefined;
    try {
      releaseLock = await acquireSessionLock(session.id, { timeoutMs: 60_000 });
    } catch (error) {
      if (error instanceof SessionBusyError) {
        throw new RpcError("bad_request", error.message);
      }
      throw new RpcError(
        "bad_request",
        error instanceof Error ? error.message : "Session lock wait aborted",
      );
    }

    const abortController = new AbortController();
    this.activeTurns.set(session.id, abortController);

    void this.ctx.sessionAgent
      .executeTurn({
        session,
        prompt: {
          id: randomUUID(),
          content: request.content,
          source: request.source,
        },
        ...(request.block !== undefined ? { block: request.block } : {}),
        signal: abortController.signal,
      })
      .catch((error: unknown) => {
        console.error("[session-controller] session turn failed", error);
      })
      .finally(() => {
        if (this.activeTurns.get(session.id) === abortController) {
          this.activeTurns.delete(session.id);
        }
        releaseLock?.();
      });

    return { accepted: true };
  }
}

export default SessionController;
