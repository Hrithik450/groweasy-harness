import type { ConnectorSlug } from "./constants";

/** Persisted connection state of one connector. */
export type ConnectorStatus = "connected" | "disconnected" | "expired";

/** Persisted sync state of one connector. */
export type ConnectorSyncStatus = "idle" | "running";

/**
 * Browser view of one connector row.
 *
 * This is the UI package's own copy of the row shape (the database type stays
 * in the app); fields match the serialized connector API payload.
 */
export interface Connector {
  id?: string;
  slug: ConnectorSlug;
  providerSlug: string;
  name: string;
  icon: string;
  description: string;
  isAvailable: boolean;
  accessToken?: string | null;
  refreshToken?: string | null;
  permissions?: string[] | null;
  status?: ConnectorStatus;
  syncStatus?: ConnectorSyncStatus;
  /** ISO-8601 start of the current sync run, when the server records one. */
  syncStartedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Built-in connector catalogue shown before the API refresh lands. */
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
