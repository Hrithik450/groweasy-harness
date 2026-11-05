/**
 * Replay-safe, model-free tool-result pruning.
 *
 * Long tool output dominates many agent transcripts, so the deterministic
 * first pass replaces the middle of an over-budget text result with
 * {@link PRUNE_MARKER} while preserving every non-text block in order. The
 * replacement is recorded as a durable `compaction/prune` event; derivation
 * applies it without rewriting history.
 *
 * @module @openai-harness/compaction-basic/tool-result-pruner
 */

import type { CompactionSession } from "@openai-harness/compaction";
import type { ContentBlock } from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";

import {
  codePointLength,
  PRUNE_MARKER,
  resolveToolResultPruneConfig,
} from "./config";
import { projectCompaction } from "./region";
import type {
  PruneEntry,
  PruneResult,
  ResolvedToolResultPruneConfig,
  ToolResultPruneConfig,
} from "./types";

/** Normalize the two supported tool-result content shapes to blocks. */
function contentBlocks(content: ContentBlock[] | string): ContentBlock[] {
  return typeof content === "string"
    ? [{ type: "text", text: content }]
    : content;
}

/** Deterministic head/middle/tail pruning over tool-result content. */
export class ToolResultPruner {
  readonly config: ResolvedToolResultPruneConfig;

  constructor(config: ToolResultPruneConfig = {}) {
    this.config = resolveToolResultPruneConfig(config);
  }

  /**
   * Measure text content in Unicode code points; non-text blocks cost zero.
   * @param blocks - content to measure.
   * @returns total code points across text blocks.
   */
  measureContent(blocks: readonly ContentBlock[]): number {
    let chars = 0;
    for (const block of blocks) {
      if (block.type === "text") chars += codePointLength(block.text);
    }
    return chars;
  }

  /**
   * Replace an over-budget text middle while retaining non-text block order.
   *
   * Slicing is by Unicode code point, so a retained boundary cannot split a
   * surrogate pair. Grapheme clusters may still split.
   *
   * @param blocks - original tool-result content.
   * @returns pruned content, or `null` when already within budget.
   */
  pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null {
    const totalChars = this.measureContent(blocks);
    if (totalChars <= this.config.thresholdChars) return null;

    const removedStart = this.config.headChars;
    const removedEnd = totalChars - this.config.tailChars;
    const pruned: ContentBlock[] = [];
    let consumed = 0;
    let markerInserted = false;

    for (const block of blocks) {
      if (block.type !== "text") {
        pruned.push(block);
        continue;
      }

      const points = Array.from(block.text);
      const blockStart = consumed;
      const blockEnd = blockStart + points.length;
      const headEnd = Math.min(
        points.length,
        Math.max(0, removedStart - blockStart),
      );
      const tailStart = Math.min(
        points.length,
        Math.max(0, removedEnd - blockStart),
      );
      const intersectsRemoved =
        blockStart < removedEnd && blockEnd > removedStart;
      const marker = intersectsRemoved && !markerInserted ? PRUNE_MARKER : "";
      if (marker.length > 0) markerInserted = true;
      const text =
        points.slice(0, headEnd).join("") +
        marker +
        points.slice(tailStart).join("");
      if (text.length > 0) pruned.push({ ...block, text });
      consumed = blockEnd;
    }

    if (!markerInserted) {
      throw new Error(
        "tool-result prune: failed to locate the removed text span",
      );
    }
    const charsAfter = this.measureContent(pruned);
    if (charsAfter > this.config.thresholdChars || charsAfter >= totalChars) {
      throw new Error(
        "tool-result prune: replacement must be smaller and within threshold",
      );
    }
    return pruned;
  }

  /**
   * Prune every over-budget tool result except the most recent
   * `keepRecentResults`, appending one durable replacement event per hit.
   *
   * Each event cites the replaced `tool/result` by seq and carries the exact
   * replacement content, so derivation can apply it without reconstructing
   * prune state.
   *
   * @param session - session whose append-only log receives replacements.
   * @returns landed replacements and aggregate code-point savings.
   */
  pruneSession(session: CompactionSession): PruneResult {
    const projection = projectCompaction(session.events);
    const results = session.events.filter(
      (event): event is Extract<SessionEvent, { type: "tool/result" }> =>
        event.type === "tool/result",
    );
    const keepRecent = this.config.keepRecentResults;
    const protectedSeqs = new Set(
      (keepRecent > 0 ? results.slice(-keepRecent) : []).map(
        (event) => event.seq,
      ),
    );
    const alreadyPruned = new Set(
      session.events
        .filter(
          (
            event,
          ): event is Extract<SessionEvent, { type: "compaction/prune" }> =>
            event.type === "compaction/prune",
        )
        .map((event) => event.data.originalSeq),
    );

    const pruned: PruneEntry[] = [];
    let charsRemoved = 0;

    for (const result of results) {
      if (
        protectedSeqs.has(result.seq) ||
        alreadyPruned.has(result.seq) ||
        projection.shadowedSeqs.has(result.seq)
      ) {
        continue;
      }

      const original = contentBlocks(result.data.message.content);
      const content = this.pruneContent(original);
      if (content === null) continue;

      const charsBefore = this.measureContent(original);
      const charsAfter = this.measureContent(content);
      const event = session.append("compaction/prune", {
        originalSeq: result.seq,
        content,
        charsBefore,
        charsAfter,
      });

      pruned.push({
        originalSeq: result.seq,
        eventSeq: event.seq,
        charsBefore,
        charsAfter,
      });
      charsRemoved += charsBefore - charsAfter;
    }

    return { pruned, charsRemoved };
  }
}
