/**
 * Configuration, selection, pruning, and summarizer vocabulary for the basic
 * compaction strategy.
 *
 * @module @openai-harness/compaction-basic/types
 */

import type { Message, ModelUsage } from "@openai-harness/llm";
import type { SessionEvent, SessionSeq } from "@openai-harness/session";

import type { ToolResultPruner } from "./tool-result-pruner";

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
  /** Owning tenant, used to resolve image attachments. */
  readonly tenantId?: string;
}

/** Safe summary output and the auxiliary call facts. */
export interface SummaryResult {
  readonly summary: string;
  readonly usage?: ModelUsage;
}

/** One summary implementation; the default streams through a model driver. */
export interface Summarizer {
  summarize(
    input: SummarizationInput,
    signal?: AbortSignal,
  ): Promise<SummaryResult>;
}

/**
 * Host bindings the strategy cannot own: environment lookup and the
 * application's model-visible derivation. Supply them per instance or through
 * {@link configureCompactionHost}.
 */
export interface CompactionHostBindings {
  /** Environment source for `CONTEXT_WINDOW`; defaults to an empty record. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * Derive the model-visible conversation from a selected event span. The
   * application binds its session derivation here; the package's default is a
   * projection-aware fallback.
   */
  readonly deriveMessages?: (
    events: readonly SessionEvent[],
  ) => readonly Message[];
}

/** Optional seams for tests and alternate summary/prune implementations. */
export interface BasicCompactionDependencies extends CompactionHostBindings {
  readonly pruner?: ToolResultPruner;
  /** When provided, replaces the default driver-backed summarizer. */
  readonly summarizer?: Summarizer;
}
