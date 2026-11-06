/**
 * Durable connector reads and writes over the `connectors` domain.
 *
 * This replaces the application's Drizzle `connectors.repo.ts`. The connector
 * record owns its OAuth tokens directly — there is no separate credential
 * store or credential-record indirection. Semantics are preserved operation
 * by operation:
 *
 * - `upsert` merges with `undefined` meaning "preserve", infers `connected`
 *   from a supplied token, and clears metadata on explicit `null`;
 * - slug/provider lookups keep the legacy aliases (`metaAds` ↔ `meta`,
 *   `businessProfile` ↔ `business_profile`, and the `meta` ↔ `meta_ads` /
 *   `adsEasy` ↔ `business_profile` provider aliases);
 * - disconnect clears tokens and metadata but keeps the row;
 * - delete matches either slug or provider slug, aliases included.
 *
 * Reads of the domain are synchronous (the opened domain serves its
 * authoritative in-memory state); the public read API stays async to match
 * the application's former repository contract.
 *
 * @module @openai-harness/connector/src/repository
 */

import type { Domain, KvTable } from "@openai-harness/storage-domain";

import {
  connectorDomain,
  connectorKey,
  decodeConnectorRecord,
  parseConnectorKey,
} from "./storage";
import type { ConnectorKey, ConnectorRecord, StoredConnector } from "./storage";
import { mintConnectorId, resolveConnectorHost } from "./store";
import type { ConnectorHost } from "./store";
import type {
  Connector,
  ConnectorSyncStatus,
  NewConnector,
} from "./types";
import { ConnectorStoreError } from "./types";

type ConnectorDomain = Domain<typeof connectorDomain>;

/**
 * Legacy slug matching, ported verbatim from the Drizzle query: the queried
 * slug also matches the stored alias the application once wrote.
 */
function slugMatches(record: StoredConnector, slug: string): boolean {
  if (record.slug === slug) return true;
  if (slug === "metaAds") return record.slug === "meta";
  if (slug === "businessProfile") return record.slug === "business_profile";
  return false;
}

/** Provider-slug matching, including the application's Meta/AdsEasy aliases. */
function providerSlugMatches(
  record: StoredConnector,
  providerSlug: string,
): boolean {
  if (record.providerSlug === providerSlug || record.slug === providerSlug) {
    return true;
  }
  if (providerSlug === "meta") {
    return record.providerSlug === "meta_ads" || record.slug === "metaAds";
  }
  if (providerSlug === "adsEasy") {
    return (
      record.providerSlug === "business_profile" ||
      record.slug === "businessProfile"
    );
  }
  return false;
}

/** Delete matching, ported from the Drizzle `deleteConnector` predicate. */
function deleteMatches(record: StoredConnector, value: string): boolean {
  if (record.slug === value || record.providerSlug === value) return true;
  if (value === "meta" || value === "metaAds") {
    return record.providerSlug === "meta_ads" || record.slug === "metaAds";
  }
  if (value === "adsEasy" || value === "businessProfile") {
    return (
      record.providerSlug === "business_profile" ||
      record.slug === "businessProfile"
    );
  }
  return false;
}

/** Read/write access to connector state over one opened domain. */
export class ConnectorRepository {
  private readonly table: KvTable<ConnectorKey, ConnectorRecord>;
  private readonly host: ConnectorHost;

  /**
   * @param domain - opened `connectors` domain, owned by the caller.
   * @param host - optional host overrides; defaults to the bindings from
   * `configureConnectorHost`.
   */
  constructor(domain: ConnectorDomain, host?: ConnectorHost) {
    this.table = domain.table("connectors");
    this.host = { ...resolveConnectorHost(), ...host };
  }

  /** Normalize a user id, rejecting an empty one exactly as the old repo did. */
  private sanitize(userId: string): string {
    const sanitized = this.host.sanitizeUserId?.(userId) ?? "";
    if (!sanitized) {
      throw new ConnectorStoreError(
        "connector_invalid",
        "Connector requires a non-empty userId",
      );
    }
    return sanitized;
  }

  /** Read one user's raw stored records, tokens included. */
  private recordsFor(userId: string): ConnectorRecord[] {
    return this.entriesFor(this.sanitize(userId));
  }

  /** Read one already-sanitized user's raw stored records. */
  private entriesFor(sanitizedUserId: string): ConnectorRecord[] {
    const prefix = `${sanitizedUserId}/`;
    const records: ConnectorRecord[] = [];
    for (const [key, record] of this.table.entries()) {
      if (key.startsWith(prefix)) records.push(record);
    }
    return records;
  }

  /** Raw stored record for one slug, legacy aliases included. */
  private rawRecordBySlug(
    sanitizedUserId: string,
    slug: string,
  ): ConnectorRecord | null {
    const exact = this.table.get(connectorKey(sanitizedUserId, slug));
    if (exact !== undefined) return exact;
    return (
      this.entriesFor(sanitizedUserId).find((record) =>
        slugMatches(decodeConnectorRecord(record), slug),
      ) ?? null
    );
  }

  /**
   * Synchronous slug lookup used by callers that only need non-secret state
   * (the workflow host reads `metadata.url`).
   */
  findRecordBySlug(userId: string, slug: string): StoredConnector | null {
    const record = this.rawRecordBySlug(this.sanitize(userId), slug);
    return record === null ? null : decodeConnectorRecord(record);
  }

  /** Synchronous provider-slug lookup, alias-aware. */
  findRecordByProviderSlug(
    userId: string,
    providerSlug: string,
  ): StoredConnector | null {
    const record = this.recordsFor(userId).find((candidate) =>
      providerSlugMatches(decodeConnectorRecord(candidate), providerSlug),
    );
    return record === undefined ? null : decodeConnectorRecord(record);
  }

  /** Synchronous listing for callers that need only non-secret state. */
  listRecords(userId: string): StoredConnector[] {
    return this.recordsFor(userId)
      .map(decodeConnectorRecord)
      .sort((left, right) => left.slug.localeCompare(right.slug));
  }

  /** Project one stored record into the service-facing view. */
  private toConnector(record: ConnectorRecord, userId: string): Connector {
    return {
      id: record.id,
      userId,
      slug: record.slug,
      providerSlug: record.providerSlug,
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      permissions: record.permissions,
      status: record.status,
      syncStatus: record.syncStatus,
      syncStartedAt: record.syncStartedAt,
      metadata: record.metadata,
      expiresAt: record.expiresAt,
    };
  }

  /** Every connector owned by one user, ordered by slug. */
  async listByUserId(userId: string): Promise<Connector[]> {
    const sanitized = this.sanitize(userId);
    return this.entriesFor(sanitized)
      .sort((left, right) => left.slug.localeCompare(right.slug))
      .map((record) => this.toConnector(record, sanitized));
  }

  /** One connector by stored connector slug. */
  async getBySlug(userId: string, slug: string): Promise<Connector | null> {
    const sanitized = this.sanitize(userId);
    const record = this.rawRecordBySlug(sanitized, slug);
    return record === null ? null : this.toConnector(record, sanitized);
  }

  /** One connector by provider slug, alias-aware. */
  async getByProviderSlug(
    userId: string,
    providerSlug: string,
  ): Promise<Connector | null> {
    const sanitized = this.sanitize(userId);
    const record = this.entriesFor(sanitized).find((candidate) =>
      providerSlugMatches(decodeConnectorRecord(candidate), providerSlug),
    );
    return record === undefined ? null : this.toConnector(record, sanitized);
  }

  /**
   * Insert or merge one connector.
   *
   * @param data - fields to write; `undefined` preserves the stored value,
   * `null` clears it. A `null` (or empty) access token clears the whole token
   * image, matching the old disconnect behavior.
   * @returns the committed connector, tokens included.
   */
  async upsert(data: NewConnector): Promise<Connector> {
    const userId = this.sanitize(data.userId);
    const key = connectorKey(userId, data.slug);
    const current = this.table.get(key);

    const id = data.id ?? current?.id ?? this.host.mintId?.() ?? mintConnectorId();
    const status =
      data.status ??
      (data.accessToken ? "connected" : (current?.status ?? "disconnected"));
    const syncStatus: ConnectorSyncStatus =
      data.syncStatus !== undefined
        ? data.syncStatus
        : (current?.syncStatus ?? "idle");
    const permissions =
      data.permissions !== undefined
        ? data.permissions
        : (current?.permissions ?? null);
    // `undefined` preserves, `null` clears (a settled run leaves no marker).
    const syncStartedAt =
      data.syncStartedAt === null
        ? undefined
        : data.syncStartedAt !== undefined
          ? data.syncStartedAt
          : current?.syncStartedAt;
    const metadata =
      data.metadata === null
        ? null
        : data.metadata !== undefined
          ? data.metadata
          : (current?.metadata ?? null);

    // An explicit null/empty access token clears the whole token image,
    // matching the old repository's "delete the grant on disconnect".
    const clearTokens = data.accessToken === null || data.accessToken === "";
    const accessToken = clearTokens
      ? null
      : data.accessToken !== undefined
        ? data.accessToken
        : (current?.accessToken ?? null);
    const refreshToken = clearTokens
      ? null
      : data.refreshToken === null || data.refreshToken === ""
        ? null
        : data.refreshToken !== undefined
          ? data.refreshToken
          : (current?.refreshToken ?? null);
    const expiresAt = clearTokens
      ? null
      : data.expiresAt === null
        ? null
        : data.expiresAt !== undefined
          ? data.expiresAt
          : (current?.expiresAt ?? null);

    const record: ConnectorRecord = {
      id,
      slug: data.slug,
      providerSlug: data.providerSlug,
      accessToken,
      refreshToken,
      expiresAt,
      permissions,
      status,
      syncStatus,
      syncStartedAt,
      metadata,
    };

    await this.table.put(key, record);
    return this.toConnector(record, userId);
  }

  /**
   * Disconnect one connector by exact stored slug: keep the row, mark it
   * disconnected/idle, and clear every token and metadata field.
   *
   * @returns whether a connector existed.
   */
  async disconnectBySlug(userId: string, slug: string): Promise<boolean> {
    const sanitized = this.sanitize(userId);
    const key = connectorKey(sanitized, slug);
    const existing = this.table.get(key);
    if (existing === undefined) return false;

    const record: ConnectorRecord = {
      ...existing,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      permissions: null,
      status: "disconnected",
      syncStatus: "idle",
      syncStartedAt: undefined,
      metadata: null,
    };
    await this.table.put(key, record);
    return true;
  }

  /**
   * Every stored connector across all users, tokens included.
   *
   * Process-level repair sweeps (for example, terminalizing a background run
   * that died with a previous process) need the full set without knowing user
   * ids ahead of time. This is not an HTTP-facing read; callers must not
   * project tokens outward.
   */
  async listAll(): Promise<Connector[]> {
    return [...this.table.entries()].map(([key, record]) => {
      const { userId } = parseConnectorKey(key);
      return this.toConnector(record, userId);
    });
  }

  /**
   * Delete one connector by slug or provider slug, including legacy aliases.
   *
   * @returns whether a connector was removed.
   */
  async deleteBySlugOrProviderSlug(
    userId: string,
    value: string,
  ): Promise<boolean> {
    const sanitized = this.sanitize(userId);
    const match = this.entriesFor(sanitized).find((record) =>
      deleteMatches(decodeConnectorRecord(record), value),
    );
    if (match === undefined) return false;

    await this.table.delete(connectorKey(sanitized, match.slug));
    return true;
  }
}
