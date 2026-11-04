/**
 * Wire-safe client view of a Session.
 *
 * The storage row that a session is persisted as stays server-only; client
 * components receive a `SessionView` instead — a plain, JSON-serializable
 * shape with no schema or repository dependencies. The server-side mapper
 * that produces a `SessionView` from a row stays in the application.
 *
 * @module @openai-harness/session
 */

import type { SessionMessageRole } from "./events";

/** Message kinds the wire protocol can deliver. */
export type SessionMessageKind = "text" | "block" | "attachment";

/** JSON-safe payload carried by a session message event. */
export type SessionMessageContent = string | Record<string, unknown>;

/**
 * Public, serializable session shape handed to client components.
 *
 * This is the single client-facing session type. The storage row remains
 * server-only and must be mapped at the server/client boundary. Per-bar state
 * is a projection over the committed log (`detailBar`), never a session field.
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

/** Wire-safe replacement for the storage-inferred session message row. */
export interface SessionMessageView {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  kind?: SessionMessageKind;
  content: SessionMessageContent;
  seq: number;
  hidden: boolean;
  createdAt: string;
  updatedAt?: string;
  message?: unknown;
}

/** Wire-safe replacement for the storage-inferred user row. */
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
