/**
 * Business Profile provider descriptor. Composition registers this with
 * `ctx.connectors.registerProvider(businessProfileConnectorProvider)`.
 *
 * The provider has no remote API of its own; the application stores its
 * profile document in connector metadata.
 *
 * @module @openai-harness/connector-business-profile/src/provider
 */

import type { ConnectorProvider } from "@openai-harness/connector";

/** Stored slug is `businessProfile`, provider slug is `business_profile`. */
export const businessProfileConnectorProvider: ConnectorProvider = {
  slug: "businessProfile",
  providerSlug: "business_profile",
  label: "Business Profile",
  aliases: ["adsEasy", "businessProfile"],
};
