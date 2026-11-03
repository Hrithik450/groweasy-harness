/**
 * Structural session types owned by the domain package.
 *
 * The application's Drizzle-inferred `Session` / `NewSession` rows stay in
 * `@/lib/db`. These interfaces are the storage-independent shape the
 * repository reads and writes; the host row types are structurally compatible
 * with them.
 *
 * @module @openai-harness/session-persistence
 */

/** One stored session row as the repository reads it back. */
export interface SessionRecord {
  id: string;
  userId: string;
  title: string;
  slug: string | null;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Values admitted when creating a session. */
export interface NewSessionRecord {
  id?: string;
  userId: string;
  title: string;
  slug?: string | null;
  hidden?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** One default session to seed for a user. */
export interface DefaultSessionConfig {
  slug: string;
  title: string;
  hidden?: boolean;
}

/** Generic standard response returned by the session domain service. */
export type Response<TData = unknown> = {
  success?: boolean;
  data?: TData;
  error?: string;
};
