"use client";

import { useCallback, useRef } from "react";
import {
  createSessionPromptRequest,
  type PromptContentPart,
  type PromptSource,
} from "@/lib/session/prompt";
import { useChatStream } from "./use.chat.stream";

export interface SubmitTextOptions {
  /** Who started the turn; absent means the human. */
  source?: PromptSource;
  receiptIds?: readonly string[];
}

export interface PromptSubmit {
  submitText: (text: string, options?: SubmitTextOptions) => Promise<boolean>;
}

export function usePromptSubmit(sessionId: string): PromptSubmit {
  const inFlight = useRef(false);
  const { sendTurn } = useChatStream();

  const submitText = useCallback(
    async (text: string, options: SubmitTextOptions = {}) => {
      const content = text.trim();
      const receipts = options.receiptIds ?? [];

      if ((content.length === 0 && receipts.length === 0) || inFlight.current) {
        return false;
      }
      inFlight.current = true;

      const parts: PromptContentPart[] = [
        ...(content.length > 0
          ? [{ type: "text" as const, text: content }]
          : []),
        ...receipts.map((receiptId) => ({ type: "file" as const, receiptId })),
      ];

      try {
        await sendTurn(
          createSessionPromptRequest(sessionId, parts, {
            mode: "queue",
            ...(options.source !== undefined ? { source: options.source } : {}),
          }),
        );
        return true;
      } catch (error) {
        console.error("[PromptSubmit] Submission failed:", error);
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [sendTurn, sessionId],
  );

  return { submitText };
}
