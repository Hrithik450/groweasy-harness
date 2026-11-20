import * as cronRepo from "@/lib/repositories/cron.repo";

import * as sessionsRepo from "@/lib/repositories/sessions.repo";
import { MessageId } from "@/lib/llm/llm/brand";
import { randomUUID } from "@/lib/utils/uuid";
import { enqueuePrompt, whenAgentIdle } from "@/lib/core/agent/registry";
import { ensureAgentForSession } from "@/lib/session/agent.host";
import { nextOccurrenceForTiming } from "@/lib/cron/schedule";
import type { CronJob, NewCronJob } from "@/lib/db";
import type { DefaultCronJobConfig } from "./default";
import type { Response } from "./types";

/**
 * In-process run locks. Status is the activity flag, not a run state, so two
 * ticks must not both start the same job; a single-instance SQLite deployment
 * makes this set sufficient.
 */
const runningJobs = new Set<string>();

/** Next run time for a job's timing, or null when it cannot be computed. */
function nextRunFor(
  timing: CronJob["timing"],
  from = new Date(),
): Date | null {
  return nextOccurrenceForTiming(timing, from);
}

/**
 * Creates and registers a new cron job.
 *
 * A connector-gated job starts inactive and is admitted by the connector
 * service; an ungated job is schedulable immediately.
 */
export async function createCronJob(
  data: NewCronJob & { immediate?: boolean; runImmediately?: boolean },
): Promise<Response<CronJob>> {
  try {
    const status = data.status ?? (data.requires ? "inactive" : "active");
    const isImmediate = Boolean(data.immediate || data.runImmediately);
    const nextRunAt =
      status !== "active"
        ? null
        : isImmediate
          ? new Date().toISOString()
          : nextRunFor(data.timing)?.toISOString() ?? null;

    const record = cronRepo.createCronJob({
      userId: data.userId,
      sessionId: data.sessionId,
      name: data.name,
      prompt: data.prompt,
      timing: data.timing,
      requires: data.requires ?? null,
      status,
      nextRunAt,
    });

    return { success: true, data: record };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing cron job configuration.
 */
export async function updateCronJob(
  id: string,
  updates: Partial<CronJob>,
): Promise<Response<CronJob | undefined>> {
  try {
    const existing = cronRepo.getCronJobById(id);
    if (!existing) {
      return { success: false, error: "Cron job not found" };
    }

    const status = updates.status ?? existing.status;
    const timing = updates.timing ?? existing.timing;
    let nextRunAt = updates.nextRunAt;

    if (updates.status === "inactive") {
      nextRunAt = null;
    } else if (
      updates.timing !== undefined &&
      JSON.stringify(updates.timing) !== JSON.stringify(existing.timing) &&
      status === "active"
    ) {
      nextRunAt = nextRunFor(timing)?.toISOString() ?? null;
    } else if (updates.status === "active" && existing.status !== "active") {
      nextRunAt = new Date().toISOString();
    }

    const updated = cronRepo.updateCronJob(id, {
      ...updates,
      ...(nextRunAt !== undefined ? { nextRunAt } : {}),
    });

    return { success: true, data: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Deletes a cron job by ID.
 */
export async function deleteCronJob(id: string): Promise<Response<boolean>> {
  try {
    const deleted = cronRepo.deleteCronJob(id);
    return { success: true, data: deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Fetches all cron jobs for a given user.
 */
export async function getCronJobsByUserId(
  userId: string,
): Promise<Response<CronJob[]>> {
  try {
    const jobs = cronRepo.getCronJobsByUserId(userId);
    return { success: true, data: jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Fetches all cron jobs attached to a specific session.
 */
export async function getCronJobsBySessionId(
  sessionId: string,
): Promise<Response<CronJob[]>> {
  try {
    const jobs = cronRepo.getCronJobsBySessionId(sessionId);
    return { success: true, data: jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Runs one due job as a turn on its target session.
 *
 * The job carries only a prompt and timing; instructions and tools come from
 * the session's composition, exactly as they do for a human turn.
 */
export async function executeJob(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const job = cronRepo.getCronJobById(jobId);
  if (!job) {
    return { success: false, error: `Cron job ${jobId} not found` };
  }

  if (job.status !== "active") {
    return { success: false, error: `Cron job ${jobId} is not active` };
  }

  if (runningJobs.has(jobId)) {
    return { success: false, error: `Cron job ${jobId} is already running` };
  }
  runningJobs.add(jobId);

  const deliveredAt = new Date().toISOString();

  try {
    const session = sessionsRepo.getSessionByUserIdAndSessionId(
      job.userId,
      job.sessionId,
    );

    if (!session) {
      throw new Error(
        `Target session ${job.sessionId} for user ${job.userId} does not exist`,
      );
    }

    console.log(
      `[CronService] Executing cron turn "${job.name}" (ID: ${job.id}) on session ${session.id}...`,
    );

    // Delivery is the prompt entering the session, before the loop waits for
    // the model; it stays observable even when the turn produces nothing.
    cronRepo.updateCronJob(jobId, { lastDeliveryAt: deliveredAt });

    // Same warm agent the chat uses: a scheduled turn queues behind a human
    // one instead of racing it for the session log.
    await ensureAgentForSession(session);
    enqueuePrompt(
      session.id,
      [
        {
          id: MessageId(randomUUID()),
          role: "user",
          content: [{ type: "text", text: job.prompt }],
          source: { kind: "cron", cronJobId: job.id },
        },
      ],
      "queue",
    );
    await whenAgentIdle(session.id);

    const finishedAt = new Date().toISOString();
    const next = job.timing.kind === "at" ? null : nextRunFor(job.timing);

    cronRepo.updateCronJob(jobId, {
      status: next ? "active" : "inactive",
      lastRunAt: finishedAt,
      lastError: null,
      nextRunAt: next ? next.toISOString() : null,
    });

    console.log(
      `[CronService] Completed cron job "${job.name}". Next scheduled run: ${
        next ? next.toISOString() : "none"
      }`,
    );

    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[CronService] Failed executing cron job ${jobId}:`, errMsg);

    const next = job.timing.kind === "at" ? null : nextRunFor(job.timing);

    cronRepo.updateCronJob(jobId, {
      status: next ? "active" : "inactive",
      lastRunAt: new Date().toISOString(),
      lastError: errMsg,
      nextRunAt: next ? next.toISOString() : null,
    });

    return { success: false, error: errMsg };
  } finally {
    runningJobs.delete(jobId);
  }
}

/**
 * Convenience helper to register the default hourly alert scan for a
 * user/session. It stays inactive until the Meta connector admits it.
 */
export async function registerDefaultCronJob(
  userId: string,
  sessionId: string,
): Promise<Response<CronJob>> {
  return createCronJob({
    userId,
    sessionId,
    name: "Hourly Alert Scan",
    prompt:
      "Run the hourly account health scan: load the `alerts` skill, diagnose active campaigns, and persist only new or changed alerts with `updateAlerts`.",
    timing: { kind: "cron", expression: "0 * * * *" },
    requires: "metaAds",
    status: "inactive",
  });
}

/**
 * Ensures default cron jobs exist for the given user from a specific job array.
 */
export async function ensureDefaultCronJobs(
  userId: string,
  jobsList?: readonly DefaultCronJobConfig[],
): Promise<Response<boolean>> {
  try {
    cronRepo.ensureDefaultCronJobsByUserId(userId, jobsList);
    return { success: true, data: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

