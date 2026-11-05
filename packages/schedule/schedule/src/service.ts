/**
 * Schedule management: create, edit, list, delete, seed, and execute durable
 * prompt jobs.
 *
 * {@link ScheduleManager} is the framework-free core. {@link ScheduleService}
 * is the Cordis `ctx.schedule` facade over it, matching the reference
 * `@deepseek-ai/dsh-schedule` shape: it opens the `schedule` storage domain and
 * owns the background worker, while prompt delivery stays a host callback so
 * the service never imports an agent, a session controller, or a database.
 *
 * Execution keeps the application's contract: a job is marked `running`
 * before delivery, a success advances `nextRunAt` to the next cron occurrence
 * and records `lastRunAt`, and a failure marks it `failed` and still advances
 * the schedule so a broken run cannot spin.
 *
 * @module @openai-harness/schedule
 */

import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

import { computeNextOccurrence } from "./recurrence";
import { ScheduleRepository } from "./repository";
import { ScheduleRuntime } from "./runtime";
import {
  configureScheduleRepository,
  releaseScheduleRepository,
  requireScheduleDeliverer,
  requireScheduleRepository,
  type ScheduleHost,
} from "./store";
import { scheduleDomain } from "./storage";
import type {
  CreateCronJobInput,
  CronJobRecord,
  DefaultCronJob,
  EnsureDefaultCronJobsOptions,
  ScheduleDelivery,
  ScheduleExecutionResult,
  SchedulePromptDeliverer,
  ScheduleRunResult,
} from "./types";
import { ScheduleError } from "./types";

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Durable scheduled-prompt management. */
    schedule: ScheduleService;
  }
}

/** Minimal logging seam so the package stays console-agnostic in tests. */
export interface ScheduleLogger {
  /** Informational progress line. */
  log(message: string): void;
  /** Recoverable failure line. */
  error(message: string, error?: unknown): void;
}

/** Default logger: keeps the application's original `[Cron*]` prefixes. */
const consoleLogger: ScheduleLogger = {
  log: (message) => console.log(message),
  error: (message, error) => console.error(message, error),
};

/** Options for one {@link ScheduleManager}. */
export interface ScheduleManagerOptions {
  /** Repository over an opened `schedule` domain; defaults to the bound one. */
  readonly repository?: ScheduleRepository;
  /** Host bindings; defaults to the bindings from `configureScheduleHost`. */
  readonly host?: ScheduleHost;
  /** Maximum executions in flight per due batch; defaults to 2. */
  readonly concurrency?: number;
  /** Overrides the host's delivery callback for this manager. */
  readonly deliverPrompt?: SchedulePromptDeliverer;
  /** Logging sink; defaults to the console. */
  readonly logger?: ScheduleLogger;
  /** Wall-clock source; defaults to `new Date()`. */
  readonly now?: () => Date;
}

/**
 * Framework-free schedule management over one host repository.
 *
 * The repository is resolved per operation, so a host may bind it through
 * {@link ScheduleService} (or `configureScheduleRepository`) after
 * constructing the manager.
 */
export class ScheduleManager {
  private readonly concurrency: number;
  private readonly logger: ScheduleLogger;
  private readonly now: () => Date;

  constructor(private readonly options: ScheduleManagerOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 2);
    this.logger = options.logger ?? consoleLogger;
    this.now = options.now ?? (() => new Date());
  }

  /** The repository this manager resolves for an operation. */
  private get repository(): ScheduleRepository {
    if (this.options.repository !== undefined) return this.options.repository;
    return requireScheduleRepository();
  }

  /**
   * Creates and stores one job.
   *
   * `immediate`/`runImmediately` anchors the first run at now; otherwise the
   * first target is the next cron occurrence. Any `nextRunAt` on the input is
   * ignored, exactly as the application's service did.
   *
   * @param data - job fields plus the optional immediate flags.
   * @returns the committed record.
   */
  createCronJob(data: CreateCronJobInput): Promise<CronJobRecord> {
    const isImmediate = Boolean(data.immediate || data.runImmediately);
    const nextRunAt = isImmediate
      ? this.now().toISOString()
      : computeNextOccurrence(data.schedule).toISOString();

    return this.repository.createCronJob({
      userId: data.userId,
      sessionId: data.sessionId,
      type: data.type ?? null,
      name: data.name,
      prompt: data.prompt,
      schedule: data.schedule,
      status: data.status ?? "idle",
      lastRunAt: data.lastRunAt,
      nextRunAt,
      createdAt: data.createdAt,
    });
  }

  /**
   * Updates one job. A changed schedule re-anchors `nextRunAt` unless the
   * update states one explicitly.
   *
   * @param id - record id of the job.
   * @param updates - fields to replace.
   * @returns the updated record, or `undefined` when the job does not exist.
   */
  async updateCronJob(
    id: string,
    updates: Partial<CronJobRecord>,
  ): Promise<CronJobRecord | undefined> {
    const existing = this.repository.getCronJobById(id);
    if (!existing) return undefined;

    let nextRunAt = updates.nextRunAt;
    if (updates.schedule && updates.schedule !== existing.schedule) {
      nextRunAt = computeNextOccurrence(updates.schedule).toISOString();
    }

    return this.repository.updateCronJob(id, {
      ...updates,
      ...(nextRunAt ? { nextRunAt } : {}),
    });
  }

  /** Deletes one job. @returns whether a record was removed. */
  deleteCronJob(id: string): Promise<boolean> {
    return this.repository.deleteCronJob(id);
  }

  /** Reads every job owned by one user. */
  getCronJobsByUserId(userId: string): CronJobRecord[] {
    return this.repository.getCronJobsByUserId(userId);
  }

  /** Reads every job bound to one session. */
  getCronJobsBySessionId(sessionId: string): CronJobRecord[] {
    return this.repository.getCronJobsBySessionId(sessionId);
  }

  /** Creates or refreshes the host's default job seeds for one user. */
  ensureDefaultCronJobs(
    userId: string,
    jobsList?: readonly DefaultCronJob[],
    options?: EnsureDefaultCronJobsOptions,
  ): Promise<void> {
    return this.repository.ensureDefaultCronJobsByUserId(
      userId,
      jobsList,
      options,
    );
  }

  /** Deletes every job of the given types for one user. */
  deleteCronJobsByTypes(
    userId: string,
    types: readonly (string | null)[],
  ): Promise<number> {
    return this.repository.deleteCronJobsByTypes(userId, types);
  }

  /**
   * Executes one job: locks it, hands the prompt to the host deliverer, then
   * advances or fails the record.
   *
   * Missing, already-running, and delivery failures are reported in the result
   * rather than thrown, because the worker consumes one result per job.
   *
   * @param jobId - record id of the job to run.
   */
  async executeJob(jobId: string): Promise<ScheduleExecutionResult> {
    const job = this.repository.getCronJobById(jobId);
    if (!job) {
      return { success: false, error: `Cron job ${jobId} not found` };
    }

    if (job.status === "running") {
      return { success: false, error: `Cron job ${jobId} is already running` };
    }

    await this.repository.updateCronJob(jobId, { status: "running" });

    try {
      await this.deliver({ job });

      const nextOccurrence = computeNextOccurrence(job.schedule);
      await this.repository.updateCronJob(jobId, {
        status: "idle",
        lastRunAt: this.now().toISOString(),
        nextRunAt: nextOccurrence.toISOString(),
      });

      this.logger.log(
        `[CronService] Completed cron job "${job.name}". Next scheduled run: ${nextOccurrence.toISOString()}`,
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[CronService] Failed executing cron job ${jobId}:`,
        message,
      );

      const nextOccurrence = computeNextOccurrence(job.schedule);
      await this.repository.updateCronJob(jobId, {
        status: "failed",
        nextRunAt: nextOccurrence.toISOString(),
      });

      return { success: false, error: message };
    }
  }

  /**
   * Runs every due job in bounded batches.
   *
   * Jobs are selected once per call; a job that a concurrent poll already
   * marked `running` is excluded by the repository query. Batch results keep
   * the input order and never reject, mirroring `Promise.allSettled`.
   *
   * @param beforeIso - cutoff instant; defaults to the manager's clock.
   * @returns one result per attempted job.
   */
  async runDueJobs(beforeIso?: string): Promise<ScheduleRunResult[]> {
    const cutoff = beforeIso ?? this.now().toISOString();
    const dueJobs = this.repository.findDueCronJobs(cutoff);

    if (dueJobs.length === 0) return [];

    this.logger.log(
      `[CronWorker] Found ${dueJobs.length} due cron job(s) ready for execution.`,
    );

    const results: ScheduleRunResult[] = [];

    for (let i = 0; i < dueJobs.length; i += this.concurrency) {
      const batch = dueJobs.slice(i, i + this.concurrency);
      const settled = await Promise.allSettled(
        batch.map((job) => this.executeJob(job.id)),
      );

      for (const [index, outcome] of settled.entries()) {
        const job = batch[index]!;
        if (outcome.status === "fulfilled") {
          results.push({ jobId: job.id, ...outcome.value });
        } else {
          results.push({
            jobId: job.id,
            success: false,
            error:
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
          });
        }
      }
    }

    return results;
  }

  /** Resolves and invokes the host's delivery callback. */
  private async deliver(delivery: ScheduleDelivery): Promise<void> {
    const deliver =
      this.options.deliverPrompt ??
      (this.options.host === undefined
        ? requireScheduleDeliverer()
        : this.options.host.deliverPrompt);
    if (deliver === undefined) {
      throw new ScheduleError(
        "schedule_unconfigured",
        "Delivering a scheduled prompt requires ScheduleHost.deliverPrompt or ScheduleManagerOptions.deliverPrompt.",
      );
    }
    await deliver(delivery);
  }
}

/** Process-wide manager, created on first use or bound by ScheduleService. */
let defaultManager: ScheduleManager | undefined;

/**
 * Returns the shared manager, creating it on first use. Host adapters that
 * keep the application's original singleton behaviour call this.
 */
export function getScheduleManager(): ScheduleManager {
  defaultManager ??= new ScheduleManager();
  return defaultManager;
}

/**
 * Bind the process-wide manager. {@link ScheduleService} calls this so the
 * free-function API and the Cordis facade share one manager.
 * @param manager - manager the process should use.
 */
export function configureScheduleManager(manager: ScheduleManager): void {
  defaultManager = manager;
}

/** Configuration for the Cordis facade. */
export interface ScheduleServiceConfig {
  /** Poll interval in milliseconds; omission defaults to 30 seconds. */
  readonly intervalMs?: number;
  /** Maximum executions in flight per due batch; omission defaults to 2. */
  readonly concurrency?: number;
  /** Whether to arm the poller at initialization; defaults to true. */
  readonly autoStart?: boolean;
}

/**
 * `ctx.schedule`: the Cordis facade over {@link ScheduleManager}.
 *
 * Opening the `schedule` domain is the service's lifecycle work, mirroring
 * the reference package: it binds the repository for the free-function API,
 * arms the worker, and closes the domain on teardown. Delivery into a session
 * stays a host callback (see {@link ScheduleHost}).
 */
export class ScheduleService extends Service {
  /** The storage-domain facility must be mounted before the domain opens. */
  static inject = ["storageDomain"];

  static Config: z<ScheduleServiceConfig> = z.object({
    intervalMs: z.number().step(1).min(1_000).default(30_000),
    concurrency: z.number().step(1).min(1).max(32).default(2),
    autoStart: z.boolean().default(true),
  });

  /** The manager this facade delegates to. */
  readonly manager: ScheduleManager;
  /** The poller this facade starts and stops. */
  readonly runtime: ScheduleRuntime;
  /** Domain-open and teardown registration; awaited by `Service.init`. */
  private readonly initialized: PromiseLike<unknown>;

  constructor(ctx: Context, config: ScheduleServiceConfig = {}) {
    super(ctx, "schedule");
    this.manager = new ScheduleManager({
      concurrency: config.concurrency ?? 2,
    });
    this.runtime = new ScheduleRuntime({
      manager: this.manager,
      intervalMs: config.intervalMs ?? 30_000,
    });
    this.initialized = ctx.effect(async () => {
      const domain = await ctx.storageDomain.open(scheduleDomain);
      const repository = new ScheduleRepository(domain);
      configureScheduleRepository(repository);
      configureScheduleManager(this.manager);
      if (config.autoStart ?? true) this.start();
      return async () => {
        this.stop();
        releaseScheduleRepository(repository);
        await domain.close();
      };
    });
  }

  async [Service.init](): Promise<void> {
    await this.initialized;
  }

  /** Arms the background poller. @param intervalMs - optional poll override. */
  start(intervalMs?: number): void {
    this.runtime.start(intervalMs);
  }

  /** Disarms the background poller. */
  stop(): void {
    this.runtime.stop();
  }

  /** Creates one job. See {@link ScheduleManager.createCronJob}. */
  create(data: CreateCronJobInput): Promise<CronJobRecord> {
    return this.manager.createCronJob(data);
  }

  /** Updates one job. See {@link ScheduleManager.updateCronJob}. */
  update(
    id: string,
    updates: Partial<CronJobRecord>,
  ): Promise<CronJobRecord | undefined> {
    return this.manager.updateCronJob(id, updates);
  }

  /** Deletes one job. See {@link ScheduleManager.deleteCronJob}. */
  delete(id: string): Promise<boolean> {
    return this.manager.deleteCronJob(id);
  }

  /** Lists one user's jobs. See {@link ScheduleManager.getCronJobsByUserId}. */
  list(userId: string): CronJobRecord[] {
    return this.manager.getCronJobsByUserId(userId);
  }

  /** Lists one session's jobs. See {@link ScheduleManager.getCronJobsBySessionId}. */
  listForSession(sessionId: string): CronJobRecord[] {
    return this.manager.getCronJobsBySessionId(sessionId);
  }

  /** Runs one job now. See {@link ScheduleManager.executeJob}. */
  execute(jobId: string): Promise<ScheduleExecutionResult> {
    return this.manager.executeJob(jobId);
  }

  /** Runs every due job. See {@link ScheduleManager.runDueJobs}. */
  runDueJobs(beforeIso?: string): Promise<ScheduleRunResult[]> {
    return this.manager.runDueJobs(beforeIso);
  }
}

export default ScheduleService;
