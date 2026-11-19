/**
 * Row and domain types inferred from the drizzle schema.
 *
 * Keep this module free of table definitions so server-only persistence code
 * and type-only consumers can share the shapes without pulling the schema
 * constructors into client bundles.
 *
 * Session event domain types are deliberately NOT inferred here: the event
 * union is owned by `src/lib/core/session/events.ts`, and `session_events` is
 * only its storage row (`SessionEventRow`).
 *
 * @module @/lib/db/types
 */

import {
  users,
  sessions,
  sessionEvents,
  connectors,
  cronJobs,
  barDocs,
  attachmentReceipts,
} from "./schema/schema";
import { scrapedAds } from "./schema/scraper";
import { CONNECTOR_SLUGS, SESSION_SLUGS } from "@/lib/constants";

// --- Users -----------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/** Compatibility aliases retained by the auth/storage layer. */
export type UserRecord = User;
export type NewUserRecord = NewUser;

// --- Sessions --------------------------------------------------------------

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

/** Compatibility aliases retained by the legacy repositories. */
export type SessionRecord = Session;
export type NewSessionRecord = NewSession;

/** Canonical session slugs seeded for each user. */
export type SessionSlug = (typeof SESSION_SLUGS)[number];

/** Free-form session metadata bag persisted as `extra_json`. */
export interface SessionExtra {
  [key: string]: unknown;
}

/** Seed configuration for a user's default per-slug sessions. */
export interface DefaultSessionConfig {
  slug: SessionSlug | string;
  title: string;
  hidden?: boolean;
  /** Legacy spelling still used by some seed call sites. */
  isHidden?: boolean;
  extra?: SessionExtra | null;
}

// --- Session event ledger (storage rows only) ------------------------------

export type SessionEventRow = typeof sessionEvents.$inferSelect;
export type NewSessionEventRow = typeof sessionEvents.$inferInsert;

// --- Detail bars ------------------------------------------------------------

export type BarDocRow = typeof barDocs.$inferSelect;
export type NewBarDocRow = typeof barDocs.$inferInsert;

// --- Session messages (rendered chat surface) ------------------------------

export type SessionMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  kind?: "text" | "block" | "attachment";
  content: string | Record<string, unknown>;
  seq?: number;
  hidden?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type SessionMessageRole = SessionMessage["role"];
export type SessionMessageKind = SessionMessage["kind"];
export type SessionMessageType = SessionMessageKind;

/** Opaque content of one message part; validated by the services layer. */
export type SessionMessagePart = Record<string, unknown>;

export interface TextPart {
  type: "text";
  content: string;
}

export interface UIBlockPart {
  type: "ui-block";
  id: string;
  spec: Record<string, unknown>;
}

export type MessagePart = TextPart | UIBlockPart;

// --- Connectors ------------------------------------------------------------

export type Connector = typeof connectors.$inferSelect;
export type NewConnector = typeof connectors.$inferInsert;
export type ConnectorStatus = NonNullable<Connector["status"]>;
export type ConnectorSlug = (typeof CONNECTOR_SLUGS)[number];

/**
 * Legacy alias used by the Meta connector service. This app has no separate
 * OAuth-connection table: provider credentials live on `connectors`.
 */
export type OAuthConnectionRecord = Connector;
export type NewOAuthConnectionRecord = NewConnector;

// --- Cron jobs -------------------------------------------------------------

export type CronJob = typeof cronJobs.$inferSelect;
export type NewCronJob = typeof cronJobs.$inferInsert;
export type CronJobStatus = NonNullable<CronJob["status"]>;

// --- Attachment receipts ---------------------------------------------------

export type AttachmentReceiptRow = typeof attachmentReceipts.$inferSelect;
export type NewAttachmentReceiptRow = typeof attachmentReceipts.$inferInsert;

// --- Scraper database ------------------------------------------------------

export type ScrapedAdRecord = typeof scrapedAds.$inferSelect;
export type NewScrapedAdRecord = typeof scrapedAds.$inferInsert;
