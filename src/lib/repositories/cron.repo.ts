import {
  getDb,
  cronJobs,
  sessions,
  type CronJob,
  type NewCronJob,
} from "@/lib/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { sanitizeUserId } from "@/lib/utils/utils";
import { type DefaultCronJobConfig } from "./defaults";
import { nextOccurrenceForTiming } from "@/lib/cron/schedule";
import { uuidv7 } from "@/lib/utils/uuid";

/**
 * Creates a new cron job record in the database.
 */
export function createCronJob(data: NewCronJob): CronJob {
  const effectiveUserId = sanitizeUserId(data.userId);

  const db = getDb();
  const now = new Date().toISOString();

  return db
    .insert(cronJobs)
    .values({
      ...data,
      userId: effectiveUserId,
      status: data.status ?? "inactive",
      createdAt: data.createdAt ?? now,
    })
    .returning()
    .get();
}

/**
 * Ensures the default job registry exists for a user.
 *
 * Seeded jobs are parked: inactive with no next run. A connector activation is
 * what admits them to the schedule, so a job may exist before its capability.
 * Re-seeding refreshes the prompt/timing/requires without resetting activity,
 * and parks retired default names so they cannot survive in an existing user.
 */
export function ensureDefaultCronJobsByUserId(
  userId: string,
  jobsList?: readonly DefaultCronJobConfig[],
): void {
  const safeUserId = sanitizeUserId(userId);
  if (!safeUserId || !jobsList || jobsList.length === 0) return;

  const db = getDb();
  const now = new Date().toISOString();

  db.transaction((tx) => {
    const userSessions = tx
      .select()
      .from(sessions)
      .where(eq(sessions.userId, safeUserId))
      .all();

    if (!userSessions || userSessions.length === 0) {
      return;
    }

    for (const job of jobsList) {
      const session = userSessions.find((s) => s.slug === job.sessionSlug);
      if (!session) continue;

      const existingJob = tx
        .select({ id: cronJobs.id })
        .from(cronJobs)
        .where(
          and(
            eq(cronJobs.userId, safeUserId),
            eq(cronJobs.sessionId, session.id),
            eq(cronJobs.name, job.name),
          ),
        )
        .limit(1)
        .get();

      if (existingJob) {
        tx.update(cronJobs)
          .set({
            timing: job.timing,
            requires: job.requires,
            prompt: job.prompt,
            name: job.name,
          })
          .where(eq(cronJobs.id, existingJob.id))
          .run();
        continue;
      }

      tx.insert(cronJobs)
        .values({
          id: uuidv7(),
          userId: safeUserId,
          sessionId: session.id,
          name: job.name,
          prompt: job.prompt,
          timing: job.timing,
          requires: job.requires,
          status: "inactive",
          nextRunAt: null,
          createdAt: now,
        })
        .run();
    }
  });
}

/**
 * Admits every job gated on a connector to the schedule.
 *
 * `immediate` runs the jobs right away after a connect; `false` leaves each
 * job due at its next configured cron occurrence instead.
 */
export function activateCronJobsByRequires(
  userId: string,
  requires: string,
  immediate = true,
): number {
  const safeUserId = sanitizeUserId(userId);
  if (!safeUserId) return 0;

  const db = getDb();
  const now = new Date();
  const due = db
    .select()
    .from(cronJobs)
    .where(
      and(eq(cronJobs.userId, safeUserId), eq(cronJobs.requires, requires)),
    )
    .all();

  let changes = 0;
  let offsetMinutes = 0;
  for (const job of due) {
    const nextRunAt = immediate
      ? new Date(now.getTime() + offsetMinutes * 60_000)
      : nextOccurrenceForTiming(job.timing, now);
    if (immediate) offsetMinutes += 1;

    changes += db
      .update(cronJobs)
      .set({
        status: "active",
        nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
        lastError: null,
      })
      .where(eq(cronJobs.id, job.id))
      .run().changes;
  }
  return changes;
}

/**
 * Parks every job gated on a connector; its capability is gone.
 * Called by the connector service on disconnect, expiry, or error.
 */
export function deactivateCronJobsByRequires(
  userId: string,
  requires: string,
): number {
  const safeUserId = sanitizeUserId(userId);
  if (!safeUserId) return 0;

  return getDb()
    .update(cronJobs)
    .set({ status: "inactive", nextRunAt: null })
    .where(
      and(eq(cronJobs.userId, safeUserId), eq(cronJobs.requires, requires)),
    )
    .run().changes;
}

/**
 * Updates an existing cron job record.
 */
export function updateCronJob(
  id: string,
  updates: Partial<CronJob>,
): CronJob | undefined {
  const db = getDb();

  return db
    .update(cronJobs)
    .set(updates)
    .where(eq(cronJobs.id, id))
    .returning()
    .get();
}

/**
 * Retrieves a cron job by its primary key ID.
 */
export function getCronJobById(id: string): CronJob | undefined {
  const db = getDb();
  return db.select().from(cronJobs).where(eq(cronJobs.id, id)).get();
}

/**
 * Retrieves all cron jobs belonging to a specific user.
 */
export function getCronJobsByUserId(userId: string): CronJob[] {
  const safeUserId = sanitizeUserId(userId);
  if (!safeUserId) return [];

  const db = getDb();
  return db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.userId, safeUserId))
    .orderBy(sql`datetime(${cronJobs.createdAt}) DESC`)
    .all();
}

/**
 * Retrieves all cron jobs associated with a specific session.
 */
export function getCronJobsBySessionId(sessionId: string): CronJob[] {
  if (!sessionId) return [];

  const db = getDb();
  return db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.sessionId, sessionId))
    .orderBy(sql`datetime(${cronJobs.createdAt}) DESC`)
    .all();
}

/**
 * Finds all active jobs whose next run is due.
 * The worker stays dumb: activity is the connector service's decision.
 */
export function findDueCronJobs(beforeIso?: string): CronJob[] {
  const cutoff = beforeIso || new Date().toISOString();
  const db = getDb();

  return db
    .select()
    .from(cronJobs)
    .where(and(eq(cronJobs.status, "active"), lte(cronJobs.nextRunAt, cutoff)))
    .orderBy(sql`datetime(${cronJobs.nextRunAt}) ASC`)
    .all();
}

/**
 * Deletes a cron job by ID.
 */
export function deleteCronJob(id: string): boolean {
  const db = getDb();
  const result = db.delete(cronJobs).where(eq(cronJobs.id, id)).run();
  return result.changes > 0;
}
