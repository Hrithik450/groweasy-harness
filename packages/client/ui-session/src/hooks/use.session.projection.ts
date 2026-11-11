"use client";

/**
 * Committed session projection binding.
 *
 * `useSessionProjection` seeds one projection from `session.projection` on
 * session change, then advances it by folding the committed events delivered
 * by the shared session journal (`useSessionJournal`). The accepted value is
 * the server snapshot plus every `detailBar/update` the follow stream has
 * delivered since — never a mutable `session.extra` bag and never a refetch
 * per event.
 *
 * `useDetailBar` is the thin, typed-to-`detailBar` entry the right-hand bar
 * consumes.
 *
 * @module @openai-harness/client-ui-session/hooks/use.session.projection
 */

import { useEffect, useMemo } from "react";
import type { DetailBarState } from "@openai-harness/session-projection";
import {
  getClientSessionDependencies,
  resolveRpcClient,
  type SessionJournalBindingLike,
} from "../config";
import {
  advanceProjectionSnapshot,
  ensureSessionProjectionSeed,
  projectionCacheKey,
  useProjectionStore,
} from "../store/projection.store";

/** One folded projection value plus its log cut and seed progress. */
export interface SessionProjectionResult extends DetailBarState {
  /** Committed seq the returned state reflects. */
  asOfSeq: number;
  /** Version of the projection definition that produced the state. */
  stateVersion: number;
  /** True until the first snapshot (or its empty fallback) is installed. */
  loading: boolean;
}

/** The bare state rendered before any snapshot or event arrives. */
const EMPTY_PROJECTION: DetailBarState = { type: "default", data: {} };

/** Resolve the bound journal hook and open the shared journal. */
function useConfiguredSessionJournal(
  sessionId: string,
): SessionJournalBindingLike {
  const hook = getClientSessionDependencies().useSessionJournal;
  if (hook === undefined) {
    throw new Error(
      "@openai-harness/client-ui-session: configureClientSession({ useSessionJournal }) must be called before useSessionProjection.",
    );
  }
  return hook(sessionId);
}

/**
 * Read one committed projection for a session.
 *
 * The server snapshot is cached per `(sessionId, key)` in the projection
 * store, so re-renders never refetch. Every journal revision folds the events
 * with `seq > asOfSeq` through the registered definition.
 *
 * @param sessionId - session whose log drives the projection.
 * @param key - projection key, `detailBar` by default.
 * @returns the current state plus its log cut, version, and loading flag.
 */
export function useSessionProjection(
  sessionId: string,
  key = "detailBar",
): SessionProjectionResult {
  const { snapshot: journal } = useConfiguredSessionJournal(sessionId);
  const cacheKey = projectionCacheKey(sessionId, key);
  const entry = useProjectionStore((state) => state.entries[cacheKey]);

  // Seed once per session+key. The store deduplicates concurrent consumers.
  useEffect(() => {
    void ensureSessionProjectionSeed(sessionId, key, () =>
      resolveRpcClient().call("session.projection", { sessionId, key }),
    );
  }, [sessionId, key]);

  const advanced = useMemo(() => {
    if (entry === undefined || !entry.hasSnapshot) return undefined;
    // The window mutates in place; revision is the change signal.
    return advanceProjectionSnapshot(entry, journal.window.events, key);
  }, [entry, journal.window.revision, key]);

  if (advanced === undefined) {
    return {
      ...EMPTY_PROJECTION,
      asOfSeq: entry?.asOfSeq ?? -1,
      stateVersion: entry?.stateVersion ?? 1,
      loading: entry?.loading ?? true,
    };
  }

  const state = advanced.state as Partial<DetailBarState> | undefined;
  return {
    type: typeof state?.type === "string" ? state.type : "default",
    data:
      state?.data !== null &&
      typeof state?.data === "object" &&
      !Array.isArray(state.data)
        ? state.data
        : {},
    asOfSeq: advanced.asOfSeq,
    stateVersion: advanced.stateVersion,
    loading: false,
  };
}

/**
 * Read the right-hand detail bar's projection.
 * @param sessionId - session whose log drives the bar.
 * @returns the folded `detailBar` state.
 */
export function useDetailBar(sessionId: string): SessionProjectionResult {
  return useSessionProjection(sessionId, "detailBar");
}
