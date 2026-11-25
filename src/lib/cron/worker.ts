import * as cronRepo from "@/lib/repositories/cron.repo";
import { isAgentRunning } from "@/lib/core/agent/registry";
import { executeJob } from "@/lib/services/cron.service";

/**
 * In-process, self-hosted cron worker for persistent environments (VPS / local dev).
 * Periodically polls SQLite for due jobs and executes them via the CronService.
 */
class CronWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private intervalMs = 30_000; // 30 seconds
  private concurrencyLimit = 100; // Max parallel cron turns across sessions
  /** Pending job id -> session id; a repeated due tick never duplicates. */
  private queue = new Map<string, string>();
  /** Running job id -> session id; the session half prevents collisions. */
  private active = new Map<string, string>();

  /**
   * Starts the background cron worker loop.
   */
  public start(intervalMs = 30_000): void {
    if (this.timer) {
      return; // Already running
    }

    this.intervalMs = intervalMs;
    console.log(
      `[CronWorker] Starting local background scheduler (polling every ${Math.round(this.intervalMs / 1000)}s)...`,
    );

    // Run initial tick on boot
    this.tick().catch((err) =>
      console.error("[CronWorker] Initial tick error:", err),
    );

    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        console.error("[CronWorker] Periodic tick error:", err),
      );
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the background scheduler loop gracefully.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[CronWorker] Background scheduler stopped.");
    }
  }

  /**
   * Main polling cycle: finds due jobs and executes them.
   */
  public async tick(): Promise<void> {
    if (this.isProcessing) {
      return; // Previous tick still processing
    }

    this.isProcessing = true;

    try {
      const now = new Date().toISOString();
      const dueJobs = cronRepo.findDueCronJobs(now);

      if (dueJobs.length > 0) {
        console.log(
          `[CronWorker] Found ${dueJobs.length} due cron job(s) ready for execution.`,
        );
        // Queue by job id: a missed month is still one entry per job, not one
        // per missed occurrence. A busy session keeps its job queued.
        for (const job of dueJobs) {
          this.enqueue(job.id, job.sessionId);
        }
      }

      // Always retry the backlog: a human turn that was running last tick
      // must not strand an already-queued job.
      this.drain();
    } catch (err) {
      console.error("[CronWorker] Error during tick cycle:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  /** Whether this job is actively executing in the worker. */
  public isRunning(jobId: string): boolean {
    return this.active.has(jobId);
  }

  /** Queue one job at most once, even if several ticks find it due. */
  private enqueue(jobId: string, sessionId: string): void {
    if (!this.queue.has(jobId) && !this.active.has(jobId)) {
      this.queue.set(jobId, sessionId);
    }
  }

  /** Start queued jobs while respecting global and per-session concurrency. */
  private drain(): void {
    while (this.active.size < this.concurrencyLimit) {
      const busy = new Set(this.active.values());
      const next = [...this.queue].find(
        ([, sessionId]) => !busy.has(sessionId) && !isAgentRunning(sessionId),
      );
      if (!next) return;

      const [jobId, sessionId] = next;
      this.queue.delete(jobId);
      this.active.set(jobId, sessionId);

      void executeJob(jobId)
        .catch((error) => {
          console.error(`[CronWorker] Job ${jobId} failed:`, error);
        })
        .finally(() => {
          this.active.delete(jobId);
          this.drain();
        });
    }
  }

  /**
   * Queue a job for immediate execution without waiting for the next tick.
   * If its session is busy, the job waits instead of being dropped.
   */
  public async triggerNow(
    jobId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const job = cronRepo.getCronJobById(jobId);
    if (!job) {
      return { success: false, error: `Cron job ${jobId} not found` };
    }
    if (job.status !== "active") {
      return { success: false, error: `Cron job ${jobId} is not active` };
    }
    this.enqueue(job.id, job.sessionId);
    this.drain();
    return { success: true };
  }
}

// Global singleton to prevent duplicate timers during Next.js hot-module reload
const globalForWorker = globalThis as unknown as {
  cronWorker: CronWorker | undefined;
};

export const cronWorker = globalForWorker.cronWorker || new CronWorker();
if (process.env.NODE_ENV !== "production") {
  globalForWorker.cronWorker = cronWorker;
}
