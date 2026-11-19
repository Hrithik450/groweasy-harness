/**
 * Compaction vocabulary: configuration, durable event payloads, selection
 * results, and summarizer contracts.
 *
 * The durable log keeps three correlated pieces: a `compaction/checkpoint`
 * marker (summary plus the shadowed range), the `user/message` that carries
 * that summary on the model-visible surface, and model-free
 * `compaction/prune` replacements for oversized tool results.
 *
 * @module @/lib/core/compaction/types
 */

import type { SessionSeq } from "@/lib/core/session/types";
import type { ModelUsage } from "@/lib/llm/llm/driver";
import type { ContentBlock, Message } from "@/lib/llm/llm/message";

/** Why the engine considered compaction. */
export type CompactionTrigger = "pressure";

/** Payload of the log-only `compaction/checkpoint` marker. */
export interface CompactionCheckpointEventData {
  /** Stable identity shared by the marker and its surface message. */
  compactionId: string;
  /** Condensed summary text produced by the summarizer. */
  summary: string;
  /** Inclusive shadowed log range. */
  shadowedRange: { startSeq: SessionSeq; endSeq: SessionSeq };
  /** Every shadowed log position, in order. */
  shadowedSeqs: readonly SessionSeq[];
  /** Heuristic token price of the shadowed content. */
  shadowedTokenCount: number;
  trigger: CompactionTrigger;
}

/** Payload of one model-free tool-result replacement. */
export interface CompactionPruneEventData {
  /** Seq of the full-fidelity `tool/result` event being replaced. */
  originalSeq: SessionSeq;
  /** Replacement model-visible content. */
  content: ContentBlock[];
  /** Original text size in Unicode code points. */
  charsBefore: number;
  /** Replacement text size in Unicode code points. */
  charsAfter: number;
}

/** One landed tool-result replacement. */
export interface PruneEntry {
  readonly originalSeq: SessionSeq;
  /** Seq of the appended `compaction/prune` event. */
  readonly eventSeq: SessionSeq;
  readonly charsBefore: number;
  readonly charsAfter: number;
}

/** Aggregate outcome of one pruning pass. */
export interface PruneResult {
  readonly pruned: readonly PruneEntry[];
  /** Total Unicode code points removed. */
  readonly charsRemoved: number;
}

/** Inclusive span selected for summarization. */
export interface CompactionRange {
  readonly startSeq: SessionSeq;
  readonly endSeq: SessionSeq;
  readonly shadowedSeqs: readonly SessionSeq[];
}

/** Result of one successful compaction. */
export interface CompactionResult {
  readonly compactionId: string;
  /** Seq of the `compaction/checkpoint` marker. */
  readonly checkpointSeq: SessionSeq;
  /** Seq of the checkpoint `user/message` on the surface. */
  readonly messageSeq: SessionSeq;
  readonly summary: string;
  readonly shadowedRange: { startSeq: SessionSeq; endSeq: SessionSeq };
  readonly shadowedSeqs: readonly SessionSeq[];
  readonly shadowedTokenCount: number;
  readonly trigger: CompactionTrigger;
  /** Tool-result replacements landed before summarization. */
  readonly prunedResults: number;
  /** Provider-reported usage for the summarization request, when emitted. */
  readonly summaryUsage?: ModelUsage;
}

/** Character budgets for deterministic tool-result pruning. */
export interface ToolResultPruneConfig {
  /** Prune when total text exceeds this many Unicode code points. Defaults to `8000`. */
  thresholdChars?: number;
  /** Maximum leading Unicode code points retained. Defaults to `2000`. */
  headChars?: number;
  /** Maximum trailing Unicode code points retained. Defaults to `2000`. */
  tailChars?: number;
  /** Most recent tool results that are never pruned. Defaults to `2`. */
  keepRecentResults?: number;
}

/** Validated, immutable pruning configuration. */
export interface ResolvedToolResultPruneConfig {
  readonly thresholdChars: number;
  readonly headChars: number;
  readonly tailChars: number;
  readonly keepRecentResults: number;
}

/** Public compaction policy configuration. */
export interface BasicCompactionConfig {
  /** Window fraction that triggers pressure compaction. Defaults to `0.8`. */
  thresholdRatio?: number;
  /** Recent-context fraction of the window. Defaults to `0.3`. */
  retainRatio?: number;
  /** Absolute recent-context token floor. Defaults to `20000`. */
  retainTokens?: number;
  /** Model context window, overriding `CONTEXT_WINDOW`. Defaults to `128000`. */
  contextWindow?: number;
  /** Enable automatic compaction in the agent loop. Defaults to `true`. */
  auto?: boolean;
  /** Tool-result pruning budgets applied before summarization. */
  toolResultPruner?: ToolResultPruneConfig;
}

/** Validated, immutable compaction configuration. */
export interface ResolvedCompactionConfig {
  readonly thresholdRatio: number;
  readonly retainRatio: number;
  readonly retainTokens: number;
  readonly contextWindow: number;
  readonly auto: boolean;
}

/** Replayed conversation prefix handed to a summarizer. */
export interface SummarizationInput {
  readonly messages: readonly Message[];
}

/** Safe summary output and the auxiliary call facts. */
export interface SummaryResult {
  readonly summary: string;
  readonly usage?: ModelUsage;
}

/** One summary implementation; the default streams through a {@link ModelDriver}. */
export interface Summarizer {
  summarize(
    input: SummarizationInput,
    signal?: AbortSignal,
  ): Promise<SummaryResult>;
}
