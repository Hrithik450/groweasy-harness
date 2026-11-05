/**
 * Compaction vocabulary: the result type, the minimal session capability the
 * engine mutates, and re-exported durable event payloads.
 *
 * The durable log keeps two correlated pieces: a `compaction/checkpoint`
 * marker (summary plus the shadowed range) and the `user/message` that carries
 * that summary on the model-visible surface. Model-free `compaction/prune`
 * replacements stay a separate optional pass.
 *
 * @module @openai-harness/compaction/types
 */

import type { ModelUsage } from "@openai-harness/llm";
import type {
  SessionEvent,
  SessionEventMap,
  SessionEventType,
  SessionSeq,
} from "@openai-harness/session";

import type { CompactionId } from "./brand";

export type {
  CompactionCheckpointEventData,
  CompactionPruneEventData,
  CompactionTrigger,
} from "@openai-harness/session";

import type { CompactionTrigger } from "@openai-harness/session";

/**
 * The host session surface compaction needs, stated structurally so the
 * engine imports no application `Session` class, persistence repository, or
 * database singleton. The application's `Session` satisfies it unchanged.
 */
export interface CompactionSession {
  /** Owning tenant, used to resolve image attachments during summarization. */
  readonly userId?: string;
  /** Durable append-only event log in seq order. */
  readonly events: readonly SessionEvent[];
  /**
   * Append one durable event and return its committed position.
   * @param type - event discriminator.
   * @param data - payload for that discriminator.
   * @param opts - optional surface metadata.
   */
  append<K extends SessionEventType>(
    type: K,
    data: SessionEventMap[K],
    opts?: {
      surfaceOp?: "append" | "replace";
      sourceEventSeqs?: SessionSeq[];
    },
  ): SessionEvent<K>;
}

/** Result of one successful compaction. */
export interface CompactionResult {
  /** Stable identity shared by the checkpoint marker and its surface message. */
  readonly compactionId: CompactionId;
  /** Seq of the `compaction/checkpoint` marker. */
  readonly checkpointSeq: SessionSeq;
  /** Seq of the checkpoint `user/message` on the surface. */
  readonly messageSeq: SessionSeq;
  /** Summary text produced by the backend. */
  readonly summary: string;
  /** Inclusive span shadowed by the checkpoint. */
  readonly shadowedRange: { readonly startSeq: SessionSeq; readonly endSeq: SessionSeq };
  /** Every shadowed log position, in surface order. */
  readonly shadowedSeqs: readonly SessionSeq[];
  /** Estimated token count of the shadowed content. */
  readonly shadowedTokenCount: number;
  /** Why compression ran. */
  readonly trigger: CompactionTrigger;
  /** Tool-result replacements landed before summarization. */
  readonly prunedResults: number;
  /** Provider-reported usage for the summarization request, when emitted. */
  readonly summaryUsage?: ModelUsage;
}
