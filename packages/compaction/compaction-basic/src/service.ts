/**
 * Cordis service form of the basic compaction strategy.
 *
 * The loader instantiates this class as the `ctx.compaction` implementation.
 * Host-only bindings (environment lookup and model-visible derivation) are
 * installed through {@link configureCompactionHost} before the plugin loads,
 * so the service constructor stays loader-compatible: `(ctx, config)`.
 *
 * @module @openai-harness/compaction-basic/service
 */

import { type Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { CompactionEngine } from "@openai-harness/compaction";
import type {
  CompactionResult,
  CompactionSession,
} from "@openai-harness/compaction";
import type { ModelDriver } from "@openai-harness/llm";
import type { SessionSeq } from "@openai-harness/session";

import { BasicCompactionStrategy } from "./strategy";
import type {
  BasicCompactionConfig,
  ResolvedCompactionConfig,
} from "./types";

const ratioSchema = z.number();
const retainTokensSchema = z.number().step(1).min(0);
const positiveIntegerSchema = z.number().step(1).min(1);
const booleanSchema = z.boolean();

const prunerSchema = z.object({
  thresholdChars: positiveIntegerSchema,
  headChars: retainTokensSchema,
  tailChars: retainTokensSchema,
  keepRecentResults: retainTokensSchema,
});

/**
 * Threshold-driven compaction backend mounted as `ctx.compaction`.
 *
 * The strategy itself is host-agnostic; this class only adapts its loader
 * configuration and service identity.
 */
export class BasicCompactionEngine extends CompactionEngine {
  static inject: string[] = [];

  static Config: z<BasicCompactionConfig> = z.object({
    thresholdRatio: ratioSchema,
    retainRatio: ratioSchema,
    retainTokens: retainTokensSchema,
    contextWindow: positiveIntegerSchema,
    auto: booleanSchema,
    toolResultPruner: prunerSchema,
  });

  /** Resolved and validated compaction configuration. */
  readonly config: ResolvedCompactionConfig;

  private readonly strategy: BasicCompactionStrategy;

  /**
   * @param ctx - owning Cordis context; the service registers as `compaction`.
   * @param config - loader-normalized backend configuration.
   */
  constructor(ctx: Context, config: BasicCompactionConfig = {}) {
    super(ctx);
    this.strategy = new BasicCompactionStrategy(config);
    this.config = this.strategy.config;
  }

  override compactIfNeeded(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null> {
    return this.strategy.compactIfNeeded(session, driver, signal);
  }

  override compactRegion(
    startSeq: SessionSeq,
    endSeq: SessionSeq,
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult> {
    return this.strategy.compactRegion(
      startSeq,
      endSeq,
      session,
      driver,
      signal,
    );
  }

  override compactNow(
    session: CompactionSession,
    driver: ModelDriver,
    signal?: AbortSignal,
  ): Promise<CompactionResult | null> {
    return this.strategy.compactNow(session, driver, signal);
  }
}

export default BasicCompactionEngine;
