/**
 * Cron management facade.
 *
 * The job lifecycle, due-batch execution, delivery hand-off, and durable
 * storage are owned by `@openai-harness/schedule`. This module keeps the
 * deployment's fail-soft `Response` contract: the package throws typed
 * failures and reports execution outcomes per job, while every management call
 * here returns `{ success, data | error }` exactly as the HTTP routes expect.
 *
 * The `schedule` storage domain is opened by `ScheduleService` at boot; until
 * then, management calls fail soft with the package's unconfigured message.
 *
 * @module @openai-harness/gateway/cron
 */

import {
  DEFAULT_META_CRON_JOBS,
  getScheduleManager,
  type CreateCronJobInput,
  type CronJobRecord,
  type DefaultCronJob,
  type EnsureDefaultCronJobsOptions,
} from "@openai-harness/schedule";

/** The manager bound to this deployment's domain and workflow dispatcher. */
const manager = () => getScheduleManager();

/** This deployment's fail-soft result envelope. */
export type Response<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Builds the failure envelope from anything thrown. */
function failure<T>(error: unknown): Response<T> {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message };
}

/**
 * Creates and registers a new cron job.
 * If `immediate` is true, `nextRunAt` is set to now so the worker executes it
 * right away.
 */
export async function createCronJob(
  data: CreateCronJobInput,
): Promise<Response<CronJobRecord>> {
  try {
    return { success: true, data: await manager().createCronJob(data) };
  } catch (error) {
    return failure(error);
  }
}

/** Updates an existing cron job configuration. */
export async function updateCronJob(
  id: string,
  updates: Partial<CronJobRecord>,
): Promise<Response<CronJobRecord | undefined>> {
  try {
    const updated = await manager().updateCronJob(id, updates);
    if (!updated) {
      return { success: false, error: "Cron job not found" };
    }
    return { success: true, data: updated };
  } catch (error) {
    return failure(error);
  }
}

/** Deletes a cron job by ID. */
export async function deleteCronJob(id: string): Promise<Response<boolean>> {
  try {
    return { success: true, data: await manager().deleteCronJob(id) };
  } catch (error) {
    return failure(error);
  }
}

/** Fetches all cron jobs for a given user. */
export async function getCronJobsByUserId(
  userId: string,
): Promise<Response<CronJobRecord[]>> {
  try {
    return { success: true, data: await manager().getCronJobsByUserId(userId) };
  } catch (error) {
    return failure(error);
  }
}

/** Fetches all cron jobs attached to a specific session. */
export async function getCronJobsBySessionId(
  sessionId: string,
): Promise<Response<CronJobRecord[]>> {
  try {
    return {
      success: true,
      data: await manager().getCronJobsBySessionId(sessionId),
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Runs one agent turn for the specified cron job.
 *
 * The package locks the record, delivers the prompt through the bound
 * dispatcher, advances the schedule on success, and records a failed run on
 * rejection.
 */
export async function executeJob(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await manager().executeJob(jobId);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Registers the default daily diagnostic audit for a user/session. */
export async function registerDefaultCronJob(
  userId: string,
  sessionId: string,
  options?: { runImmediately?: boolean },
): Promise<Response<CronJobRecord>> {
  const seed = DEFAULT_META_CRON_JOBS[0]!;
  return createCronJob({
    userId,
    sessionId,
    name: seed.name,
    prompt: seed.prompt,
    schedule: seed.schedule,
    immediate: options?.runImmediately ?? true,
  });
}

/** Ensures default cron jobs exist for the given user. */
export async function ensureDefaultCronJobs(
  userId: string,
  jobsList?: readonly DefaultCronJob[],
  options?: EnsureDefaultCronJobsOptions,
): Promise<Response<boolean>> {
  try {
    await manager().ensureDefaultCronJobs(userId, jobsList, options);
    return { success: true, data: true };
  } catch (error) {
    return failure(error);
  }
}

/** Deletes a user's cron jobs matching specific job types (cascade on disconnect). */
export async function deleteCronJobsByTypes(
  userId: string,
  types: readonly (string | null)[],
): Promise<Response<number>> {
  try {
    return {
      success: true,
      data: await manager().deleteCronJobsByTypes(userId, types),
    };
  } catch (error) {
    return failure(error);
  }
}

export {
  DEFAULT_BUSINESS_PROFILE_CRON_JOBS,
  DEFAULT_CRON_JOBS,
  DEFAULT_META_CRON_JOBS,
} from "@openai-harness/schedule";
