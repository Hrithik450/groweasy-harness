import {
  getDb,
  connectors,
  type Connector,
  type ConnectorSlug,
  type NewConnector,
  type ProviderSlug,
} from "@/lib/db";
import { uuidv7 } from "@/lib/utils/uuid";
import { sanitizeUserId } from "@/lib/utils/utils";
import { eq, and, ne, or, sql, desc } from "drizzle-orm";
import { PROVIDER_CONNECTOR_SLUGS } from "@/lib/constants";

/** Normalize a brand URL into its instance key: lowercase host without `www.`. */
export function normalizeInstanceKey(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Identity of a connector instance. Business profiles are keyed by their
 * brand domain; every other connector keeps the single "default" instance.
 */
function deriveInstance(slug: string, metadata: unknown): string | undefined {
  if (slug !== "businessProfile") return undefined;
  const url = (metadata as { url?: unknown } | null | undefined)?.url;
  if (typeof url !== "string" || !url.trim()) return undefined;
  return normalizeInstanceKey(url) ?? undefined;
}

/**
 * Upserts one connector instance for a user.
 *
 * Matches on (userId, slug, instance). The instance comes from the caller,
 * else the profile URL, else the existing primary row. A brand-new instance
 * becomes primary only when the user has no primary for that slug yet.
 */
export function upsertConnector(data: NewConnector): Connector {
  const effectiveUserId = sanitizeUserId(data.userId);
  if (!effectiveUserId) {
    throw new Error("Authentication required: userId must be provided.");
  }

  const db = getDb();
  const now = new Date().toISOString();

  return db.transaction((tx) => {
    const primary =
      tx
        .select()
        .from(connectors)
        .where(
          and(
            eq(connectors.userId, effectiveUserId),
            eq(connectors.slug, data.slug),
            eq(connectors.isPrimary, true),
          ),
        )
        .get() ?? null;

    const instance =
      data.instance?.trim() ||
      deriveInstance(data.slug, data.metadata) ||
      primary?.instance ||
      "default";

    const existing =
      tx
        .select()
        .from(connectors)
        .where(
          and(
            eq(connectors.userId, effectiveUserId),
            eq(connectors.slug, data.slug),
            eq(connectors.instance, instance),
          ),
        )
        .get() ?? null;

    const id = data.id || existing?.id || uuidv7();
    // One lifecycle flag: explicit wins, then a token implies connected, then
    // whatever the row already had.
    const status =
      data.status ||
      (data.accessToken ? "connected" : existing?.status || "disconnected");
    const accessToken =
      data.accessToken !== undefined
        ? data.accessToken
        : existing?.accessToken || null;
    const refreshToken =
      data.refreshToken !== undefined
        ? data.refreshToken
        : existing?.refreshToken || null;
    const permissions =
      data.permissions !== undefined
        ? data.permissions
        : existing?.permissions || null;
    const expiresAt =
      data.expiresAt !== undefined
        ? data.expiresAt
        : existing?.expiresAt || null;

    const resolvedMetadata =
      data.metadata === null
        ? null
        : data.metadata !== undefined
          ? (data.metadata as Record<string, unknown>)
          : existing?.metadata || null;

    const isPrimary =
      data.isPrimary !== undefined
        ? data.isPrimary
        : (existing?.isPrimary ?? false) || primary === null;

    if (isPrimary) {
      tx.update(connectors)
        .set({ isPrimary: false, updatedAt: now })
        .where(
          and(
            eq(connectors.userId, effectiveUserId),
            eq(connectors.slug, data.slug),
            ne(connectors.instance, instance),
            eq(connectors.isPrimary, true),
          ),
        )
        .run();
    }

    return tx
      .insert(connectors)
      .values({
        ...data,
        id: id,
        userId: effectiveUserId,
        slug: data.slug,
        instance,
        isPrimary,
        providerSlug: data.providerSlug,
        accessToken: accessToken,
        refreshToken: refreshToken,
        permissions: permissions,
        expiresAt: expiresAt,
        status: status,
        metadata: resolvedMetadata,
        createdAt: existing?.createdAt || data.createdAt || now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [connectors.userId, connectors.slug, connectors.instance],
        set: {
          providerSlug: data.providerSlug,
          isPrimary,
          accessToken,
          refreshToken: refreshToken || sql`connectors.refresh_token`,
          permissions: permissions || sql`connectors.permissions_json`,
          expiresAt: expiresAt || sql`connectors.expires_at`,
          status,
          metadata: resolvedMetadata,
          updatedAt: now,
        },
      })
      .returning()
      .get();
  });
}

/** Makes one instance the primary for its (userId, slug). */
export function setPrimaryConnector(
  userId: string,
  slug: string,
  instance: string,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  return db.transaction((tx) => {
    const target =
      tx
        .select()
        .from(connectors)
        .where(
          and(
            eq(connectors.userId, userId),
            eq(connectors.slug, slug),
            eq(connectors.instance, instance),
          ),
        )
        .get() ?? null;
    if (!target) return false;

    tx.update(connectors)
      .set({ isPrimary: false, updatedAt: now })
      .where(
        and(
          eq(connectors.userId, userId),
          eq(connectors.slug, slug),
          ne(connectors.instance, instance),
          eq(connectors.isPrimary, true),
        ),
      )
      .run();

    tx.update(connectors)
      .set({ isPrimary: true, updatedAt: now })
      .where(
        and(
          eq(connectors.userId, userId),
          eq(connectors.slug, slug),
          eq(connectors.instance, instance),
        ),
      )
      .run();

    return true;
  });
}

/** Returns all connector instances for a specific user. */
export function getConnectorsByUserId(userId: string): Connector[] {
  const db = getDb();
  return db
    .select()
    .from(connectors)
    .where(eq(connectors.userId, userId))
    .orderBy(
      sql`${connectors.slug} ASC`,
      desc(connectors.isPrimary),
      desc(connectors.updatedAt),
    )
    .all();
}

/** Returns every instance of one connector type for a user. */
export function getConnectorsByUserIdAndSlug(
  userId: string,
  slug: ConnectorSlug,
): Connector[] {
  const db = getDb();
  return db
    .select()
    .from(connectors)
    .where(and(eq(connectors.userId, userId), eq(connectors.slug, slug)))
    .orderBy(desc(connectors.isPrimary), desc(connectors.updatedAt))
    .all();
}

/**
 * Retrieves one connector instance by slug. Without an instance key it
 * returns the primary row, falling back to the most recently updated one.
 */
export function getConnectorByUserIdAndSlug(
  userId: string,
  slug: ConnectorSlug,
  instance?: string,
): Connector | null {
  const db = getDb();
  return (
    db
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.userId, userId),
          eq(connectors.slug, slug),
          instance
            ? eq(connectors.instance, instance)
            : eq(connectors.isPrimary, true),
        ),
      )
      .get() ?? null
  );
}

/**
 * Retrieves a connector instance by providerSlug (e.g. "meta", "adsEasy").
 * Without an instance key it returns the primary row.
 */
export function getConnectorByUserIdAndProviderSlug(
  userId: string,
  providerSlug: ProviderSlug,
  instance?: string,
): Connector | null {
  const db = getDb();
  return (
    db
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.userId, userId),
          or(
            eq(connectors.providerSlug, providerSlug),
            eq(connectors.slug, PROVIDER_CONNECTOR_SLUGS[providerSlug]),
          ),
          instance
            ? eq(connectors.instance, instance)
            : eq(connectors.isPrimary, true),
        ),
      )
      .get() ?? null
  );
}

/**
 * Disconnects one instance: status flips and credentials clear, while the
 * stored profile/metadata is kept. Without an instance key the primary row is
 * targeted so sibling instances stay connected.
 */
export function disconnectConnectorBySlug(
  userId: string,
  slug: string,
  instance?: string,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .update(connectors)
    .set({
      status: "disconnected",
      accessToken: null,
      refreshToken: null,
      permissions: null,
      expiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(connectors.slug, slug),
        eq(connectors.userId, userId),
        instance
          ? eq(connectors.instance, instance)
          : eq(connectors.isPrimary, true),
      ),
    )
    .run();

  return result.changes > 0;
}

/**
 * Deletes a connection. Pass an instance key to delete only that instance;
 * without one, every instance of the slug/provider is removed.
 */
export function deleteConnector(
  userId: string,
  slugOrProviderSlug: string,
  instance?: string,
): boolean {
  const db = getDb();
  const result = db
    .delete(connectors)
    .where(
      and(
        eq(connectors.userId, userId),
        or(
          eq(connectors.slug, slugOrProviderSlug),
          eq(connectors.providerSlug, slugOrProviderSlug),
          slugOrProviderSlug === "meta" || slugOrProviderSlug === "metaAds"
            ? or(
                eq(connectors.providerSlug, "metaAds"),
                eq(connectors.slug, "metaAds"),
              )
            : slugOrProviderSlug === "adsEasy" ||
                slugOrProviderSlug === "businessProfile"
              ? or(
                  eq(connectors.providerSlug, "businessProfile"),
                  eq(connectors.slug, "businessProfile"),
                )
              : undefined,
        ),
        instance ? eq(connectors.instance, instance) : undefined,
      ),
    )
    .run();

  return result.changes > 0;
}
