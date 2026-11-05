/**
 * Replay-aware compaction strategy.
 *
 * Pressure is measured from the last provider-reported prompt size (with a
 * character-based fallback). The model-free {@link ToolResultPruner} lands
 * first; if pressure remains, an old balanced span is summarized through the
 * same model driver and replaced by one durable checkpoint message.
 *
 * The class owns policy and mutation only. The host supplies two bindings:
 * the environment used for `CONTEXT_WINDOW`, and the session's model-visible
 * derivation. Both arrive per instance or through
 * {@link configureCompactionHost}, so this module imports no application
 * alias, persistence repository, or database singleton.
 *
 * @module @openai-harness/compaction-basic/strategy
 */

import { randomUUID } from "node:crypto";

import {
  CompactionId,
  compactCheckpointSource,
  toolPairingBalancedAfter,
  toolPairingBalancedBefore,
  toolPairingBalances,
} from "@openai-harness/compaction";
import type {
  CompactionResult,
  CompactionSession,
} from "@openai-harness/compaction";
import { MessageId } from "@openai-harness/llm";
import type { Message, ModelDriver } from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";

import { resolveCompactionConfig, retentionTokens } from "./config";
import { deriveMessages } from "./derive";
import {
  estimateRangeTokens,
  estimateVisibleTokens,
  latestPromptTokens,
  projectCompaction,
  selectCompactableRange,
  selectRangeEvents,
  visibleEntries,
} from "./region";
import { frameSummary, summarizeWithDriver } from "./summarizer";
import { ToolResultPruner } from "./tool-result-pruner";
import type {
  BasicCompactionConfig,
  BasicCompactionDependencies,
  CompactionHostBindings,
  CompactionRange,
  ResolvedCompactionConfig,
  Summarizer,
} from "./types";

let configuredHost: CompactionHostBindings = {};

/**
 * Install host bindings used by every strategy constructed afterwards.
 * @param bindings - environment and derivation supplied by the application.
 */
export function configureCompactionHost(bindings: CompactionHostBindings): void {
  configuredHost = { ...configuredHost, ...bindings };
}

/**
 * Clear installed host bindings. Intended for tests that need an isolated host.
 */
export function resetCompactionHost(): void {
  configuredHost = {};
}

/** Approximate token contribution of text the pruner removed. */
function removedTokens(charsRemoved: number): number {
  return Math.ceil(charsRemoved / 4);
}

/**
 * Threshold-driven automatic compaction with a model-free pruning first pass.
 */
export class BasicCompactionStrategy {
  readonly config: ResolvedCompactionConfig;

  private readonly pruner: ToolResultPruner;
  private readonly summarizer: Summarizer | undefined;
  private readonly derive: (
    events: readonly SessionEvent[],
  ) => readonly Message[];

  constructor(
    config: BasicCompactionConfig = {},
    dependencies: BasicCompactionDependencies = {},
  ) {
    this.config = resolveCompactionConfig(
      config,
      dependencies.env ?? configuredHost.env,
    );
    this.pruner =
      dependencies.pruner ??
      new ToolResultPruner(config.toolResultPruner ?? {});
    this.summarizer = dependencies.summarizer;
    this.derive =
      dependencies.deriveMessages ??
      configuredHost.deriveMessages ??
      deriveMessages;
  }

  /**
   * Consider automatic compaction before one model step.
   *
   * @param session - session whose log is measured and mutated.
   * @param driver - provider driver used by the default summarizer.
   * @param signal - cancellation signal forwarded to summarization.
   * @returns the compaction result, or `null` when no safe reduction ran.
   */
  async compactIfNeeded(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null> {
    signal?.throwIfAborted();

    const thresholdTokens =
      this.config.thresholdRatio * this.config.contextWindow;
    const usageTokens = latestPromptTokens(session.events);
    const observedTokens =
      usageTokens ?? estimateVisibleTokens(session.events);
    if (observedTokens < thresholdTokens) return null;

    // Model-free first pass. The reported prompt size is stale after a prune,
    // so subtract its approximate contribution before deciding whether an LLM
    // summary is still required.
    const pruned = this.pruner.pruneSession(session);
    signal?.throwIfAborted();
    const afterPruneTokens =
      usageTokens === undefined
        ? estimateVisibleTokens(session.events)
        : Math.max(0, usageTokens - removedTokens(pruned.charsRemoved));
    if (afterPruneTokens < thresholdTokens) return null;

    const range = selectCompactableRange(
      session.events,
      retentionTokens(this.config),
    );
    if (range === null) return null;

    return this.summarizeRange(
      session,
      driver,
      range,
      signal,
      pruned.pruned.length,
    );
  }

  /**
   * Compatibility alias for the application's automatic step guard.
   * @param session - session whose log is measured and mutated.
   * @param driver - provider driver used by the default summarizer.
   * @param signal - cancellation signal forwarded to summarization.
   * @returns the compaction result, or `null` when no safe reduction ran.
   */
  maybeCompact(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null> {
    return this.compactIfNeeded(session, driver, signal);
  }

  /**
   * Force one explicit inclusive surface range to be compacted.
   *
   * `startSeq` and `endSeq` name current model-visible positions, so both
   * edges must be tool-pairing balanced.
   *
   * @param startSeq - inclusive first surface-node seq.
   * @param endSeq - inclusive last surface-node seq.
   * @param session - session whose log is mutated.
   * @param driver - provider driver used by the default summarizer.
   * @param signal - optional cancellation forwarded to summarization.
   * @returns the successful compaction result.
   * @throws when the range is missing, reversed, unbalanced, or empty.
   */
  async compactRegion(
    startSeq: CompactionRange["startSeq"],
    endSeq: CompactionRange["endSeq"],
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult> {
    signal?.throwIfAborted();

    const projection = projectCompaction(session.events);
    const entries = visibleEntries(session.events, projection);
    const startIdx = entries.findIndex((entry) => entry.seq === startSeq);
    if (startIdx === -1) {
      throw new Error(
        `compactRegion: start seq ${String(startSeq)} not found in surface`,
      );
    }
    const endIdx = entries.findIndex((entry) => entry.seq === endSeq);
    if (endIdx === -1) {
      throw new Error(
        `compactRegion: end seq ${String(endSeq)} not found in surface`,
      );
    }
    if (startIdx > endIdx) {
      throw new Error(
        `compactRegion: start seq ${String(startSeq)} is after end seq ${String(endSeq)}`,
      );
    }
    const balances = toolPairingBalances(entries);
    if (!toolPairingBalancedBefore(balances, startIdx)) {
      throw new Error(
        `compactRegion: start seq ${String(startSeq)} is not a balanced boundary`,
      );
    }
    if (!toolPairingBalancedAfter(balances, endIdx)) {
      throw new Error(
        `compactRegion: end seq ${String(endSeq)} is not a balanced boundary`,
      );
    }

    const range: CompactionRange = {
      startSeq,
      endSeq,
      shadowedSeqs: entries.slice(startIdx, endIdx + 1).map((entry) => entry.seq),
    };
    const result = await this.summarizeRange(
      session,
      driver,
      range,
      signal,
      0,
    );
    if (result === null) {
      throw new Error("compactRegion: the selected range produced no summary");
    }
    return result;
  }

  /**
   * Explicitly compact useful history even below the pressure threshold.
   * @param session - session whose durable history should be compacted.
   * @param driver - provider driver used by the default summarizer.
   * @param signal - optional cancellation scoped to this request.
   * @returns the compaction result, or `null` when no safe useful range exists.
   */
  async compactNow(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null> {
    signal?.throwIfAborted();
    const range = selectCompactableRange(session.events, 0);
    if (range === null) return null;
    return this.summarizeRange(session, driver, range, signal, 0);
  }

  /**
   * Summarize one selected range and append its checkpoint marker and message.
   * @param session - session whose log receives the durable transaction.
   * @param driver - provider driver used by the default summarizer.
   * @param range - selected inclusive span.
   * @param signal - optional cancellation.
   * @param prunedResults - pruner hits landed before this summary.
   * @returns the compaction result, or `null` when the range yielded no text.
   */
  private async summarizeRange(
    session: CompactionSession,
    driver: ModelDriver,
    range: CompactionRange,
    signal: AbortSignal | undefined,
    prunedResults: number,
  ): Promise<CompactionResult | null> {
    const projection = projectCompaction(session.events);
    const selectedEvents = selectRangeEvents(session.events, range, projection);
    if (selectedEvents.length === 0) return null;

    const messages = this.derive(selectedEvents);
    if (messages.length === 0) return null;

    const tenantId = session.userId;
    const summaryResult = await (this.summarizer === undefined
      ? summarizeWithDriver(driver, { messages, tenantId }, signal)
      : this.summarizer.summarize({ messages, tenantId }, signal));
    signal?.throwIfAborted();

    const summary = summaryResult.summary.trim();
    if (summary.length === 0) return null;

    const shadowedTokenCount = estimateRangeTokens(
      session.events,
      range,
      projection,
    );
    const compactionId = CompactionId(randomUUID());
    const checkpoint = session.append("compaction/checkpoint", {
      compactionId,
      summary,
      shadowedRange: {
        startSeq: range.startSeq,
        endSeq: range.endSeq,
      },
      shadowedSeqs: range.shadowedSeqs,
      shadowedTokenCount,
      trigger: "pressure",
    });
    const message = session.append("user/message", {
      id: MessageId(randomUUID()),
      role: "user",
      content: [{ type: "text", text: frameSummary(summary) }],
      source: compactCheckpointSource(compactionId),
    });

    return {
      compactionId,
      checkpointSeq: checkpoint.seq,
      messageSeq: message.seq,
      summary,
      shadowedRange: {
        startSeq: range.startSeq,
        endSeq: range.endSeq,
      },
      shadowedSeqs: range.shadowedSeqs,
      shadowedTokenCount,
      trigger: "pressure",
      prunedResults,
      ...(summaryResult.usage === undefined
        ? {}
        : { summaryUsage: summaryResult.usage }),
    };
  }
}
