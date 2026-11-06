/**
 * Shopify provider descriptor. Composition registers this with
 * `ctx.connectors.registerProvider(shopifyConnectorProvider)`.
 *
 * @module @openai-harness/connector-shopify/src/provider
 */

import type { ConnectorProvider } from "@openai-harness/connector";

import { SHOPIFY_REQUIRED_SCOPES } from "./constants";

/** One stored slug and provider slug, matching the old repository. */
export const shopifyConnectorProvider: ConnectorProvider = {
  slug: "shopify",
  providerSlug: "shopify",
  label: "Shopify",
  requiredScopes: SHOPIFY_REQUIRED_SCOPES,
};
