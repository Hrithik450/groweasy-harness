/**
 * Scheduled-prompt vocabulary: job records, creation and update inputs, the
 * default-job seed shape, delivery hand-off values, and the closed error union.
 *
 * The record mirrors the application's former Drizzle `cron_jobs` row without
 * importing its schema: this package owns the rules and the durable domain, the
 * host owns the session records and the workflow delivery. The vocabulary is
 * the application's cron-job model, not the reference's reminder-record union:
 * this app schedules workflow runs, so `type`, `userId`, `lastRunAt`,
 * `nextRunAt`, and the lifecycle `status` are all read or written by the
 * application and are retained instead of being replaced by the reference's
 * `kind`/`title`/selector fields.
 *
 * @module @openai-harness/schedule
 */

/** Lifecycle state stored on one job record. */
export type CronJobStatus = "idle" | "running" | "failed" | "completed";

/** One persisted scheduled prompt as this package reads it back. */
export interface CronJobRecord {
  /** Primary key minted by the host's id minter. */
  readonly id: string;
  /** Owning user; part of the durable record identity. */
  readonly userId: string;
  /** Session that receives the prompt when the job is due. */
  readonly sessionId: string;
  /** Host workflow discriminator; `null` selects the host's default workflow. */
  readonly type: string | null;
  /** Human-readable job name. */
  readonly name: string;
  /** Prompt delivered into the session. */
  readonly prompt: string;
  /** Five-field cron expression used to advance `nextRunAt`. */
  readonly schedule: string;
  /** Last successful execution instant, ISO-8601 UTC. */
  readonly lastRunAt: string | null;
  /** Next due instant, ISO-8601 UTC; due when at or before the wall clock. */
  readonly nextRunAt: string | null;
  /** Lifecycle state; `running` prevents a concurrent execution. */
  readonly status: CronJobStatus | null;
  /** Creation instant, ISO-8601 UTC. */
  readonly createdAt: string;
}

/** One job record as the host asks the repository to insert it. */
export interface NewCronJob {
  /** Owning user. */
  readonly userId: string;
  /** Session that receives the prompt. */
  readonly sessionId: string;
  /** Host workflow discriminator; omitted stores `null`. */
  readonly type?: string | null;
  /** Human-readable job name. */
  readonly name: string;
  /** Prompt delivered into the session. */
  readonly prompt: string;
  /** Five-field cron expression. */
  readonly schedule: string;
  /** Initial lifecycle state; omitted stores `idle`. */
  readonly status?: CronJobStatus | null;
  /** Last successful execution instant; omitted stores `null`. */
  readonly lastRunAt?: string | null;
  /** Next due instant; omitted stores `null`. */
  readonly nextRunAt?: string | null;
  /** Creation instant; omitted uses the write time. */
  readonly createdAt?: string;
}

/**
 * Creation input accepted by the service. `immediate` and `runImmediately`
 * are equivalent conveniences: either one anchors the first run at the
 * current instant instead of the first cron occurrence.
 */
export interface CreateCronJobInput extends NewCronJob {
  /** Run once as soon as the worker next polls. */
  readonly immediate?: boolean;
  /** Run once as soon as the worker next polls; alias of `immediate`. */
  readonly runImmediately?: boolean;
}

/** One seed job bound to a default session slug rather than a session id. */
export interface DefaultCronJob {
  /** Host workflow discriminator stored on the created job. */
  readonly type: string;
  /** Slug of the default session that receives the prompt. */
  readonly sessionSlug: string;
  /** Human-readable job name. */
  readonly name: string;
  /** Prompt delivered into the session. */
  readonly prompt: string;
  /** Five-field cron expression. */
  readonly schedule: string;
}

/** Options shared by the default-job seed helpers. */
export interface EnsureDefaultCronJobsOptions {
  /** Anchor every seeded job at the current instant so it runs immediately. */
  readonly runImmediately?: boolean;
}

/** One due job handed to the host's prompt-delivery callback. */
export interface ScheduleDelivery {
  /** The due job, already marked `running` in storage. */
  readonly job: CronJobRecord;
}

/**
 * Host-supplied delivery: resolve the job's session and append the prompt to
 * it. Resolves once the host accepted the turn; a rejection is recorded as a
 * failed run and the job is rescheduled.
 */
export type SchedulePromptDeliverer = (
  delivery: ScheduleDelivery,
) => Promise<void>;

/**
 * Host-supplied session lookup used only when seeding default jobs, whose
 * seeds name a session slug rather than an id. Returning `undefined` (or a
 * promise of it) skips that seed.
 */
export type ScheduleSessionResolver = (
  userId: string,
  sessionSlug: string,
) => string | undefined | Promise<string | undefined>;

/** Stable failure codes reported by this package. */
export type ScheduleErrorCode =
  | "schedule_not_found"
  | "schedule_busy"
  | "schedule_unconfigured"
  | "invalid_schedule";

/**
 * Typed failure for a management or execution operation. Host adapters keep
 * their own response envelopes and read {@link ScheduleError.message}.
 */
export class ScheduleError extends Error {
  constructor(
    /** Stable machine-readable code. */
    readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

/** Outcome of one execution attempt. */
export interface ScheduleExecutionResult {
  /** Whether the prompt was delivered and the job advanced. */
  readonly success: boolean;
  /** Failure text when {@link ScheduleExecutionResult.success} is false. */
  readonly error?: string;
}

/** Outcome of one due-job batch, tagged with the job that produced it. */
export interface ScheduleRunResult extends ScheduleExecutionResult {
  /** Identity of the attempted job. */
  readonly jobId: string;
}
