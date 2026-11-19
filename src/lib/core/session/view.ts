/**
 * Wire-safe client view of a Session.
 *
 * The Drizzle `Session` row type must stay server-only: it is inferred from the
 * database schema and carries server persistence concerns. Client components
 * receive a `SessionView` instead — a plain, JSON-serializable shape with no
 * schema or repository dependencies.
 *
 * @module @/lib/core/session/view
 */

import type { Session } from "@/lib/db";

/**
 * Public, serializable session shape handed to client components.
 *
 * This is the single client-facing session type. `Session` remains the
 * server-only Drizzle row and must be mapped with {@link toSessionView} at the
 * server/client boundary.
 */
export interface SessionView {
  id: string;
  userId: string;
  title: string;
  slug: string | null;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Wire-safe replacement for the Drizzle-inferred `User`. */
export interface UserView {
  id: string;
  googleId: string | null;
  email: string | null;
  name: string | null;
  picture: string | null;
  emailVerified: boolean | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps a server-side Drizzle `Session` row to the client-safe wire shape.
 *
 * Keep this mapping at the server boundary; client modules should only ever
 * import `SessionView` and this mapper's output — never the Drizzle row type.
 */
export function toSessionView(row: Session): SessionView {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    slug: row.slug ?? null,
    hidden: Boolean(row.hidden),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
