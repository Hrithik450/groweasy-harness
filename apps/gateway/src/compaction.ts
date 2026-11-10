/**
 * Compaction composition.
 *
 * The strategy, projection, pruner, and summarizer live in
 * `@openai-harness/compaction-basic`. This module binds the two host
 * capabilities the package cannot own — the process environment and the
 * model-visible session derivation — and exposes the engine class the agent
 * loop composes.
 *
 * @module @openai-harness/gateway/wiring/compaction
 */

import {
  BasicCompactionStrategy,
  configureCompactionHost,
} from "@openai-harness/compaction-basic";
import type { BasicCompactionDependencies } from "@openai-harness/compaction-basic";
import { toChatMessages } from "@openai-harness/session-projection";

configureCompactionHost({
  env: process.env,
  deriveMessages: (events) => toChatMessages(events),
});

/** Optional seams for tests and alternate summary/purge implementations. */
export type CompactionEngineDependencies = BasicCompactionDependencies;

/** Automatic compaction engine bound to this deployment. */
export class CompactionEngine extends BasicCompactionStrategy {}
