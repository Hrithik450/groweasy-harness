import { z } from "zod";

export interface ShopifyShopDetails {
  id?: string;
  name: string;
  myshopifyDomain: string;
  currencyCode?: string;
  email?: string | null;
  contactEmail?: string | null;
  domain?: string | null;
  planName?: string | null;
  countryCode?: string | null;
  primaryDomainUrl?: string | null;
}

export const ShopifyConnectorSchema = z.object({
  shop: z.string().min(1, "Shop domain is required"),
  name: z.string().default("Shopify Store"),
  currencyCode: z.string().default("USD"),
  email: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  domain: z.string().nullable().optional(),
  planName: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  primaryDomainUrl: z.string().nullable().optional(),
  connectedAt: z.string().default(() => new Date().toISOString()),
});

export type ShopifyConnectorMetadata = z.infer<typeof ShopifyConnectorSchema>;

/**
 * Validates metadata for the Shopify connector.
 */
export function validateShopifyConnector(
  data: unknown,
): ShopifyConnectorMetadata {
  return ShopifyConnectorSchema.parse(data);
}

/**
 * Safely parses the metadata field of a Connector record into ShopifyConnectorMetadata.
 */
export function parseShopifyConnector(
  connector?: { metadata?: unknown } | null,
): ShopifyConnectorMetadata | null {
  if (!connector?.metadata) return null;
  try {
    return validateShopifyConnector(connector.metadata);
  } catch {
    return null;
  }
}


export interface ShopifyVariantOption {
  name: string;
  value: string;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku?: string | null;
  price: string;
  compareAtPrice?: string | null;
  availableForSale: boolean;
  inventoryQuantity?: number | null;
  selectedOptions?: ShopifyVariantOption[];
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description?: string;
  vendor?: string;
  productType?: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT" | string;
  featuredImageUrl?: string | null;
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
    maxVariantPrice?: {
      amount: string;
      currencyCode: string;
    };
  };
  totalInventory?: number | null;
  tags: string[];
  variantsCount: number;
  variants: ShopifyVariant[];
  onlineStoreUrl?: string | null;
  updatedAt?: string;
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
  description?: string | null;
  imageUrl?: string | null;
}

export interface FetchShopifyProductsParams {
  limit?: number;
  cursor?: string;
  query?: string;
  collectionId?: string;
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED" | "ALL";
}

export interface FetchShopifyProductsResult {
  products: ShopifyProduct[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string | null;
  };
}

export interface FetchShopifyCollectionsParams {
  limit?: number;
}

export interface ExecuteShopifyGraphQueryParams {
  query: string;
  variables?: Record<string, unknown>;
}
