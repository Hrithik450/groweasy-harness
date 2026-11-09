/**
 * Main Agent Workflow driven by ReactLoopAgent.
 *
 * One admitted prompt runs one turn. The workflow writes only durable events
 * through the session log; live assistant text is published on the process
 * assistant stream bus and reaches clients over `session.follow`.
 *
 * @module @openai-harness/workflows
 */

import { ReactLoopAgent } from "@openai-harness/agent-loop";
import { MessageId } from "@openai-harness/llm";
import { claimLiveSession } from "@openai-harness/session";
import { getWorkflowHost } from "./host";
import type {
  MainWorkflowParams,
  WorkflowSession,
  WorkflowSessionRow,
} from "./types";

/**
 * Run one admitted prompt as one agent turn.
 * @param params - the session row, admitted prompt, optional submitted block,
 *   and cancellation signal.
 */
export async function executeMainWorkflow<R extends WorkflowSessionRow>(
  params: MainWorkflowParams<R>,
): Promise<void> {
  const { session, block, signal } = params;
  const host = getWorkflowHost();
  // Admission is the only place the prompt text can be bounded before it is
  // durably appended; the guard also logs injection and PII detection.
  const prompt = host.guardPrompt ? host.guardPrompt(params.prompt) : params.prompt;

  const instructions = host.compileSystemPrompt(session.title);
  const tools = host.resolvePresetTools(session.slug);

  const sessionDomain = await host.loadSession(
    session,
    session.slug ?? undefined,
  );

  // While this turn runs, this instance owns the session's event log: tools
  // that mutate the same session (the detail-bar writer) append through it so
  // one writer assigns sequence numbers.
  const releaseSession = claimLiveSession(sessionDomain);

  try {
    // Commit the interaction update before the turn starts: the block
    // replacement is durable state, not a streamed frame.
    if (block) {
      sessionDomain.append(
        "ui/block",
        { id: block.id, spec: block.spec },
        { surfaceOp: "replace" },
      );
    }

    const agent = new ReactLoopAgent<WorkflowSession>(
      sessionDomain,
      { provider: "openai" },
      {
        instructions,
        tools: [...tools],
        preStep: host.preStep,
        // Live text never enters the log; the bus carries it to followers and
        // the durable `assistant/message` lands when the step commits.
        onStreamFrame: (frame) => {
          host.publishAssistantStream(session.id, frame);
        },
      },
    );

    if (signal?.aborted) {
      agent.cancel({ kind: "user" });
      return;
    }

    signal?.addEventListener(
      "abort",
      () => {
        agent.cancel({ kind: "user" });
      },
      { once: true },
    );

    agent.followup({
      id: MessageId(prompt.id),
      role: "user",
      content: prompt.content,
      source: prompt.source,
    });

    await agent.whenIdle();
  } finally {
    releaseSession();
  }
}
