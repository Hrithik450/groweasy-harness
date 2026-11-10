/**
 * Scheduled-prompt composition.
 *
 * The job rules, recurrence arithmetic, storage domain, and poller live in
 * `@openai-harness/schedule`. This plugin binds the deployment-only pieces the
 * package cannot own — the UUIDv7 minter, the user-id guard, session lookups,
 * and the workflow dispatcher that delivers one prompt — then mounts the
 * `ctx.schedule` facade, which opens the `schedule` domain.
 *
 * @module @openai-harness/gateway/wiring/schedule
 */

import type { Context } from "@deepseek-ai/cordis";
import {
  ScheduleService,
  configureScheduleHost,
} from "@openai-harness/schedule";
import {
  sessionsRepo,
  type SessionRecord,
} from "@openai-harness/session-persistence";
import { uuidv7 } from "@openai-harness/uuid";
import { sanitizeUserId } from "@openai-harness/util-values";
import { dispatchWorkflow } from "@openai-harness/workflows";
import { configureWorkflowHost } from "./workflows";

/** Cordis plugin name. */
export const name = "gateway:schedule";

/** The domain facility and the workflow bindings must exist first. */
export const inject = ["storageDomain"];

/**
 * Bind the schedule host and mount `ctx.schedule`.
 * @param ctx - root context.
 */
export async function apply(ctx: Context): Promise<void> {
  configureWorkflowHost();
  configureScheduleHost({
    mintId: uuidv7,
    sanitizeUserId,
    findSessionIdBySlug: async (userId, sessionSlug) =>
      (await sessionsRepo.getSessionByUserIdAndSlug(userId, sessionSlug))?.id,
    deliverPrompt: async ({ job }) => {
      const record = await sessionsRepo.getSessionByUserIdAndSessionId(
        job.userId,
        job.sessionId,
      );
      if (!record) {
        throw new Error(
          `Target session ${job.sessionId} for user ${job.userId} does not exist`,
        );
      }

      await dispatchWorkflow({
        type: job.type,
        // The dispatcher accepts the structural session row; the workflow host
        // loads the durable domain object from it.
        session: record,
        prompt: job.prompt,
      });
    },
  });

  await ctx.plugin(ScheduleService);
}

export type { SessionRecord };
