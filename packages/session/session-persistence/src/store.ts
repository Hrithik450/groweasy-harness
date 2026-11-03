/**
 * Host bindings for the session event ledger.
 *
 * The ledger no longer reaches into a SQL client: it consumes a
 * {@link SessionPersistenceBackend}. The only host-owned responsibility left is
 * publishing a committed batch to live subscribers, so this store carries the
 * optional publisher and an optional explicit backend (used by tests) and
 * otherwise falls back to the process-wide backend bound at composition.
 *
 * @module @openai-harness/session-persistence
 */

import type { SessionEvent } from "@openai-harness/session";
import type { SessionPersistenceBackend } from "./backend";
import { requireSessionPersistenceBackend } from "./backend";

/**
 * Announces a committed batch to live subscribers.
 *
 * Runs only after the durable append resolved, so a subscriber that replays
 * from the backend and then attaches sees no uncommitted data.
 */
export type SessionEventsPublisher = (
  sessionId: string,
  events: readonly SessionEvent[],
) => void;

/** Everything the ledger needs from its host. */
export interface SessionEventsStore {
  /** Explicit backend; defaults to the configured process-wide backend. */
  readonly backend?: SessionPersistenceBackend;
  /** Optional post-commit publisher; omitted when the host has no live bus. */
  readonly publish?: SessionEventsPublisher;
}

/** Store bound by {@link configureSessionEventsStore}, if any. */
let defaultStore: SessionEventsStore | undefined;

/**
 * Bind the host's event-ledger options as the default for repositories
 * constructed without an explicit store.
 * @param store - the optional publisher and explicit backend.
 */
export function configureSessionEventsStore(store: SessionEventsStore): void {
  defaultStore = store;
}

/** Resolve the configured store, defaulting to the process-wide backend. */
export function requireDefaultStore(): SessionEventsStore {
  return defaultStore ?? {};
}

/** Resolve a store's backend or the process-wide backend. */
export function resolveSessionEventsBackend(
  store: SessionEventsStore,
): SessionPersistenceBackend {
  return store.backend ?? requireSessionPersistenceBackend();
}

/** Clear the bound store. Intended for isolated tests. */
export function resetSessionEventsStore(): void {
  defaultStore = undefined;
}
