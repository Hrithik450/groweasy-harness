import { NextResponse } from "next/server";
import { getOwnedSessionById } from "@/lib/repositories";
import { getAuthSessionFromRequest } from "@/lib/auth";
import { enqueuePrompt, subscribeEvents } from "@/lib/core/agent/registry";
import { ensureAgentForSession } from "@/lib/session/agent.host";
import type { UserMessage } from "@/lib/llm/llm/message";
import type { SessionEvent } from "@/lib/core/session/events";
import {
  hasPromptContent,
  contentToUserMessage,
  isSessionPromptRequest,
  type AdmittedPromptPart,
  type PromptContentPart,
} from "@/lib/session/prompt";
import {
  claimPromptRequest,
  releasePromptRequest,
  sessionEventsAnswerBlock,
} from "@/lib/session/prompt.dedupe";
import { findUIBlockSpec } from "@/lib/session/blocks";
import { readSessionLog } from "@/lib/session/log.cache";
import { getAttachmentStore } from "@/lib/attachments/host";
import { bindReceipts } from "@/lib/attachments/receipts.repo";
import { admitAttachmentPart, isAttachmentError } from "@/lib/attachments/core";

/** A prompt part the server refuses, with the code the client branches on. */
class AdmissionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AdmissionError";
  }
}

async function admitPrompt(
  request: { content: readonly PromptContentPart[] },
  events: readonly SessionEvent[],
  store: ReturnType<typeof getAttachmentStore>,
): Promise<AdmittedPromptPart[] | "duplicate"> {
  const admitted: AdmittedPromptPart[] = [];

  for (const part of request.content) {
    if (part.type === "text") {
      admitted.push({ type: "text", text: part.text });
      continue;
    }

    if (part.type === "ui-block") {
      if (sessionEventsAnswerBlock(events, part.block.id)) return "duplicate";

      const spec = findUIBlockSpec(events, part.block.id);
      if (spec === undefined) {
        throw new AdmissionError("Unknown UI block", "UNKNOWN_BLOCK");
      }
      admitted.push({
        type: "ui-block",
        block: { id: part.block.id, spec, values: part.block.values },
      });
      continue;
    }

    admitted.push(await admitAttachmentPart(store, part));
  }

  return admitted;
}

export async function POST(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }

    const userId = user.id;
    const { sessionId } = await props.params;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "A valid prompt request is required",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }

    if (!isSessionPromptRequest(raw)) {
      return NextResponse.json(
        {
          error: "A valid prompt request is required",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }
    const request = raw;

    if (request.sessionId !== sessionId) {
      return NextResponse.json(
        {
          error: "Request targets a different session",
          code: "SESSION_MISMATCH",
        },
        { status: 400 },
      );
    }

    if (!hasPromptContent(request.content)) {
      return NextResponse.json(
        { error: "Prompt content required", code: "EMPTY_CONTENT" },
        { status: 400 },
      );
    }

    const session = await getOwnedSessionById(userId, sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }

    // One read serves admission and the turn: claim, block check, spec lookup
    // and the loop's replay all share this slice.
    const events = await readSessionLog(sessionId);

    // Claim the request before any work: a retry that lands while the first is
    // still admitting must not append a second user message.
    if (!(await claimPromptRequest(sessionId, request.requestId, events))) {
      return NextResponse.json({ accepted: true });
    }

    let userMessage: UserMessage;
    try {
      const admitted = await admitPrompt(request, events, getAttachmentStore());
      if (admitted === "duplicate") {
        // No turn will run, so nothing else releases this claim.
        releasePromptRequest(sessionId, request.requestId);
        return NextResponse.json({ accepted: true });
      }
      userMessage = contentToUserMessage(request, admitted);
    } catch (error) {
      releasePromptRequest(sessionId, request.requestId);
      if (error instanceof AdmissionError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 400 },
        );
      }
      if (isAttachmentError(error)) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 400 },
        );
      }
      throw error;
    }

    await ensureAgentForSession(session);
    const unsubscribeEvents = subscribeEvents(sessionId, (event) => {
      if (event.type !== "user/message") return;
      const source = event.data.source;
      if (!source || !("rpcId" in source)) return;
      if (source.rpcId !== request.requestId) return;

      releasePromptRequest(sessionId, request.requestId);
      unsubscribeEvents();
    });

    if (!enqueuePrompt(sessionId, [userMessage], request.mode)) {
      unsubscribeEvents();
      releasePromptRequest(sessionId, request.requestId);
      throw new Error(`Session ${sessionId} has no warm agent`);
    }

    // The turn is accepted, so its files are in use and must not be swept.
    try {
      const receiptIds = request.content.flatMap((part) =>
        part.type === "file" ? [part.receiptId] : [],
      );
      bindReceipts(receiptIds, {
        sessionId,
        requestId: request.requestId,
      });
    } catch (error) {
      // Binding is bookkeeping; never fail an accepted turn over it.
      console.error(
        "[Session Events API] Failed to bind attachment receipts:",
        error,
      );
    }

    return NextResponse.json({ accepted: true });
  } catch (error) {
    console.error("Error running session turn:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process session message",
        code: "TURN_FAILED",
      },
      { status: 500 },
    );
  }
}
