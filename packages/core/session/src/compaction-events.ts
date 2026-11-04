/**
 * Durable compaction vocabulary that appears inside the session log.
 *
 * The compaction engine — configuration, selection, and summarizer contracts —
 * lives in `packages/compaction/*`; this module owns only the payloads carried
 * by `compaction/checkpoint` and `compaction/prune` events.
 *
 * @module @openai-harness/session
 */

import type { ContentBlock } from "@openai-harness/llm";
import type { SessionSeq } from "./types";

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
