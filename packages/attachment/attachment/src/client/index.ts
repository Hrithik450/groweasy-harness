/**
 * Browser-safe half of the attachment vocabulary.
 *
 * The package's default entry also carries the server-side store and its
 * admission rules, which import `node:buffer`. Client code only needs the
 * reference types and their type guards, so this entry re-exports those and
 * nothing that touches a Node builtin.
 *
 * @module @openai-harness/attachment/client
 */

export * from "./../types";
export * from "./../brand";
export * from "./../errors";
