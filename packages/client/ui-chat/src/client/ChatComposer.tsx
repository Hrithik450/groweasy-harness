"use client";

/**
 * Composer seat.
 *
 * The app's bottom input section, unchanged: suggestion chips above the
 * attachment-aware input form. Submission and stop callbacks are owner props,
 * so the conversation area keeps its scroll and streaming policy.
 *
 * @module @openai-harness/client-ui-chat/client/ChatComposer
 */

import { ChatInputForm } from "./ChatInputForm";
import type { ComposerOwnerProps } from "./types";

const SUGGESTION_CHIPS = [
  "Campaign brief",
  "Find audiences",
  "Competitor research",
  "Marketing strategy",
  "Schedule daily report at 9 am",
] as const;

/**
 * Render the composer seat.
 * @param props - session title, streaming state, and submit/stop callbacks.
 * @returns the chip row plus the input form.
 */
export function ChatComposer({
  title,
  isStreaming,
  onSubmit,
  onStop,
  uploadUrl,
}: ComposerOwnerProps) {
  return (
    <div className="px-4 pb-4 pt-1 sm:px-6 sm:pb-5 sm:pt-1 bg-transparent shrink-0">
      <div className="max-w-3xl mx-auto space-y-1.5 w-full">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onSubmit(chip)}
              className="px-2.5 py-1 rounded-none border border-border bg-card text-muted-foreground text-[11px] font-medium hover:border-input hover:text-foreground hover:bg-muted transition-all cursor-pointer shrink-0 leading-tight"
            >
              {chip}
            </button>
          ))}
        </div>

        <ChatInputForm
          onSubmit={onSubmit}
          placeholder={`Ask ${title} or request a marketing campaign...`}
          isStreaming={isStreaming}
          onStop={onStop}
          uploadUrl={uploadUrl}
        />
      </div>
    </div>
  );
}
