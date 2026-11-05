/**
 * Compaction checkpoint source: the correlated constructor and predicate every
 * backend uses for its replacement user message.
 *
 * This module is a pure type/value/predicate outlet (no Cordis imports, no
 * module augmentation) so client and wire programs can name the checkpoint
 * source without loading the host plugin's `Context` merge.
 *
 * @module @openai-harness/compaction/checkpoint
 */

import type { MessageSource } from "@openai-harness/llm";

import type { CompactionId } from "./brand";

const COMPACT_CHECKPOINT_MARKER = Object.freeze({
  kind: "compact-checkpoint",
} as const);

/** Message source carried by a concrete compaction checkpoint. */
export type CompactionCheckpointSource = typeof COMPACT_CHECKPOINT_MARKER & {
  readonly compactionId: CompactionId;
  readonly sourceCommandId?: string;
};

/**
 * Create a checkpoint source correlated with one compaction transaction.
 * @param compactionId - owning compaction identity.
 * @param sourceCommandId - initiating manual command, when present.
 * @returns immutable checkpoint source.
 */
export function compactCheckpointSource(
  compactionId: CompactionId,
  sourceCommandId?: string,
): CompactionCheckpointSource {
  return Object.freeze({
    ...COMPACT_CHECKPOINT_MARKER,
    compactionId,
    ...(sourceCommandId === undefined ? {} : { sourceCommandId }),
  });
}

/**
 * Test whether a persisted message source identifies a compaction checkpoint.
 * @param source - source restored from a surface user message.
 * @returns whether the source carries the backend-independent checkpoint marker.
 */
export function isCompactCheckpointSource(
  source: MessageSource,
): source is CompactionCheckpointSource {
  return source.kind === "compact-checkpoint";
}
