/**
 * Cron-job workflow dispatcher.
 *
 * Maps a session cron job type to the workflow that runs it. Connector and
 * session storage stay with the host: the business-profile route reads the
 * brand URL through the bound {@link WorkflowHost}.
 *
 * @module @openai-harness/workflows
 */

import { randomUUID } from "@openai-harness/uuid";
import { executeBusinessProfileWorkflow } from "./business.profile.workflow";
import { getWorkflowHost } from "./host";
import { executeMainWorkflow } from "./main.workflow";
import type {
  WorkflowCronJob,
  WorkflowEvent,
  WorkflowRunner,
  WorkflowSessionRow,
} from "./types";

/** Cron prompts enter the agent inbox as durable `cron`-sourced input. */
function cronPrompt(prompt: string) {
  return {
    id: randomUUID(),
    content: [{ type: "text" as const, text: prompt }],
    source: { kind: "cron" as const },
  };
}

/**
 * Dispatcher mapping session cron job types to their respective execution
 * workflows.
 */
export const dispatcher: Record<WorkflowCronJob, WorkflowRunner> & {
  default: WorkflowRunner;
} = {
  "adManager/alerts": async ({ session, prompt }) => {
    await executeMainWorkflow({ session, prompt: cronPrompt(prompt) });
  },

  "adManager/suggestions": async ({ session, prompt }) => {
    await executeMainWorkflow({ session, prompt: cronPrompt(prompt) });
  },

  "adManager/campaigns": async ({ session, prompt }) => {
    await executeMainWorkflow({ session, prompt: cronPrompt(prompt) });
  },

  "businessProfile/update": async ({ session, prompt, onEvent }) => {
    const brandUrl = getWorkflowHost().businessProfileUrl(session.userId);
    if (brandUrl) {
      await executeBusinessProfileWorkflow({
        session,
        brandUrl,
        input: prompt,
        onEvent,
      });
    } else {
      console.warn(
        `[Dispatcher] Skipping businessProfile/update: no website URL found for user ${session.userId}`,
      );
    }
  },

  "adStrategist/marketWinners": async ({ session, prompt }) => {
    await executeMainWorkflow({ session, prompt: cronPrompt(prompt) });
  },

  "adStrategist/reports": async ({ session, prompt }) => {
    await executeMainWorkflow({ session, prompt: cronPrompt(prompt) });
  },

  "adManager/accountWinners": async ({ session, prompt }) => {
    await executeMainWorkflow({ session, prompt: cronPrompt(prompt) });
  },

  default: async ({ session, prompt }) => {
    await executeMainWorkflow({ session, prompt: cronPrompt(prompt) });
  },
};

/**
 * Run the workflow a cron job type names, falling back to `default`.
 * @param params - the job type, session row, prompt, and optional event sink.
 */
export async function dispatchWorkflow(params: {
  type?: WorkflowCronJob | string | null;
  session: WorkflowSessionRow;
  prompt: string;
  onEvent?: (event: WorkflowEvent) => void | Promise<void>;
}): Promise<void> {
  const runner =
    (params.type && dispatcher[params.type as WorkflowCronJob]) ||
    dispatcher.default;
  await runner(params);
}
