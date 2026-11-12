/** Connector slugs carried by the browser Connector Manager. */
export const CONNECTOR_SLUGS = ["metaAds", "shopify", "businessProfile"] as const;

/** Union of the connector slugs the manager can open. */
export type ConnectorSlug = (typeof CONNECTOR_SLUGS)[number];
