import type {
  ConnectorSlug,
  ConnectorStatus,
  ProviderSlug,
} from "@/lib/db";

export type { ConnectorSlug, ConnectorStatus, ProviderSlug };

export interface Connector {
  id?: string;
  slug: ConnectorSlug;
  providerSlug: ProviderSlug;
  /** Instance identity within (userId, slug): brand domain, account id. */
  instance?: string;
  /** The default instance for this connector type. */
  isPrimary?: boolean;
  name: string;
  icon: string;
  description: string;
  isAvailable: boolean;

  status?: ConnectorStatus;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Project a stored row onto the browser view, dropping every credential.
 *
 * The single place a connector becomes client-visible: routes serialize the
 * result of this, so a new secret column cannot leak by being spread.
 */
export function toBrowserConnector(row: Record<string, unknown>): Connector {
  const {
    userId: _userId,
    accessToken: _accessToken,
    refreshToken: _refreshToken,
    permissions: _permissions,
    expiresAt: _expiresAt,
    ...rest
  } = row;
  return rest as unknown as Connector;
}

/** Built-in connector catalogue shown before the API refresh lands. */
export const AVAILABLE_CONNECTORS: Connector[] = [
  {
    slug: "businessProfile",
    providerSlug: "adsEasy",
    name: "Brand Brain",
    description:
      "Deeply analyze your brand website to extract brand voice, target geography, and competitive landscape.",
    icon: "/images/connectors/business-profile.svg",
    isAvailable: true,
    status: "disconnected",
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
  },
];
