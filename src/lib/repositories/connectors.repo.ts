import { getDb, connectors, type Connector, type NewConnector } from "@/lib/db";
import { uuidv7 } from "@/lib/utils/uuid";
import { eq, and, sql, or } from "drizzle-orm";
import { sanitizeUserId } from "@/lib/utils/utils";

/**
 * Upserts a connector connection for a user (inserts or updates on conflict).
 * Matches on unique (userId, slug).
 */
export function upsertConnector(data: NewConnector): Connector {
  const effectiveUserId = sanitizeUserId(data.userId);
  if (!effectiveUserId) {
    throw new Error("Authentication required: userId must be provided.");
  }

  const db = getDb();
  const now = new Date().toISOString();

  return db.transaction((tx) => {
    const existing =
      tx
        .select()
        .from(connectors)
        .where(
          and(
            eq(connectors.userId, effectiveUserId),
            eq(connectors.slug, data.slug),
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

    return tx
      .insert(connectors)
      .values({
        ...data,
        id: id,
        userId: effectiveUserId,
        slug: data.slug,
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
        target: [connectors.userId, connectors.slug],
        set: {
          providerSlug: data.providerSlug,
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

/**
 * Returns all active/configured connectors for a specific user.
 */
export function getConnectorsByUserId(userId: string): Connector[] {
  const db = getDb();
  return db
    .select()
    .from(connectors)
    .where(eq(connectors.userId, userId))
    .orderBy(sql`${connectors.slug} ASC`)
    .all();
}

/**
 * Retrieves a single connector connection for a user by connector slug (e.g. "businessProfile", "metaAds").
 */
export function getConnectorByUserIdAndSlug(
  userId: string,
  slug: string,
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
            eq(connectors.slug, slug),
            slug === "metaAds"
              ? eq(connectors.slug, "meta")
              : slug === "businessProfile"
                ? eq(connectors.slug, "businessProfile")
                : undefined,
          ),
        ),
      )
      .get() ?? null
  );
}

/**
 * Retrieves a single connector connection for a user by providerSlug (e.g. "meta", "adsEasy").
 */
export function getConnectorByUserIdAndProviderSlug(
  userId: string,
  providerSlug: string,
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
            eq(connectors.slug, providerSlug),
            providerSlug === "meta"
              ? or(
                  eq(connectors.providerSlug, "metaAds"),
                  eq(connectors.slug, "metaAds"),
                )
              : providerSlug === "adsEasy"
                ? or(
                    eq(connectors.providerSlug, "businessProfile"),
                    eq(connectors.slug, "businessProfile"),
                  )
                : undefined,
          ),
        ),
      )
      .get() ?? null
  );
}

/**
 * Sets connection status to 'disconnected' and removes access token for security by connector slug.
 */
export function disconnectConnectorBySlug(
  userId: string,
  slug: string,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .update(connectors)
    .set({
      status: "disconnected",
      accessToken: null,
      refreshToken: null,
      metadata: null,
      permissions: null,
      expiresAt: null,
      updatedAt: now,
    })
    .where(and(eq(connectors.userId, userId), eq(connectors.slug, slug)))
    .run();

  return result.changes > 0;
}

/**
 * Deletes a connection completely from the database.
 */
export function deleteConnector(
  userId: string,
  slugOrProviderSlug: string,
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
      ),
    )
    .run();

  return result.changes > 0;
}
