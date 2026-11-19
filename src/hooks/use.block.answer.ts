"use client";

/**
 * The one place the client turns a block interaction into a prompt.
 *
 * A block answer is a normal submission: build the wire part, send it, then
 * drop the draft values for that scope. Nothing else in the UI should talk to
 * the block-submission path directly.
 *
 * @module @/hooks/use.block.answer
 */

import { useCallback, useRef } from "react";
import { createUiActionPromptRequest } from "@/lib/session/prompt";
import { useInteractiveStore } from "@/store";
import { useChatStream } from "./use.chat.stream";

export type AnswerBlock = (
  blockId: string,
  values: Record<string, unknown>,
) => Promise<void>;

/**
 * @param sessionId - the session the block was rendered in.
 * @returns submit for one block answer, guarded against double submission.
 */
export function useBlockAnswer(sessionId: string): AnswerBlock {
  const { sendTurn } = useChatStream();
  const inFlight = useRef(false);

  return useCallback(
    async (blockId, values) => {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        // Renderer-only bookkeeping keys are not part of the answer.
        const answer = { ...values };
        delete answer._source;
        delete answer.scopeId;

        await sendTurn(
          createUiActionPromptRequest(sessionId, {
            blockId,
            values: answer,
          }),
        );
        // The answer is durable now; a draft would leak into the next render.
        useInteractiveStore.getState().clearScope(blockId);
      } catch (error) {
        // sendTurn already surfaced the failure; keep the draft for a retry.
        console.error("[BlockAnswer] Submission failed:", error);
      } finally {
        inFlight.current = false;
      }
    },
    [sendTurn, sessionId],
  );
}
