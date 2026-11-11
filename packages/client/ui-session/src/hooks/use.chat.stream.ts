"use client";

/**
 * Chat submission and follow-stream binding for one session.
 *
 * A submit is admitted with `session.prompt` and acknowledged immediately; the
 * turn itself (durable events plus live assistant text) arrives over the
 * session follow stream. The UI therefore never applies server frames itself:
 * it folds the journal and overlays only the two things that are not durable
 * yet (the submitted prompt and the open assistant step).
 *
 * The journal and the RPC client are application bindings, injected through
 * `configureClientSession`. This module imports no application alias.
 *
 * @module @openai-harness/client-ui-session/hooks/use.chat.stream
 */

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { UIBlockSpec } from "@openai-harness/generative-ui";
import type { SessionEvent } from "@openai-harness/session";
import {
  getClientSessionDependencies,
  resolveRpcClient,
  type SessionControllerLike,
  type SessionControllerSnapshotLike,
  type SessionJournalBindingLike,
} from "../config";
import {
  pendingPrompts,
  type OptimisticPrompt,
} from "../internal/pending";
import { randomUUID } from "../internal/uuid";

/** One composer submission. `hidden` marks UI-synthesized input. */
export interface ChatTurnPayload {
  input: string;
  hidden?: boolean;
}

/** True while the log holds a started turn without its ending. */
function hasOpenTurn(events: readonly SessionEvent[]): boolean {
  const open = new Set<number>();
  for (const event of events) {
    if (event.type === "turn/start") open.add(event.data.turn);
    else if (event.type === "turn/end") open.delete(event.data.turn);
  }
  return open.size > 0;
}

export interface ChatStream {
  readonly journal: SessionControllerSnapshotLike;
  readonly journalController: SessionControllerLike;
  /** Prompts submitted but not yet committed in the log. */
  readonly optimistic: OptimisticPrompt[];
  readonly isStreaming: boolean;
  sendTurn(payload: ChatTurnPayload, sessionId: string): Promise<void>;
  submitBlock(
    sessionId: string,
    blockId: string,
    spec: UIBlockSpec,
  ): Promise<void>;
  stopStream(): void;
}

/** Resolve the bound session-journal hook and open one journal. */
function useConfiguredSessionJournal(
  sessionId: string,
): SessionJournalBindingLike {
  const hook = getClientSessionDependencies().useSessionJournal;
  if (hook === undefined) {
    throw new Error(
      "@openai-harness/client-ui-session: configureClientSession({ useSessionJournal }) must be called before useChatStream.",
    );
  }
  return hook(sessionId);
}

/** Binds one session's journal to its prompt and block submission surface. */
export function useChatStream(sessionId: string): ChatStream {
  const { snapshot: journal, controller: journalController } =
    useConfiguredSessionJournal(sessionId);
  const [submitted, setSubmitted] = useState<OptimisticPrompt[]>([]);
  const [pendingSinceSeq, setPendingSinceSeq] = useState<number | null>(null);

  const lastSeq = journal.window.events.at(-1)?.seq ?? -1;

  const derivePending =
    getClientSessionDependencies().pendingPrompts ?? pendingPrompts;

  const optimistic = useMemo(
    () => derivePending(journal.window.events, submitted),
    // The window mutates in place; revision is the change signal.
    [journal.window.revision, submitted, derivePending],
  );

  // Any one signal keeps the session streaming. The durable ones are checked
  // first and are never masked by the optimistic window: a submission queued
  // behind a running turn is closed by that turn's `turn/end` before its own
  // turn starts, and reading only the submission hid the indicator for the
  // rest of the turn.
  const isStreaming = useMemo(() => {
    if (
      journal.assistantStream !== undefined ||
      hasOpenTurn(journal.window.events)
    ) {
      return true;
    }
    // Submitted, with no durable user message yet.
    if (optimistic.length > 0) return true;
    if (pendingSinceSeq === null) return false;
    // A block submission commits no user message, so its own window is the
    // only signal until the turn it admitted appears.
    return !journal.window.events.some(
      (event) => event.seq > pendingSinceSeq && event.type === "turn/end",
    );
  }, [
    pendingSinceSeq,
    journal.window.revision,
    journal.assistantStream,
    optimistic,
  ]);

  /** Cancels the running turn; the log closes it as aborted. */
  const stopStream = useCallback(() => {
    setPendingSinceSeq(null);
    try {
      void resolveRpcClient()
        .call("session.cancel", { sessionId })
        .catch(() => {});
    } catch {
      // The transport is not bound; stopping is still local.
    }
    toast.info("Generation stopped");
  }, [sessionId]);

  const sendTurn = useCallback(
    async (payload: ChatTurnPayload, targetSessionId: string) => {
      const input = payload.input.trim();
      if (!input) {
        toast.error("Text content required");
        return;
      }

      const requestId =
        getClientSessionDependencies().createId?.() ?? randomUUID();
      if (!payload.hidden) {
        setSubmitted((previous) => [
          ...previous,
          { requestId, text: input, createdAt: new Date().toISOString() },
        ]);
      }
      setPendingSinceSeq(lastSeq);

      try {
        const result = (await resolveRpcClient().call("session.prompt", {
          requestId,
          sessionId: targetSessionId,
          mode: "queue",
          content: [{ type: "text", text: input }],
          ...(payload.hidden === true ? { origin: "ui-action" as const } : {}),
        })) as { accepted?: boolean };
        // The receipt is admission, not completion: the turn streams over the
        // follow subscription.
        if (!result.accepted) throw new Error("Prompt was not admitted");
      } catch (error) {
        setPendingSinceSeq(null);
        setSubmitted((previous) =>
          previous.filter((prompt) => prompt.requestId !== requestId),
        );
        toast.error(
          error instanceof Error
            ? error.message
            : "Something went wrong while sending the message.",
        );
      }
    },
    [lastSeq],
  );

  /**
   * Submits one interactive block. The gateway commits the updated spec as a
   * replacement `ui/block` event and admits the extracted values as UI-action
   * context, so the transcript never shows a synthetic user bubble.
   */
  const submitBlock = useCallback(
    async (targetSessionId: string, blockId: string, spec: UIBlockSpec) => {
      setPendingSinceSeq(lastSeq);
      try {
        const result = (await resolveRpcClient().call("session.block.submit", {
          sessionId: targetSessionId,
          blockId,
          spec,
        })) as { accepted?: boolean };
        if (!result.accepted) {
          throw new Error("Block submission was not admitted");
        }
      } catch (error) {
        setPendingSinceSeq(null);
        toast.error(
          error instanceof Error
            ? error.message
            : "Something went wrong while submitting the form.",
        );
      }
    },
    [lastSeq],
  );

  return {
    journal,
    journalController,
    optimistic,
    isStreaming,
    sendTurn,
    submitBlock,
    stopStream,
  };
}
