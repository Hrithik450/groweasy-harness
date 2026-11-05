/**
 * Durable scheduled-prompt jobs, independently of job execution.
 *
 * The domain layout follows the reference
 * `packages/schedule/schedule/src/storage.ts`: one authoritative table on the
 * `schedule` domain, validated at the durable boundary by zod, opened through
 * `ctx.storageDomain`. The record is this application's cron-job row rather
 * than the reference reminder union: every column the application reads is
 * kept, and the reference-only fields (`kind`, `title`, selectors,
 * delivery history) are not introduced because no caller reads them.
 *
 * Identity: the reference keys tasks by a globally unique schedule id and
 * carries the Session as a field. This application's jobs are owned by a user
 * and several jobs may share a session (the HTTP route creates arbitrary jobs;
 * default seeding is unique per `(userId, type)`), so the domain key is
 * `"<userId>/<id>"`: the user stays in the identity while the job id keeps
 * multiple jobs per session representable.
 *
 * @module @openai-harness/schedule
 */

import { z } from "zod";
import { defineDomain, domainTable } from "@openai-harness/storage-domain";

/** One durable scheduled-prompt job as stored in the domain table. */
export const scheduleJobSchema = z
  .object({
    /** Primary key minted by the host's id minter. */
    id: z.string().min(1),
    /** Owning user; repeated from the key so a record is self-describing. */
    userId: z.string(),
    /** Session that receives the prompt when the job is due. */
    sessionId: z.string().min(1),
    /** Host workflow discriminator; `null` selects the host default. */
    type: z.string().nullable(),
    /** Human-readable job name. */
    name: z.string().min(1),
    /** Prompt delivered into the session. */
    prompt: z.string().min(1),
    /** Five-field cron expression. */
    schedule: z.string().min(1),
    /** Last successful execution instant, ISO-8601 UTC. */
    lastRunAt: z.string().nullable(),
    /** Next due instant, ISO-8601 UTC. */
    nextRunAt: z.string().nullable(),
    /** Lifecycle state; `running` excludes the job from due selection. */
    status: z
      .enum(["idle", "running", "failed", "completed"])
      .nullable(),
    /** Creation instant, ISO-8601 UTC. */
    createdAt: z.string().min(1),
  })
  .strict();

/** One stored job record; inferred from {@link scheduleJobSchema}. */
export type ScheduleJob = z.infer<typeof scheduleJobSchema>;

/**
 * Authoritative schedule storage. Malformed jobs reject opening the domain:
 * jobs are authoritative and are never reconstructed from session history.
 */
export const scheduleDomain = defineDomain({
  name: "schedule",
  version: 1,
  tables: {
    jobs: domainTable<string, ScheduleJob>(scheduleJobSchema),
  },
});

/**
 * Build the domain key for one job. The user prefix keeps identity per user;
 * the job id keeps multiple jobs per session representable.
 * @param userId - owning user.
 * @param id - job id minted by the host.
 * @returns the domain table key.
 */
export function scheduleJobKey(userId: string, id: string): string {
  return `${userId}/${id}`;
}

/**
 * Decode one untrusted durable job.
 * @param value - value read from the domain.
 * @returns the validated record.
 */
export function decodeScheduleJob(value: unknown): ScheduleJob {
  return scheduleJobSchema.parse(value);
}
