/**
 * Basic replay-aware compaction backend: threshold policy, deterministic
 * tool-result pruning, projection-aware range selection, and model-driver
 * summarization.
 *
 * @module @openai-harness/compaction-basic
 */

export * from "./types";
export * from "./config";
export * from "./derive";
export * from "./region";
export * from "./summarizer";
export * from "./tool-result-pruner";
export * from "./strategy";
export * from "./service";

export { default } from "./service";
