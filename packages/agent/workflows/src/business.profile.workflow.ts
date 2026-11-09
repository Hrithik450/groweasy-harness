/**
 * Business Profile Agent Workflow driven by ReactLoopAgent.
 *
 * @module @openai-harness/workflows
 */

import { ReactLoopAgent } from "@openai-harness/agent-loop";
import { MessageId } from "@openai-harness/llm";
import { claimLiveSession } from "@openai-harness/session";
import { randomUUID } from "@openai-harness/uuid";
import { getWorkflowHost } from "./host";
import type {
  BusinessProfileWorkflowParams,
  WorkflowSession,
  WorkflowSessionRow,
} from "./types";
import { computeAgentHash } from "./utils";

/**
 * Investigate one brand URL and persist the resulting business profile.
 * @param params - the session row, brand URL, optional prompt override, and
 *   event sink.
 */
export async function executeBusinessProfileWorkflow<
  R extends WorkflowSessionRow,
>(params: BusinessProfileWorkflowParams<R>): Promise<void> {
  const { session, brandUrl, input, onEvent, signal } = params;
  const host = getWorkflowHost();

  const instructions = host.compileBusinessProfilePrompt(brandUrl);

  const tools = host.resolvePresetTools("businessProfile");

  const sessionDomain = await host.loadSession(session);

  // This instance owns the log for the duration of the turn; see
  // `claimLiveSession`.
  const releaseSession = claimLiveSession(sessionDomain);

  const stopListening = sessionDomain.onEvent(async (ev) => {
    switch (ev.type) {
      case "tool/call": {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(ev.data.arguments);
        } catch {
          args = { raw: ev.data.arguments };
        }
        await onEvent?.({
          type: "tool/call",
          data: { name: ev.data.name, args },
        });
        break;
      }
      case "tool/result":
        await onEvent?.({
          type: "tool/result",
          data: {
            name: ev.data.error?.name ?? "tool",
            success: !ev.data.message.isError,
          },
        });
        break;
      case "turn/end":
        if (ev.data.reason.kind === "error") {
          const errText =
            typeof ev.data.reason.error === "string"
              ? ev.data.reason.error
              : ev.data.reason.error.message;
          await onEvent?.({
            type: "session/error",
            data: { error: errText },
          });
        }
        break;
    }
  });

  const agent = new ReactLoopAgent<WorkflowSession>(
    sessionDomain,
    { provider: "openai" },
    {
      instructions,
      tools: [...tools],
      onStreamFrame: async (frame) => {
        if (frame.type === "chunk" && frame.delta) {
          await onEvent?.({
            type: "session/message",
            data: {
              id: frame.attemptId,
              role: "assistant",
              kind: "text",
              content: frame.delta,
            },
          });
        }
      },
    },
  );

  // Cancellation is bridged from the caller's signal into the loop's own
  // cancel path, exactly as the main workflow does: the agent aborts the model
  // request and in-flight tools, and `whenIdle` settles once the turn ends.
  const cancel = (): void => {
    agent.cancel({ kind: "user" });
  };
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    if (signal?.aborted) {
      cancel();
      return;
    }

    const messageText =
      input?.trim() ??
      "This is a cron job execution for the business profile, follow the instructions and update the profile accordingly.";

    const id = randomUUID();
    const admitted = host.guardPrompt?.({
      id,
      content: [{ type: "text", text: messageText }],
      source: { kind: "cron" },
    }) ?? {
      id,
      content: [{ type: "text" as const, text: messageText }],
      source: { kind: "cron" as const },
    };

    agent.followup({
      id: MessageId(admitted.id),
      role: "user",
      content: admitted.content,
      source: admitted.source,
    });

    await agent.whenIdle();
  } finally {
    signal?.removeEventListener("abort", cancel);
    stopListening();
    releaseSession();
  }
}
