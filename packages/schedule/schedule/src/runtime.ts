/**
 * Background poller for due scheduled prompts.
 *
 * The runtime owns only the timer and the re-entrancy guard. It asks the
 * manager for the due batch, so tests can drive {@link ScheduleRuntime.tick}
 * directly and a deployment can decide when, or whether, to start it.
 *
 * The timer is `unref`'d so an otherwise idle Node process can exit; a tick
 * already in flight is never overlapped, matching the application's original
 * worker.
 *
 * @module @openai-harness/schedule
 */

import type { ScheduleExecutionResult } from "./types";
import type { ScheduleLogger, ScheduleManager } from "./service";

/** Poll interval applied when a deployment names none. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** Options for one {@link ScheduleRuntime}. */
export interface ScheduleRuntimeOptions {
  /** Manager whose due batch this runtime executes. */
  readonly manager: ScheduleManager;
  /** Poll interval in milliseconds; defaults to 30 seconds. */
  readonly intervalMs?: number;
  /** Logging sink; defaults to the console. */
  readonly logger?: ScheduleLogger;
}

/** Default logger matching the manager's `[Cron*]` prefixes. */
const consoleLogger: ScheduleLogger = {
  log: (message) => console.log(message),
  error: (message, error) => console.error(message, error),
};

/**
 * Polls the manager on a fixed interval and executes due jobs.
 *
 * `start` is idempotent: a second call while the timer is armed does nothing,
 * so a host can call it from more than one composition path safely.
 */
export class ScheduleRuntime {
  private readonly manager: ScheduleManager;
  private readonly logger: ScheduleLogger;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(options: ScheduleRuntimeOptions) {
    this.manager = options.manager;
    this.logger = options.logger ?? consoleLogger;
    this.intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  /** Whether the poller is currently armed. */
  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * Arms the background loop.
   *
   * @param intervalMs - poll interval override for this start.
   */
  start(intervalMs = this.intervalMs): void {
    if (this.timer) return;

    this.intervalMs = intervalMs;
    this.logger.log(
      `[CronWorker] Starting local background scheduler (polling every ${Math.round(this.intervalMs / 1000)}s)...`,
    );

    this.tick().catch((error) =>
      this.logger.error("[CronWorker] Initial tick error:", error),
    );

    this.timer = setInterval(() => {
      this.tick().catch((error) =>
        this.logger.error("[CronWorker] Periodic tick error:", error),
      );
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /** Disarms the background loop; an in-flight tick finishes on its own. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.log("[CronWorker] Background scheduler stopped.");
  }

  /**
   * One polling cycle: executes the due batch unless a tick is still running.
   * Rejections are logged and swallowed so the interval keeps firing.
   */
  async tick(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      await this.manager.runDueJobs();
    } catch (error) {
      this.logger.error("[CronWorker] Error during tick cycle:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Executes one job immediately, without waiting for the next tick.
   *
   * @param jobId - primary key of the job to run.
   */
  triggerNow(jobId: string): Promise<ScheduleExecutionResult> {
    return this.manager.executeJob(jobId);
  }
}
