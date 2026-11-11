/**
 * Client-side cache of committed session projections.
 *
 * The browser keeps one entry per `(sessionId, projection key)`: the server
 * snapshot returned by `session.projection`, advanced locally by folding the
 * committed events the shared follow stream delivers. The right-hand detail
 * bar reads this cache — never a mutable session field — so a tool or cron
 * write that appends `detailBar/update` appears as soon as the event reaches
 * the journal.
 *
 * Snapshot seeding is deduplicated per cache key: two consumers mounting in
 * the same commit trigger one `session.projection` call.
 *
 * @module @openai-harness/client-ui-session/store/projection.store
 */

import { create } from "zustand";
import type { SessionEvent } from "@openai-harness/session";
import {
  emptyDetailBarState,
  sessionProjectionRegistry,
} from "@openai-harness/session-projection";
import type { SessionProjectionMap } from "@openai-harness/session-projection";

/** One projection snapshot as carried on the wire. */
export interface ProjectionSnapshotValue {
  readonly key: string;
  readonly asOfSeq: number;
  readonly stateVersion: number;
  readonly state: unknown;
}

/** Cached snapshot plus its seed/advance bookkeeping. */
export interface ProjectionCacheEntry extends ProjectionSnapshotValue {
  /** False while the first `session.projection` call is in flight. */
  readonly hasSnapshot: boolean;
  readonly loading: boolean;
  readonly error?: unknown;
}

interface ProjectionStoreState {
  entries: Record<string, ProjectionCacheEntry>;
  setEntry: (cacheKey: string, entry: ProjectionCacheEntry) => void;
}

/** Process-wide projection cache shared by every client package. */
export const useProjectionStore = create<ProjectionStoreState>((set) => ({
  entries: {},
  setEntry: (cacheKey, entry) =>
    set((state) => ({
      entries: { ...state.entries, [cacheKey]: entry },
    })),
}));

/** Stable cache key for one session projection. */
export function projectionCacheKey(sessionId: string, key: string): string {
  return `${sessionId}::${key}`;
}

/** Resolve one projection definition without erasing its runtime key. */
function definitionFor(key: string) {
  return sessionProjectionRegistry.getDefinition(
    key as keyof SessionProjectionMap,
  );
}

/** The empty state a projection starts from when no snapshot is available. */
function emptyStateFor(key: string): unknown {
  return key === "detailBar"
    ? emptyDetailBarState()
    : definitionFor(key)?.init({} as never);
}

/**
 * Store a server snapshot (from `session.projection` or `detailBar.update`)
 * and return the cached entry.
 *
 * The payload is normalized rather than trusted: a missing field falls back to
 * the projection definition's version and the empty state, so a partial wire
 * response cannot erase a rendered bar.
 */
export function applyProjectionSnapshot(
  sessionId: string,
  key: string,
  snapshot: unknown,
): ProjectionCacheEntry {
  const cacheKey = projectionCacheKey(sessionId, key);
  const raw = (snapshot ?? {}) as Partial<ProjectionSnapshotValue>;
  const definition = definitionFor(key);
  const entry: ProjectionCacheEntry = {
    key: typeof raw.key === "string" ? raw.key : key,
    asOfSeq: typeof raw.asOfSeq === "number" ? raw.asOfSeq : -1,
    stateVersion:
      typeof raw.stateVersion === "number"
        ? raw.stateVersion
        : (definition?.stateVersion ?? 1),
    state: raw.state ?? emptyStateFor(key),
    hasSnapshot: true,
    loading: false,
  };
  useProjectionStore.getState().setEntry(cacheKey, entry);
  return entry;
}

/**
 * Fold committed events newer than the cached snapshot through the registered
 * projection definition.
 *
 * `asOfSeq` advances over every newer event (the log cut the state reflects),
 * while the state reference changes only when the definition returns a new
 * value. Returns the input snapshot unchanged when no newer event exists.
 */
export function advanceProjectionSnapshot(
  base: ProjectionSnapshotValue,
  events: readonly SessionEvent[],
  key: string,
): ProjectionSnapshotValue {
  const definition = definitionFor(key);
  if (definition === undefined) return base;

  let state = base.state;
  let asOfSeq = base.asOfSeq;
  let advanced = false;

  for (const event of events) {
    if (event.seq <= base.asOfSeq) continue;
    state = definition.apply(state, event);
    asOfSeq = event.seq;
    advanced = true;
  }

  return advanced ? { ...base, state, asOfSeq } : base;
}

/** In-flight seed calls keyed by cache key, so mounts share one request. */
const inflightSeeds = new Map<string, Promise<void>>();

/**
 * Seed a cache entry from `session.projection` unless it already has a
 * snapshot. Concurrent callers share the in-flight request.
 *
 * A failed seed installs the empty projection state and folds whatever the
 * journal already delivered, so the follow stream still drives the UI when the
 * projection endpoint is unavailable.
 *
 * @param sessionId - session the projection belongs to.
 * @param key - projection key (`detailBar`).
 * @param fetcher - performs the `session.projection` call.
 */
export function ensureSessionProjectionSeed(
  sessionId: string,
  key: string,
  fetcher: () => Promise<unknown>,
): Promise<void> {
  const cacheKey = projectionCacheKey(sessionId, key);
  const existing = useProjectionStore.getState().entries[cacheKey];
  // A stored snapshot is final; a failed seed (the `error` fallback) is
  // retried on the next mount so a recovered endpoint replaces the empty base.
  if (existing?.hasSnapshot && existing.error === undefined) {
    return Promise.resolve();
  }

  const running = inflightSeeds.get(cacheKey);
  if (running !== undefined) return running;

  const definition = definitionFor(key);
  useProjectionStore.getState().setEntry(cacheKey, {
    key,
    asOfSeq: existing?.asOfSeq ?? -1,
    stateVersion: existing?.stateVersion ?? definition?.stateVersion ?? 1,
    state: existing?.state ?? emptyStateFor(key),
    // Keep folding the journal over an existing fallback while retrying.
    hasSnapshot: existing?.hasSnapshot ?? false,
    loading: true,
  });

  const seed = (async () => {
    try {
      applyProjectionSnapshot(sessionId, key, await fetcher());
    } catch (error) {
      useProjectionStore.getState().setEntry(cacheKey, {
        key,
        asOfSeq: -1,
        stateVersion: definition?.stateVersion ?? 1,
        state: emptyStateFor(key),
        hasSnapshot: true,
        loading: false,
        error,
      });
    } finally {
      inflightSeeds.delete(cacheKey);
    }
  })();

  inflightSeeds.set(cacheKey, seed);
  return seed;
}

/** Clear the cache and in-flight seed calls. Primarily for tests. */
export function resetProjectionCache(): void {
  inflightSeeds.clear();
  useProjectionStore.setState({ entries: {} });
}
