/**
 * Model-facing Shopify tools: product and collection reads over the Shopify
 * Graph API connector.
 *
 * The tool definitions moved verbatim from
 * `apps/gateway/src/lib/tools/shopify`; their remaining `@/lib/...` imports are
 * temporary application shims. This package is a Cordis plugin: mount it with
 * the `tools` service present and it registers every family tool on
 * `ctx.tools`.
 *
 * @module @openai-harness/tool-shopify
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the required ctx.tools service declaration.
import type {} from "@openai-harness/tools/src/runtime";
import { fetchShopifyProductsTool } from "./products/tool";
import { fetchShopifyCollectionsTool } from "./collections/tool";

export * from "./products/tool";
export * from "./collections/tool";

/** Cordis plugin name. */
export const name = "tool-shopify";

/** The tools service must exist before the family tools can register. */
export const inject = ["tools"];

/**
 * Register every Shopify tool on `ctx.tools`.
 *
 * @param ctx - context carrying the tool registry service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(fetchShopifyProductsTool);
  ctx.tools.register(fetchShopifyCollectionsTool);
}
