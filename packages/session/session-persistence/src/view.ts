/**
 * Wire-safe client view of a Session.
 *
 * The storage row that a session is persisted as stays server-only; client
 * components receive a `SessionView` instead — a plain, JSON-serializable
 * shape with no schema or repository dependencies. The `SessionView` type is
 * owned by `@openai-harness/session`; this module owns the server-side mapping
 * between the stored row and that wire shape.
 *
 * @module @openai-harness/session-persistence
 */

import type { SessionView } from "@openai-harness/session";
import type { SessionRecord } from "./types";

/**
 * Maps a stored session row to the client-safe wire shape.
 *
 * Keep this mapping at the server boundary; client modules should only ever
 * import `SessionView` and this mapper's output — never the storage row type.
 */
export function toSessionView(row: SessionRecord): SessionView {
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
