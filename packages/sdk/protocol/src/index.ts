/**
 * Shared wire protocol for the harness gateway and its browser client.
 *
 * This package mirrors the role of `@deepseek-ai/dsh-sdk-protocol` plus the
 * Remote protocol pieces that the reference keeps in
 * `@deepseek-ai/dsh-typert-protocol`:
 *
 * - `contracts.ts` — session method names, params, results, and the
 *   `SessionFollowFrame` union.
 * - `stream-protocol.ts` — Remote stream frames and their strict parsers.
 * - `remote-error.ts` — the structural Remote failure vocabulary.
 *
 * @module @openai-harness/sdk-protocol
 */

export * from "./calls";
export * from "./contracts";
export * from "./stream-protocol";
export * from "./remote-error";
