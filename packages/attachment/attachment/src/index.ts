/**
 * Durable attachment identities, references, admission rules, and their
 * validation errors.
 *
 * Storage drivers, delivery URLs, and filesystem materialization stay in the
 * application; this package owns only the provider-neutral vocabulary that
 * crosses the session-log and model-request boundaries.
 *
 * @module @openai-harness/attachment
 */

export * from "./brand";
export * from "./types";
export * from "./errors";
export * from "./admission";
export * from "./contract";
export { default } from "./contract";
