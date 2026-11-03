/**
 * Derived projection cache.
 *
 * This mirrors the reference `session_projcache` domain: a rebuildable cache
 * whose loss is always safe. Each row is keyed by `"<sessionId>/<key>"` and
 * stores the projection's `stateVersion`, the log cut it reflects (`asOfSeq`),
 * and its opaque JSON `state`.
 *
 * The storage-domain key charset is limited to `[A-Za-z0-9_-]`, so the logical
 * `"<sessionId>/<key>"` key is base64url-encoded for the medium. The encoding
 * is reversible; the repository exposes only the logical pair.
 *
 * `per-record` layout plus `invalidRecords: 'backup-and-skip'` means one
 * corrupt cached row is moved aside instead of taking every session's cache
 * down with it. Deleting the whole domain unit is also safe: projections are
 * recomputed from the JSONL log.
 *
 * @module @openai-harness/session-persistence
 */

import { z } from "zod";
import {
  defineDomain,
  domainTable,
} from "@openai-harness/storage-domain";
import type { SessionId, SessionSeqCursor } from "@openai-harness/session";

/** True when a value is losslessly representable as JSON. */
function isJsonValue(value: unknown): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object": {
      if (Array.isArray(value)) return value.every(isJsonValue);
      return Object.values(value as Record<string, unknown>).every(
        (entry) => entry !== undefined && isJsonValue(entry),
      );
    }
    default:
      return false;
  }
}

/** One cached projection row. */
export const projectionCacheRowSchema = z.object({
  /** The owning projection definition's state version. */
  stateVersion: z.number().int().nonnegative(),
  /** Inclusive event watermark the state reflects; `-1` before any event. */
  asOfSeq: z.number().int().gte(-1),
  /** Opaque JSON value owned by the projection definition. */
  state: z.custom<unknown>(isJsonValue, {
    message: "projection state must be losslessly JSON-serializable",
  }),
});

/** Stored cache row type. */
export type ProjectionCacheRow = z.infer<typeof projectionCacheRowSchema>;

/**
 * The derived projection cache domain. Not authoritative: drop and rebuild.
 */
export const projectionCacheDomainSpec = defineDomain({
  name: "session_projection_cache",
  version: 1,
  layout: "per-record",
  invalidRecords: "backup-and-skip",
  tables: {
    checkpoints: domainTable<string, ProjectionCacheRow>(
      projectionCacheRowSchema,
    ),
  },
});

/**
 * Encode the logical `"<sessionId>/<key>"` slot as a medium-safe key.
 * @param sessionId - owning session id.
 * @param key - projection key.
 * @returns a base64url key matching `[A-Za-z0-9_-]+`.
 */
export function projectionCacheKey(
  sessionId: SessionId | string,
  key: string,
): string {
  return Buffer.from(`${String(sessionId)}/${key}`, "utf8").toString(
    "base64url",
  );
}

/**
 * Decode one medium key back to its logical pair.
 * @param encoded - base64url key from the domain table.
 * @returns the pair, or `undefined` when the key is not canonical.
 */
export function decodeProjectionCacheKey(
  encoded: string,
): { sessionId: string; key: string } | undefined {
  let raw: string;
  try {
    raw = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
  const separator = raw.indexOf("/");
  if (separator <= 0 || separator === raw.length - 1) return undefined;
  const decoded = {
    sessionId: raw.slice(0, separator),
    key: raw.slice(separator + 1),
  };
  // Buffer's base64 decoder is lenient; require a canonical round-trip so a
  // foreign document can never masquerade as a checkpoint key.
  return projectionCacheKey(decoded.sessionId, decoded.key) === encoded
    ? decoded
    : undefined;
}

/** One checkpoint as the repository returns it. */
export interface ProjectionCheckpointRow<T = unknown> {
  sessionId: string;
  key: string;
  stateVersion: number;
  asOfSeq: number;
  state: T;
}

/**
 * The subset of a storage-domain table this repository needs. Declared
 * structurally so this package does not depend on the Cordis domain facility
 * and the app can supply its opened domain.
 */
export interface ProjectionCacheTable {
  get(key: string): ProjectionCacheRow | undefined;
  put(key: string, value: ProjectionCacheRow): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(): IterableIterator<string>;
}

/** Lazily resolves the opened `checkpoints` table. */
export type ProjectionCacheTableLoader = () => Promise<ProjectionCacheTable>;

/** Loader bound by {@link configureProjectionCacheLoader}, if any. */
let defaultLoader: ProjectionCacheTableLoader | undefined;

/**
 * Bind the host's opened projection-cache table as the default loader.
 * @param loader - resolves the `checkpoints` table of the derived cache domain.
 */
export function configureProjectionCacheLoader(
  loader: ProjectionCacheTableLoader,
): void {
  defaultLoader = loader;
}

/**
 * The bound loader.
 * @throws when the host has not bound storage yet.
 */
export function requireProjectionCacheLoader(): ProjectionCacheTableLoader {
  if (defaultLoader === undefined) {
    throw new Error(
      "session projection cache storage is not configured; call configureProjectionCacheLoader during composition",
    );
  }
  return defaultLoader;
}

/** Clear the bound loader. Intended for isolated tests. */
export function resetProjectionCacheLoader(): void {
  defaultLoader = undefined;
}

/**
 * Projection checkpoint repository over the derived cache domain.
 *
 * Construction never opens storage; the first read/write awaits the supplied
 * loader, so importing the app's session barrel does not do file I/O.
 */
export class SessionProjectionsRepository {
  private tablePromise: Promise<ProjectionCacheTable> | undefined;

  /**
   * @param loadTable - resolves the opened `session_projection_cache`
   *   `checkpoints` table.
   */
  constructor(private readonly loadTable: ProjectionCacheTableLoader) {}

  private table(): Promise<ProjectionCacheTable> {
    this.tablePromise ??= this.loadTable();
    return this.tablePromise;
  }

  /**
   * Read one cached checkpoint.
   * @param sessionId - owning session.
   * @param key - projection key.
   * @returns the checkpoint, or `null` when absent.
   */
  async getCheckpoint<T = unknown>(
    sessionId: SessionId | string,
    key: string,
  ): Promise<ProjectionCheckpointRow<T> | null> {
    const table = await this.table();
    const row = table.get(projectionCacheKey(sessionId, key));
    if (row === undefined) return null;
    return {
      sessionId: String(sessionId),
      key,
      stateVersion: row.stateVersion,
      asOfSeq: row.asOfSeq,
      state: row.state as T,
    };
  }

  /**
   * Persist or overwrite one checkpoint.
   * @param sessionId - owning session.
   * @param key - projection key.
   * @param snapshot - state version, watermark, and state.
   */
  async saveCheckpoint(
    sessionId: SessionId | string,
    key: string,
    snapshot: {
      stateVersion: number;
      asOfSeq: SessionSeqCursor | number;
      state: unknown;
    },
  ): Promise<void> {
    const row = projectionCacheRowSchema.parse({
      stateVersion: snapshot.stateVersion,
      asOfSeq: Number(snapshot.asOfSeq),
      state: snapshot.state,
    });
    const table = await this.table();
    await table.put(projectionCacheKey(sessionId, key), row);
  }

  /**
   * Drop every cached checkpoint for one session.
   * @param sessionId - owning session.
   */
  async clearCheckpoints(sessionId: SessionId | string): Promise<void> {
    const table = await this.table();
    const target = String(sessionId);
    for (const encoded of [...table.keys()]) {
      if (decodeProjectionCacheKey(encoded)?.sessionId === target) {
        await table.delete(encoded);
      }
    }
  }
}

/**
 * Process-wide projection checkpoint repository.
 *
 * The loader is resolved on first read, so importing this instance before the
 * host binds storage is safe; the first call must follow
 * {@link configureProjectionCacheLoader}.
 */
export const sessionProjectionsRepo = new SessionProjectionsRepository(() =>
  requireProjectionCacheLoader()(),
);
