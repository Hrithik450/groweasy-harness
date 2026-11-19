import {
  text,
  index,
  integer,
  sqliteTable,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { uuidv7 } from "@/lib/utils/uuid";

// 1. Users Table
export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    googleId: text("google_id").unique(),
    email: text("email").unique(),
    name: text("name"),
    picture: text("picture"),
    emailVerified: integer("email_verified", { mode: "boolean" }).default(
      false,
    ),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_users_google_id").on(table.googleId),
    index("idx_users_email").on(table.email),
  ],
);

// 2. Sessions Table
// `hidden` is the single visibility flag: the persistence repository, the
// client-facing `SessionView`, and the session listing all read it.
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    extra: text("extra", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_sessions_user_id").on(table.userId),
    uniqueIndex("idx_sessions_user_slug").on(table.userId, table.slug),
    index("idx_sessions_user_updated").on(table.userId, table.updatedAt),
    index("idx_sessions_user_hidden").on(table.userId, table.hidden),
  ],
);

export const sessionEvents = sqliteTable(
  "session_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    time: integer("time").notNull(),
    data: text("data", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    /** How this event mutates the rendered surface, when relevant. */
    surfaceOp: text("surface_op", { enum: ["append", "replace"] }),
    /** Prior event positions this event derives from. */
    sourceEventSeqs: text("source_event_seqs", { mode: "json" }).$type<
      number[] | null
    >(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("uq_session_events_session_seq").on(table.sessionId, table.seq),
    index("idx_session_events_session_id").on(table.sessionId),
    index("idx_session_events_session_type").on(
      table.sessionId,
      table.type,
      table.seq,
    ),
  ],
);

export const barItems = sqliteTable(
  "bar_items",
  {
    /** Business id, stable and client-facing (uuidv7 or a Meta id). */
    id: text("id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Tab path: campaigns, campaigns.ads, campaigns.ads.creatives. */
    kind: text("kind").notNull(),
    parentId: text("parent_id"),
    depth: integer("depth").notNull().default(0),
    /** User-owned state: pending, accepted, ignored, completed, error. */
    status: text("status"),
    /** Why the status changed: dismissal note or failure reason. */
    error: text("error"),
    data: text("data", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.id] }),
    uniqueIndex("uq_bar_items_session_kind_id").on(
      table.sessionId,
      table.kind,
      table.id,
    ),
    index("idx_bar_items_page").on(
      table.sessionId,
      table.kind,
      table.parentId,
      table.updatedAt,
      table.id,
    ),
    index("idx_bar_items_status").on(
      table.sessionId,
      table.kind,
      table.status,
    ),
  ],
);

export const connectors = sqliteTable(
  "connectors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    providerSlug: text("provider_slug").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    permissions: text("permissions_json", { mode: "json" }).$type<
      string[] | null
    >(),
    status: text("status", {
      enum: ["running", "connected", "disconnected", "expired", "error"],
    })
      .default("disconnected")
      .notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    expiresAt: text("expires_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("idx_connectors_user_slug").on(table.userId, table.slug),
    index("idx_connectors_user_status").on(table.userId, table.status),
    index("idx_connectors_user_provider").on(table.userId, table.providerSlug),
  ],
);

/** When a cron job fires: one instant, or a recurring wall-clock rule. */
export type ScheduleTiming =
  | { kind: "at"; at: string }
  | { kind: "cron"; expression: string };

// 7. Cron Jobs Table (autonomous scheduled tasks)
export const cronJobs = sqliteTable(
  "cron_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    timing: text("timing", { mode: "json" }).$type<ScheduleTiming>().notNull(),
    /** Connector slug gating the job; null means always eligible. */
    requires: text("requires"),
    lastRunAt: text("last_run_at"),
    /** When the prompt actually entered the target session. */
    lastDeliveryAt: text("last_delivery_at"),
    lastError: text("last_error"),
    nextRunAt: text("next_run_at"),
    /** Activity flag only; a run's outcome lives in lastRunAt/lastError. */
    status: text("status", { enum: ["active", "inactive"] })
      .default("inactive")
      .notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_cron_jobs_user_id").on(table.userId),
    index("idx_cron_jobs_session_id").on(table.sessionId),
    index("idx_cron_jobs_user_requires").on(table.userId, table.requires),
    index("idx_cron_jobs_due").on(table.nextRunAt),
    index("idx_cron_jobs_status_due").on(table.status, table.nextRunAt),
  ],
);

// Upload receipts awaiting a prompt; unbound rows older than a day are swept.
export const attachmentReceipts = sqliteTable(
  "attachment_receipts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id"),
    requestId: text("request_id"),
    boundAt: text("bound_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_attachment_receipts_unbound").on(table.boundAt, table.createdAt),
  ],
);

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  connectors: many(connectors),
  cronJobs: many(cronJobs),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  events: many(sessionEvents),
  barItems: many(barItems),
  cronJobs: many(cronJobs),
}));

export const sessionEventsRelations = relations(sessionEvents, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionEvents.sessionId],
    references: [sessions.id],
  }),
}));

export const barItemsRelations = relations(barItems, ({ one }) => ({
  session: one(sessions, {
    fields: [barItems.sessionId],
    references: [sessions.id],
  }),
}));

export const connectorsRelations = relations(connectors, ({ one }) => ({
  user: one(users, {
    fields: [connectors.userId],
    references: [users.id],
  }),
}));

export const cronJobsRelations = relations(cronJobs, ({ one }) => ({
  user: one(users, {
    fields: [cronJobs.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [cronJobs.sessionId],
    references: [sessions.id],
  }),
}));
