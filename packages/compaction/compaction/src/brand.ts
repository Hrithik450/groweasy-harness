/**
 * Branded compaction transaction identity.
 *
 * @module @openai-harness/compaction/brand
 */

import { brandString, type Branded } from "@openai-harness/brand";

/** Stable identity shared by one checkpoint marker and its replacement message. */
export type CompactionId = Branded<"CompactionId">;

/**
 * Brand an implementation-minted compaction identity.
 * @param id - opaque transaction identity.
 * @returns the same string, branded; no validation is performed.
 */
export function CompactionId(id: string): CompactionId {
  return brandString<CompactionId>(id);
}
