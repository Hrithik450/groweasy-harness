/**
 * Replay-aware compaction engine.
 *
 * The log is never rewritten: a compaction appends a `user/message` carrying
 * the summary plus a `compaction/checkpoint` marker whose range shadows the
 * summarized span. `region.ts` folds those markers into the model-visible
 * surface, so derivation, pressure measurement, and selection agree.
 *
 * @module @/lib/core/compaction
 */

import type { AgentSession } from "@/lib/core/agent/loop/types";
import type { SessionEvent } from "@/lib/core/session/events";
import { MessageId } from "@/lib/core/session/brand";
import type { ContentBlock, Message } from "@/lib/llm/llm/message";
import type {
  ModelDriver,
  ModelMessage,
  ModelUsage,
} from "@/lib/llm/llm/driver";
import { randomUUID } from "@/lib/utils/uuid";
import { toChatMessages } from "@/lib/session/derive/chat";
import {
  cronTurnSet,
  estimateRangeTokens,
  estimateVisibleTokens,
  projectCompaction,
  selectCompactableRange,
  selectRangeEvents,
} from "./region";
import type {
  CompactionResult,
  ResolvedCompactionConfig,
  SummaryResult,
} from "./types";

export * from "./types";
export * from "./region";

/** Tags wrapping the structured checkpoint summary. */
const SUMMARY_OPEN_TAG = "<compacted-summary>";
const SUMMARY_CLOSE_TAG = "</compacted-summary>";

/** Framing that makes the replacement message established context. */
const CHECKPOINT_PREAMBLE =
  "This is an automatically generated checkpoint condensing an earlier span " +
  "of the conversation to free up context. Treat the captured context as " +
  "established background and build on it without restating it. Continue the " +
  "task directly from the messages that follow, without acknowledging this " +
  "checkpoint.";

/**
 * Mirror of dsh's compaction directive: delivered as the final user message,
 * with a fixed section structure so no essential context is lost.
 */
const COMPACTION_INSTRUCTION = [
  "You are now acting as a compaction engine for this AI marketing assistant.",
  "Condense the conversation ABOVE into a structured checkpoint that lets ",
  "another model resume the work with no loss of essential context.",
  "",
  "Output EXACTLY the Markdown structure below: keep every section, in order.",
  'Use terse bullets, not prose paragraphs. Write "(none)" for an empty ',
  "section — never drop a section.",
  "",
  "## Primary Request and Intent",
  "- [the user's original and evolving goals; quote verbatim where exact wording matters]",
  "",
  "## Key Facts and Data",
  "- [brand facts, metrics, numbers, dates, identifiers, and conclusions reached]",
  "",
  "## Campaigns, Creatives, and Connectors",
  "- [campaign/ad/account ids, statuses, connector state, and what was changed]",
  "",
  "## Errors and Fixes",
  "- [error: how it was resolved, plus any related user feedback]",
  "",
  "## Pending Jobs",
  "- [explicitly requested work not yet completed]",
  "",
  "## Current Work",
  "- [precisely what was in progress at this checkpoint]",
  "",
  "## Next Step",
  '- [the single next action, directly in line with the most recent request, or "(none)"]',
  "",
  "## Critical Context",
  "- [decisions and rationale, constraints, user preferences, open questions]",
  "",
  "Rules:",
  "- Write concise English. Preserve exact identifiers, numeric values, and names.",
  "- Capture user feedback and explicit instructions faithfully, especially corrections.",
  "- Do NOT mention this summarization request or that the context was compacted.",
  "- Output only the checkpoint text: do not call any tool or take any other action.",
  `- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint. Preserve still-true facts, drop stale ones, and merge newer information into one consolidated summary.`,
].join("\n");

/** Render one message's content as summary input text. */
function messageText(content: string | readonly ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .map((block) => {
      switch (block.type) {
        case "text":
          return block.text;
        case "tool-call":
          return `[tool ${block.name} ${block.arguments}]`;
        case "reasoning":
          return "";
        case "block":
          return `[ui block ${block.spec.root}]`;
        case "image":
          return "[image]";
        case "video":
          return "[video]";
        case "file":
          return `[file ${block.filename ?? "attachment"}]`;
      }
    })
    .filter(Boolean)
    .join("\n");
}

/** Flatten the replayed range into one summarizer transcript. */
function transcriptText(messages: readonly Message[]): string {
  return messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}: ${messageText(message.content)}`,
    )
    .join("\n\n");
}

/** Ask the routed model for one summary of the selected span. */
async function summarize(
  driver: ModelDriver,
  transcript: string,
  tenantId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<SummaryResult | null> {
  const input: ModelMessage[] = [
    { role: "user", content: `Conversation to compress:\n\n${transcript}` },
    { role: "user", content: COMPACTION_INSTRUCTION },
  ];

  let text = "";
  let usage: ModelUsage | undefined;

  for await (const frame of driver.stream({
    messages: input,
    signal,
    ...(tenantId !== undefined ? { tenantId } : {}),
  })) {
    if (frame.type === "text-delta") text += frame.delta;
    else if (frame.type === "usage") usage = frame.usage;
    else if (frame.type === "done") break;
  }

  const summary = text.trim();
  if (summary.length === 0) return null;
  return { summary, ...(usage !== undefined ? { usage } : {}) };
}

/** Deterministic tool-result pruning budgets. */
const PRUNE = {
  thresholdChars: 8_000,
  headChars: 2_000,
  tailChars: 2_000,
  keepRecentResults: 2,
} as const;

/** Prompt overhead the visible-surface estimate omits (system, tool schemas). */
function overheadTokens(): number {
  const value = Number(process.env.COMPACTION_OVERHEAD_TOKENS);
  return Number.isSafeInteger(value) && value >= 0 ? value : 35_000;
}

/**
 * Token budget that triggers compaction.
 *
 * `COMPACTION_THRESHOLD_TOKENS` wins; otherwise 80% of the model window.
 */
function thresholdTokens(config: ResolvedCompactionConfig): number {
  const explicit = Number(process.env.COMPACTION_THRESHOLD_TOKENS);
  if (Number.isSafeInteger(explicit) && explicit > 0) return explicit;
  return Math.floor(config.contextWindow * config.thresholdRatio);
}

/**
 * Policy holder plus the summarizer.
 *
 * `maybeCompact` runs before each model step (the loop consults it), appends
 * the checkpoint pair when pressure crosses the threshold, and leaves the
 * history untouched otherwise.
 */
export class CompactionEngine {
  readonly config: ResolvedCompactionConfig;

  constructor(overrides: Partial<ResolvedCompactionConfig> = {}) {
    const envWindow = Number(process.env.CONTEXT_WINDOW);
    const envRetain = Number(process.env.COMPACTION_RETAIN_TOKENS);
    const envAuto = process.env.COMPACTION_AUTO;

    this.config = {
      thresholdRatio: 0.8,
      retainRatio: 0.3,
      retainTokens:
        Number.isSafeInteger(envRetain) && envRetain > 0 ? envRetain : 50_000,
      contextWindow:
        Number.isSafeInteger(envWindow) && envWindow > 0 ? envWindow : 250_000,
      auto: envAuto !== "false",
      ...overrides,
    };
  }

  /** The loop reads this before calling {@link maybeCompact}. */
  get auto(): boolean {
    return this.config.auto;
  }

  /**
   * Replace oversized tool-result text with a head/tail excerpt.
   *
   * Pure log append: `region.ts` folds each replacement into the next
   * projection. Attachments and the most recent results are left untouched.
   */
  private pruneToolResults(session: AgentSession): number {
    const events = session.events;
    const projection = projectCompaction(events);
    const cronTurns = cronTurnSet(events);
    const candidates = events.filter(
      (event): event is Extract<SessionEvent, { type: "tool/result" }> =>
        event.type === "tool/result" &&
        !projection.pruneBySeq.has(event.seq) &&
        // Cron results never reach the model, so pruning them is wasted log.
        !cronTurns.has(event.data.turn),
    );
    const keep = new Set(
      candidates.slice(-PRUNE.keepRecentResults).map((event) => event.seq),
    );

    let pruned = 0;
    for (const event of candidates) {
      if (keep.has(event.seq)) continue;

      const content = event.data.message.content;
      let text: string;
      if (typeof content === "string") {
        text = content;
      } else if (content.every((block) => block.type === "text")) {
        text = content
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("\n");
      } else {
        // Never drop attachments or structured blocks from a result.
        continue;
      }

      const chars = Array.from(text);
      if (chars.length <= PRUNE.thresholdChars) continue;

      const head = chars.slice(0, PRUNE.headChars).join("");
      const tail = chars.slice(-PRUNE.tailChars).join("");
      const dropped = chars.length - head.length - tail.length;

      session.append("compaction/prune", {
        originalSeq: event.seq,
        content: [
          {
            type: "text",
            text: `${head}\n\n…[${dropped} characters pruned]…\n\n${tail}`,
          },
        ],
        charsBefore: chars.length,
        charsAfter: Array.from(head + tail).length,
      });
      pruned += 1;
    }

    return pruned;
  }

  async maybeCompact(
    session: AgentSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null> {
    // Pruning is model-free and cheap: run it on every step, before pressure.
    const prunedResults = this.pruneToolResults(session);

    const events = session.events;
    const projection = projectCompaction(events);
    const pressure =
      estimateVisibleTokens(events, projection) + overheadTokens();
    const budget = thresholdTokens(this.config);

    if (pressure < budget) return null;

    const range = selectCompactableRange(events, this.config.retainTokens);
    if (range === null) return null;

    const rangeEvents = selectRangeEvents(events, range, projection);
    const transcript = transcriptText(toChatMessages(rangeEvents));
    if (transcript.trim().length === 0) return null;

    const result = await summarize(driver, transcript, session.userId, signal);
    if (result === null) return null;

    const shadowedTokenCount = estimateRangeTokens(events, range, projection);
    const compactionId = randomUUID();

    const tagged = result.summary.includes(SUMMARY_OPEN_TAG)
      ? result.summary
      : `${SUMMARY_OPEN_TAG}\n${result.summary}\n${SUMMARY_CLOSE_TAG}`;
    const surface = `${CHECKPOINT_PREAMBLE}\n\n${tagged}`;

    const message = session.append("user/message", {
      id: MessageId(randomUUID()),
      role: "user",
      content: [{ type: "text", text: surface }],
      source: { kind: "compact-checkpoint", compactionId },
    });
    const checkpoint = session.append("compaction/checkpoint", {
      compactionId,
      summary: tagged,
      shadowedRange: {
        startSeq: range.startSeq,
        endSeq: range.endSeq,
      },
      shadowedSeqs: range.shadowedSeqs,
      shadowedTokenCount,
      trigger: "pressure",
    });

    return {
      compactionId,
      checkpointSeq: checkpoint.seq,
      messageSeq: message.seq,
      summary: result.summary,
      shadowedRange: {
        startSeq: range.startSeq,
        endSeq: range.endSeq,
      },
      shadowedSeqs: range.shadowedSeqs,
      shadowedTokenCount,
      trigger: "pressure",
      prunedResults,
      ...(result.usage !== undefined ? { summaryUsage: result.usage } : {}),
    };
  }
}
