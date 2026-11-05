/**
 * Dedicated one-shot summarization over the provider-neutral model driver.
 *
 * @module @openai-harness/compaction-basic/summarizer
 */

import { MessageId } from "@openai-harness/llm";
import type { Message, ModelDriver, ModelUsage } from "@openai-harness/llm";

import type { SummarizationInput, SummaryResult } from "./types";

const SUMMARY_OPEN_TAG = "<compacted-summary>";
const SUMMARY_CLOSE_TAG = "</compacted-summary>";

/**
 * The summarization directive is the final user message after the replayed
 * span. Keeping the span's own roles and turns in front of it keeps summary
 * input aligned with the conversation the model actually saw.
 */
export const COMPACTION_INSTRUCTION = [
  "Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.",
  "",
  "Output EXACTLY this Markdown structure, keeping every section in order:",
  "",
  "## Primary Request and Intent",
  "## Key Technical Concepts",
  "## Files and Code",
  "## Errors and Fixes",
  "## Pending Jobs",
  "## Current Work",
  "## Next Step",
  "## Critical Context",
  "",
  "Rules:",
  "- Use terse bullets, not prose paragraphs. Write \"(none)\" for an empty section.",
  "- Preserve exact file paths, commands, error strings, identifiers, numeric values, and function signatures.",
  "- Capture user feedback and explicit instructions faithfully, especially corrections.",
  "- Do NOT mention this summarization request or that context was compacted.",
  "- Output only the checkpoint text; do not call any tool.",
].join("\n");

/** Framing that makes the replacement user message established context. */
export const CHECKPOINT_PREAMBLE =
  "This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.";

/**
 * Stream one summary request through a model driver.
 * @param driver - provider wire implementation.
 * @param input - replayed conversation span.
 * @param signal - cancellation forwarded to the driver.
 * @returns trimmed summary text and reported usage.
 */
export async function summarizeWithDriver(
  driver: ModelDriver,
  input: SummarizationInput,
  signal?: AbortSignal,
): Promise<SummaryResult> {
  const messages: Message[] = [
    ...input.messages,
    {
      id: MessageId("compaction-instruction"),
      role: "user",
      content: [{ type: "text", text: COMPACTION_INSTRUCTION }],
    },
  ];

  let text = "";
  let usage: ModelUsage | undefined;
  for await (const frame of driver.stream({
    messages,
    signal,
    tenantId: input.tenantId,
  })) {
    if (frame.type === "text-delta") {
      text += frame.delta;
    } else if (frame.type === "usage") {
      usage = frame.usage;
    }
  }

  return {
    summary: text.trim(),
    ...(usage === undefined ? {} : { usage }),
  };
}

/**
 * Wrap summary text in the durable checkpoint framing.
 * @param summary - safe text-only model output.
 * @returns content placed on the replacement `user/message`.
 */
export function frameSummary(summary: string): string {
  return `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}\n${summary}\n${SUMMARY_CLOSE_TAG}`;
}
