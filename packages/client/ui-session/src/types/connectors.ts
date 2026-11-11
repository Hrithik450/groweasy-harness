/**
 * Connector catalog shared by the client stores.
 *
 * This is the browser-side, wire-safe face of the connector domain: the slug
 * vocabulary plus the catalog the connector store starts from. It mirrors the
 * application's `@/lib/connectors` registry structurally so stores and hooks
 * can be consumed by the app's components without importing application
 * aliases.
 *
 * @module @openai-harness/client-ui-session/types/connectors
 */

/** Slugs the client can address in the connector store. */
export const CONNECTOR_SLUGS = [
  "metaAds",
  "shopify",
  "businessProfile",
] as const;

/** One connector slug. */
export type ConnectorSlug = (typeof CONNECTOR_SLUGS)[number];

/** Connection lifecycle of one connector. */
export type ConnectorStatus = "connected" | "disconnected" | "expired";

/** Background synchronization lifecycle of one connector. */
export type ConnectorSyncStatus = "idle" | "running";

/**
 * Client view of one connector record plus its catalog presentation fields.
 *
 * Field-for-field the application `Connector` type: the Drizzle insert row
 * without `userId`, with the slug narrowed to {@link ConnectorSlug} and the
 * catalog's display metadata added.
 */
export interface Connector {
  id?: string;
  slug: ConnectorSlug;
  providerSlug: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  permissions?: string[] | null;
  status?: ConnectorStatus;
  syncStatus?: ConnectorSyncStatus;
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  name: string;
  icon: string;
  description: string;
  isAvailable: boolean;
}

/** Catalog the connector store starts from. */
export const AVAILABLE_CONNECTORS: Connector[] = [
  {
    slug: "businessProfile",
    providerSlug: "adsEasy",
    name: "Business Profile",
    description:
      "Deeply analyze your brand website to extract brand voice, target geography, and competitive landscape.",
    icon: "/images/connectors/business-profile.svg",
    isAvailable: true,
    status: "disconnected",
    syncStatus: "idle",
  },
  {
    slug: "metaAds",
    providerSlug: "meta",
    name: "Meta Ads Manager",
    description:
      "Launch, manage, and optimize advertising campaigns across Instagram & Facebook.",
    icon: "/images/connectors/meta.svg",
    isAvailable: true,
    status: "disconnected",
    syncStatus: "idle",
  },
  {
    slug: "shopify",
    providerSlug: "shopify",
    name: "Shopify",
    description:
      "Connect your Shopify store to sync products, inventory, and order analytics with your AI Marketing Team.",
    icon: "/images/connectors/shopify.svg",
    isAvailable: true,
    status: "disconnected",
    syncStatus: "idle",
  },
];
