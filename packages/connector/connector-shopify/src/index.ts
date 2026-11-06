/**
 * Shopify connector: Admin API calls, OAuth helpers, constants, and the
 * provider descriptor.
 *
 * Moved from `apps/gateway/src/lib/connectors/shopify` and
 * `apps/gateway/src/lib/auth/shopify.ts`. Token persistence stays in
 * `syncShopifyConnector` through `@openai-harness/connector`'s upsert.
 *
 * @module @openai-harness/connector-shopify
 */

export * from "./constants";
export * from "./types";
export * from "./utils";
export * from "./oauth";
export * from "./connector";
export * from "./provider";
