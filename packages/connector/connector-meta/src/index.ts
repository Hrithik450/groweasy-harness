/**
 * Meta Ads connector: Graph API calls, OAuth helpers, constants, and the
 * provider descriptor.
 *
 * Moved from `apps/gateway/src/lib/connectors/meta` and
 * `apps/gateway/src/lib/auth/meta.ts`. Tokens are read through
 * `@openai-harness/connector`'s stored connector view and written by
 * `syncMetaConnector` through the same connector service.
 *
 * @module @openai-harness/connector-meta
 */

export * from "./types";
export * from "./constants";
export * from "./oauth";
export * from "./connector";
export * from "./provider";
