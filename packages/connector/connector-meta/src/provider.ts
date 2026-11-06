/**
 * Meta Ads provider descriptor. Composition registers this with
 * `ctx.connectors.registerProvider(metaConnectorProvider)`.
 *
 * @module @openai-harness/connector-meta/src/provider
 */

import type { ConnectorProvider } from "@openai-harness/connector";

import { META_REQUIRED_SCOPES } from "./oauth";

/** Stored slug is `metaAds`, provider slug is `meta`, per the old repository. */
export const metaConnectorProvider: ConnectorProvider = {
  slug: "metaAds",
  providerSlug: "meta",
  label: "Meta Ads",
  aliases: ["meta_ads"],
  requiredScopes: META_REQUIRED_SCOPES,
};
