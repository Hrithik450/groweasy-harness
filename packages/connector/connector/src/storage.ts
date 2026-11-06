/**
 * The `connectors` storage domain: connector state, including OAuth tokens.
 *
 * This replaces the application's Drizzle `connectors` table. The reference
 * layout is `packages/schedule/schedule/src/storage.ts`: declare every table
 * with `defineDomain`/`domainTable`, keep the schemas strict, and let the
 * repository read through the opened domain.
 *
 * OAuth tokens live on the connector record itself. There is no separate
 * credential provider or credential-record indirection: the connector's own
 * storage domain is the only place its tokens persist.
 *
 * Keys are `${sanitizeUserId(userId)}/${slug}`. The slug is the stored
 * connector slug (`metaAds`, `businessProfile`, `shopify`), so a user has at
 * most one row per connector slug — matching the old unique index.
 *
 * @module @openai-harness/connector/src/storage
 */

import { z } from "zod";
import { defineDomain, domainTable } from "@openai-harness/storage-domain";

import type {
  ConnectorStatus,
  ConnectorSyncStatus,
} from "./types";

/**
 * Durable connector state, tokens included. `createdAt`/`updatedAt` were
 * written but never read by the application and are intentionally dropped.
 */
export const connectorRecordSchema = z
  .object({
    /** Stable connector id; also becomes the connector's public `id`. */
    id: z.string(),
    /** Stored connector slug, e.g. `metaAds`. */
    slug: z.string(),
    /** Provider identifier, e.g. `meta`. */
    providerSlug: z.string(),
    /** Granted OAuth access token, or `null` when disconnected. */
    accessToken: z.string().nullable(),
    /** Granted OAuth refresh token, or `null` when the provider issued none. */
    refreshToken: z.string().nullable(),
    /** Access-token expiry as epoch milliseconds, or `null` when unknown. */
    expiresAt: z.number().nullable(),
    /** Granted OAuth permissions. */
    permissions: z.array(z.string()).nullable(),
    /** Connection lifecycle state. */
    status: z.enum(["connected", "disconnected", "expired"]),
    /** Background sync state. */
    syncStatus: z.enum(["idle", "running"]),
    /**
     * ISO-8601 time the current sync/analysis run started. Optional so rows
     * written before this field existed (and connectors that never run a
     * background sync) stay valid. Only meaningful while `syncStatus` is
     * `running`; the run's owner clears it when the run settles.
     */
    syncStartedAt: z.string().optional(),
    /** Provider-specific non-secret metadata. */
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();

/** One stored connector record. */
export type ConnectorRecord = z.infer<typeof connectorRecordSchema>;

/**
 * Non-secret connector record shape returned by synchronous lookups. Tokens
 * stay on {@link ConnectorRecord} and are materialized only by the async
 * repository reads.
 */
export type StoredConnector = {
  id: string;
  slug: string;
  providerSlug: string;
  permissions: string[] | null;
  status: ConnectorStatus;
  syncStatus: ConnectorSyncStatus;
  /** ISO-8601 start of the current sync run, when one is recorded. */
  syncStartedAt?: string;
  metadata: Record<string, unknown> | null;
};

/** Domain record key: sanitized user id and connector slug. */
export type ConnectorKey = string;

/**
 * The durable connector domain. Malformed stored state rejects opening the
 * domain: connector metadata is authoritative enough that a schema violation
 * should be repaired explicitly, not silently skipped.
 */
export const connectorDomain = defineDomain({
  name: "connectors",
  version: 1,
  tables: {
    connectors: domainTable<ConnectorKey, ConnectorRecord>(connectorRecordSchema),
  },
});

/** Build one domain key from its two logical components. */
export function connectorKey(userId: string, slug: string): ConnectorKey {
  return `${userId}/${slug}`;
}

/** Split a domain key back into its user and slug halves. */
export function parseConnectorKey(
  key: ConnectorKey,
): { userId: string; slug: string } {
  const separator = key.indexOf("/");
  return {
    userId: key.slice(0, separator),
    slug: key.slice(separator + 1),
  };
}

/**
 * Strip tokens from a stored record for synchronous non-secret consumers.
 * Async repository reads consume the full {@link ConnectorRecord}.
 */
export function decodeConnectorRecord(record: ConnectorRecord): StoredConnector {
  return {
    id: record.id,
    slug: record.slug,
    providerSlug: record.providerSlug,
    permissions: record.permissions,
    status: record.status,
    syncStatus: record.syncStatus,
    syncStartedAt: record.syncStartedAt,
    metadata: record.metadata,
  };
}
