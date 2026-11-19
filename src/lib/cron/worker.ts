import * as cronRepo from "@/lib/repositories/cron.repo";
import { executeJob } from "@/lib/services/cron.service";

/**
 * In-process, self-hosted cron worker for persistent environments (VPS / local dev).
 * Periodically polls SQLite for due jobs and executes them via the CronService.
 */
class CronWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private intervalMs = 30_000; // 30 seconds
  private concurrencyLimit = 2; // Max parallel agent turns on VPS

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

      if (dueJobs.length === 0) {
        return;
      }

      console.log(
        `[CronWorker] Found ${dueJobs.length} due cron job(s) ready for execution.`,
      );

      // Process with concurrency limit to protect VPS resources and avoid rate limits
      for (let i = 0; i < dueJobs.length; i += this.concurrencyLimit) {
        const batch = dueJobs.slice(i, i + this.concurrencyLimit);
        await Promise.allSettled(batch.map((job) => executeJob(job.id)));
      }
    } catch (err) {
      console.error("[CronWorker] Error during tick cycle:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Triggers an immediate execution for a specific job without waiting for the next tick.
   */
  public async triggerNow(
    jobId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return executeJob(jobId);
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
