/**
 * Framework-free Generative UI domain.
 *
 * Owns the wire contract for `ui/block` events (`types`), the curated block
 * catalog (`catalog`), structure validation/normalization (`validator`), the
 * model-facing submission text (`submission`), and pure prompt/field helpers
 * (`utils`).
 *
 * React rendering and the component registry stay in the application; nothing
 * here imports React, Next, or application aliases.
 *
 * @module @openai-harness/generative-ui
 */

export * from "./catalog";
export * from "./validator";
export * from "./utils";
export * from "./submission";
export * from "./types";
