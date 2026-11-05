/**
 * Durable repository over the `schedule` domain's `jobs` table.
 *
 * Every method is storage-neutral: the host supplies the opened domain
 * through {@link ScheduleService} (or passes it explicitly), and the id
 * minter, user-id sanitizer, and session-slug lookup through a
 * {@link ScheduleHost}. The repository keeps the application's original query
 * semantics — due ordering by `nextRunAt`, the `running` exclusion, newest
 * first listing, and the `(user_id, type)` uniqueness used when seeding
 * defaults — but the medium is the reference's domain instead of Drizzle.
 *
 * Reads are synchronous from the domain's authoritative in-memory state;
 * writes await durable land-on-medium before returning, exactly as the domain
 * contract states.
 *
 * @module @openai-harness/schedule
 */

import type { Domain, KvTable } from "@openai-harness/storage-domain";

import { computeNextOccurrence } from "./recurrence";
import {
  requireScheduleRepository,
  resolveScheduleHost,
  type ScheduleHost,
} from "./store";
import {
  scheduleDomain,
  scheduleJobKey,
  scheduleJobSchema,
  type ScheduleJob,
} from "./storage";
import type {
  CronJobRecord,
  DefaultCronJob,
  EnsureDefaultCronJobsOptions,
  NewCronJob,
} from "./types";
import { ScheduleError } from "./types";

/** One `[domain key, stored job]` pair. */
interface JobEntry {
  readonly key: string;
  readonly job: ScheduleJob;
}

/**
 * Job storage bound to one opened domain and one host.
 *
 * Construct it with the domain opened through `ctx.storageDomain.open(...)`,
 * or let {@link ScheduleService} build and bind the process-wide instance.
 */
export class ScheduleRepository {
  private readonly host: ScheduleHost;
  private readonly now: () => Date;

  /**
   * @param domain - opened `schedule` domain.
   * @param host - id minter and optional host callbacks; defaults to the host
   *   bound by `configureScheduleHost`.
   * @param now - wall-clock source for creation and seed anchoring.
   */
  constructor(
    private readonly domain: Domain<typeof scheduleDomain>,
    host?: ScheduleHost,
    now: () => Date = () => new Date(),
  ) {
    this.host = host ?? resolveScheduleHost();
    this.now = now;
  }

  /** The domain's authoritative `jobs` table. */
  private get table(): KvTable<string, ScheduleJob> {
    return this.domain.table("jobs");
  }

  /** Applies the host's user-id normalizer, keeping `""` for an empty id. */
  private sanitizeUserId(userId: string | undefined): string {
    if (!userId) return "";
    return this.host.sanitizeUserId?.(userId) ?? userId;
  }

  /** Finds the stored entry whose record id matches, or `undefined`. */
  private entryForId(id: string): JobEntry | undefined {
    for (const [key, job] of this.table.entries()) {
      if (job.id === id) return { key, job };
    }
    return undefined;
  }

  /** Newest-first ordering, with the id as a deterministic tie-break. */
  private newestFirst(jobs: readonly ScheduleJob[]): ScheduleJob[] {
    return [...jobs].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  }

  /**
   * Inserts one job record.
   *
   * @param data - the record to write; `status` defaults to `idle`, `createdAt` to now.
   * @returns the committed record.
   */
  async createCronJob(data: NewCronJob): Promise<CronJobRecord> {
    const userId = this.sanitizeUserId(data.userId);
    const id = this.host.mintId();
    const job = scheduleJobSchema.parse({
      id,
      userId,
      sessionId: data.sessionId,
      type: data.type ?? null,
      name: data.name,
      prompt: data.prompt,
      schedule: data.schedule,
      status: data.status ?? "idle",
      lastRunAt: data.lastRunAt ?? null,
      nextRunAt: data.nextRunAt ?? null,
      createdAt: data.createdAt ?? this.now().toISOString(),
    } satisfies ScheduleJob);

    await this.table.put(scheduleJobKey(userId, id), job);
    return job;
  }

  /**
   * Applies a partial update to one job.
   *
   * Identity fields (`id`, `userId`, `createdAt`) and the domain key are
   * preserved; a caller cannot re-key an existing job through an update.
   *
   * @param id - record id of the job.
   * @param updates - record fields to replace.
   * @returns the updated record, or `undefined` when no record matched.
   */
  async updateCronJob(
    id: string,
    updates: Partial<CronJobRecord>,
  ): Promise<CronJobRecord | undefined> {
    const entry = this.entryForId(id);
    if (entry === undefined) return undefined;

    const next = scheduleJobSchema.parse({
      ...entry.job,
      ...updates,
      id: entry.job.id,
      userId: entry.job.userId,
      createdAt: entry.job.createdAt,
    } satisfies ScheduleJob);

    await this.table.put(entry.key, next);
    return next;
  }

  /**
   * Reads one job by record id.
   * @param id - record id of the job.
   */
  getCronJobById(id: string): CronJobRecord | undefined {
    return this.entryForId(id)?.job;
  }

  /**
   * Reads every job owned by one user, newest first.
   * @param userId - owner whose records are returned; an empty id returns `[]`.
   */
  getCronJobsByUserId(userId: string): CronJobRecord[] {
    const safeUserId = this.sanitizeUserId(userId);
    if (!safeUserId) return [];

    const jobs = [...this.table.entries()]
      .map(([, job]) => job)
      .filter((job) => job.userId === safeUserId);
    return this.newestFirst(jobs);
  }

  /**
   * Reads every job bound to one session, newest first.
   * @param sessionId - session whose jobs are returned; an empty id returns `[]`.
   */
  getCronJobsBySessionId(sessionId: string): CronJobRecord[] {
    if (!sessionId) return [];

    const jobs = [...this.table.entries()]
      .map(([, job]) => job)
      .filter((job) => job.sessionId === sessionId);
    return this.newestFirst(jobs);
  }

  /**
   * Finds jobs due at or before the cutoff, excluding those already running.
   * @param beforeIso - cutoff instant; defaults to the current wall clock.
   */
  findDueCronJobs(beforeIso?: string): CronJobRecord[] {
    const cutoff = beforeIso || this.now().toISOString();
    const cutoffMs = Date.parse(cutoff);

    return [...this.table.entries()]
      .map(([, job]) => job)
      .filter(
        (job) =>
          job.status !== "running" &&
          job.nextRunAt !== null &&
          Date.parse(job.nextRunAt) <= cutoffMs,
      )
      .sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""));
  }

  /**
   * Ensures one seeded job exists per configured `(userId, type)` pair.
   *
   * Existing jobs are refreshed in place (schedule, prompt, name, status) and
   * are only re-anchored when `runImmediately` is requested. A seed whose
   * `sessionSlug` resolves to no session is skipped.
   *
   * @param userId - owner whose sessions receive the seeds.
   * @param jobsList - seeds to create or refresh; empty or omitted is a no-op.
   * @param options - `runImmediately` anchors every seeded job at now.
   * @throws ScheduleError with `schedule_unconfigured` when the host exposes no
   *   session-slug lookup.
   */
  async ensureDefaultCronJobsByUserId(
    userId: string,
    jobsList?: readonly DefaultCronJob[],
    options?: EnsureDefaultCronJobsOptions,
  ): Promise<void> {
    const safeUserId = this.sanitizeUserId(userId);
    if (!safeUserId || !jobsList || jobsList.length === 0) return;

    const findSessionId = this.host.findSessionIdBySlug;
    if (findSessionId === undefined) {
      throw new ScheduleError(
        "schedule_unconfigured",
        "Seeding default schedule jobs requires the host to configure ScheduleHost.findSessionIdBySlug.",
      );
    }

    const now = this.now().toISOString();
    for (const job of jobsList) {
      const existing = this.getCronJobsByUserId(safeUserId).find(
        (candidate) => candidate.type === job.type,
      );

      if (existing !== undefined) {
        await this.updateCronJob(existing.id, {
          schedule: job.schedule,
          prompt: job.prompt,
          name: job.name,
          status: "idle",
          ...(options?.runImmediately ? { nextRunAt: now } : {}),
        });
        continue;
      }

      const sessionId = await findSessionId(safeUserId, job.sessionSlug);
      if (sessionId === undefined) continue;

      await this.createCronJob({
        userId: safeUserId,
        sessionId,
        type: job.type,
        name: job.name,
        prompt: job.prompt,
        schedule: job.schedule,
        status: "idle",
        nextRunAt: options?.runImmediately
          ? now
          : computeNextOccurrence(job.schedule).toISOString(),
      });
    }
  }

  /**
   * Deletes every job of the given types for one user.
   * @param userId - owner whose records are removed.
   * @param types - workflow discriminators to remove.
   * @returns the number of deleted records.
   */
  async deleteCronJobsByTypes(
    userId: string,
    types: readonly (string | null)[],
  ): Promise<number> {
    const safeUserId = this.sanitizeUserId(userId);
    if (!safeUserId || types.length === 0) return 0;

    let deleted = 0;
    for (const [key, job] of this.table.entries()) {
      if (job.userId !== safeUserId || !types.includes(job.type)) continue;
      if (await this.table.delete(key)) deleted += 1;
    }
    return deleted;
  }

  /**
   * Deletes one job record.
   * @param id - record id of the job.
   * @returns whether a record was removed.
   */
  async deleteCronJob(id: string): Promise<boolean> {
    const entry = this.entryForId(id);
    if (entry === undefined) return false;
    return this.table.delete(entry.key);
  }
}

/**
 * Returns a repository over the process-wide domain binding.
 * Reading the default per call keeps a later binding visible.
 */
function defaultRepository(): ScheduleRepository {
  return requireScheduleRepository();
}

/** Module-level form of {@link ScheduleRepository.createCronJob}. */
export function createCronJob(data: NewCronJob): Promise<CronJobRecord> {
  return defaultRepository().createCronJob(data);
}

/** Module-level form of {@link ScheduleRepository.ensureDefaultCronJobsByUserId}. */
export function ensureDefaultCronJobsByUserId(
  userId: string,
  jobsList?: readonly DefaultCronJob[],
  options?: EnsureDefaultCronJobsOptions,
): Promise<void> {
  return defaultRepository().ensureDefaultCronJobsByUserId(
    userId,
    jobsList,
    options,
  );
}

/** Module-level form of {@link ScheduleRepository.deleteCronJobsByTypes}. */
export function deleteCronJobsByTypes(
  userId: string,
  types: readonly (string | null)[],
): Promise<number> {
  return defaultRepository().deleteCronJobsByTypes(userId, types);
}

/** Module-level form of {@link ScheduleRepository.updateCronJob}. */
export function updateCronJob(
  id: string,
  updates: Partial<CronJobRecord>,
): Promise<CronJobRecord | undefined> {
  return defaultRepository().updateCronJob(id, updates);
}

/** Module-level form of {@link ScheduleRepository.getCronJobById}. */
export function getCronJobById(id: string): CronJobRecord | undefined {
  return defaultRepository().getCronJobById(id);
}

/** Module-level form of {@link ScheduleRepository.getCronJobsByUserId}. */
export function getCronJobsByUserId(userId: string): CronJobRecord[] {
  return defaultRepository().getCronJobsByUserId(userId);
}

/** Module-level form of {@link ScheduleRepository.getCronJobsBySessionId}. */
export function getCronJobsBySessionId(sessionId: string): CronJobRecord[] {
  return defaultRepository().getCronJobsBySessionId(sessionId);
}

/** Module-level form of {@link ScheduleRepository.findDueCronJobs}. */
export function findDueCronJobs(beforeIso?: string): CronJobRecord[] {
  return defaultRepository().findDueCronJobs(beforeIso);
}

/** Module-level form of {@link ScheduleRepository.deleteCronJob}. */
export function deleteCronJob(id: string): Promise<boolean> {
  return defaultRepository().deleteCronJob(id);
}
