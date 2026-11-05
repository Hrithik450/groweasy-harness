/**
 * Compaction service definition (`ctx.compaction`): providers decide when to
 * compact and replace a history range with one summary checkpoint by
 * implementing {@link CompactionEngine}.
 *
 * This package owns the backend-independent contract only: the abstract
 * service, the compacted-range result, the checkpoint source marker, and the
 * tool-pairing cut arithmetic. Policy, retention, pruning, and summarization
 * live in `@openai-harness/compaction-basic`.
 *
 * @module @openai-harness/compaction
 */

import { Service, type Context } from "@deepseek-ai/cordis";
import type { ModelDriver } from "@openai-harness/llm";
import type { SessionSeq } from "@openai-harness/session";

import type {
  CompactionResult,
  CompactionSession,
} from "./types";

export type {
  CompactionCheckpointEventData,
  CompactionPruneEventData,
  CompactionResult,
  CompactionSession,
  CompactionTrigger,
} from "./types";
export { CompactionId } from "./brand";
export {
  compactCheckpointSource,
  isCompactCheckpointSource,
} from "./checkpoint";
export type { CompactionCheckpointSource } from "./checkpoint";
export {
  toolPairingBalancedAfter,
  toolPairingBalancedBefore,
  toolPairingBalances,
} from "./tool-pairing";
export type { ToolPairingEntry } from "./tool-pairing";

declare module "@deepseek-ai/cordis" {
  interface Context {
    compaction: CompactionEngine;
  }
}

/**
 * Abstract compaction service. Implementations own trigger policy, retention,
 * and summarization, and replace a selected surface span with one checkpoint
 * message. Load one implementation per context as `ctx.compaction`.
 */
export abstract class CompactionEngine extends Service {
  constructor(ctx: Context) {
    super(ctx, "compaction");
  }

  /**
   * Consider automatic compaction for one trigger. Return `null` when no safe
   * range can be compacted or no reduction is needed.
   *
   * @param session - session whose durable log is measured and mutated.
   * @param driver - provider driver used by the summarizer.
   * @param signal - optional cancellation forwarded to summarization.
   * @returns the compaction result, or `null` when nothing was compacted.
   */
  abstract compactIfNeeded(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null>;

  /**
   * Compact one explicit inclusive range of log positions.
   *
   * @param startSeq - inclusive first surface-node seq.
   * @param endSeq - inclusive last surface-node seq.
   * @param session - session whose durable log is mutated.
   * @param driver - provider driver used by the summarizer.
   * @param signal - optional cancellation forwarded to summarization.
   * @returns the successful compaction result.
   */
  abstract compactRegion(
    startSeq: SessionSeq,
    endSeq: SessionSeq,
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult>;

  /**
   * Explicitly compact useful history even below the automatic pressure
   * threshold.
   *
   * @param session - session whose durable history should be compacted.
   * @param driver - provider driver used by the summarizer.
   * @param signal - optional cancellation scoped to this request.
   * @returns the compaction result, or `null` when no safe useful range exists.
   */
  abstract compactNow(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null>;

  /**
   * Compatibility entry point for the application's automatic step guard.
   * @param session - session whose log is measured and mutated.
   * @param driver - provider driver used by the summarizer.
   * @param signal - optional cancellation forwarded to summarization.
   * @returns the compaction result, or `null` when nothing was compacted.
   */
  maybeCompact(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null> {
    return this.compactIfNeeded(session, driver, signal);
  }
}

export default CompactionEngine;
