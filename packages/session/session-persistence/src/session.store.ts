/**
 * Host bindings for the session record domain.
 *
 * The record repository consumes a {@link SessionPersistenceBackend}; the
 * remaining host-owned pieces are the id minter and the user-existence guard
 * used by default-session seeding. User accounts still live in the
 * application's SQL schema, so the host supplies that check as a callback
 * rather than this package importing any database code.
 *
 * @module @openai-harness/session-persistence
 */

import type { SessionPersistenceBackend } from "./backend";
import { requireSessionPersistenceBackend } from "./backend";

/** Everything the record repository needs from its host. */
export interface SessionStore {
  /** Explicit backend; defaults to the configured process-wide backend. */
  readonly backend?: SessionPersistenceBackend;
  /** Mints the session id for a new record. */
  readonly mintId?: () => string;
  /**
   * Whether the user account exists. Default seeding is skipped when this
   * returns false; omitted means "assume it exists".
   */
  readonly userExists?: (userId: string) => boolean | Promise<boolean>;
}

/** Store bound by {@link configureSessionStore}, if any. */
let defaultStore: SessionStore | undefined;

/**
 * Bind the host's session-domain options as the default for repositories
 * constructed without an explicit store.
 * @param store - the backend, id minter, and user-existence guard.
 */
export function configureSessionStore(store: SessionStore): void {
  defaultStore = store;
}

/** Resolve the configured store, defaulting to the process-wide backend. */
export function requireSessionStore(): SessionStore {
  return defaultStore ?? {};
}

/** Resolve a store's backend or the process-wide backend. */
export function resolveSessionBackend(
  store: SessionStore,
): SessionPersistenceBackend {
  return store.backend ?? requireSessionPersistenceBackend();
}

/** Clear the bound store. Intended for isolated tests. */
export function resetSessionStore(): void {
  defaultStore = undefined;
}
