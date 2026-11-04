/**
 * One agent step over an owned Chat Completions loop.
 *
 * Derives the conversation from the durable session log, streams one model
 * response through a {@link ModelDriver}, records the assistant message, and
 * schedules requested tool calls before handing their results to the next step.
 *
 * The driver, message derivation, compaction engine, provider identity, and
 * tool registry all come from the host's {@link AgentLoopHost}.
 *
 * @module @openai-harness/agent-loop
 */

import { randomUUID } from "node:crypto";
import type {
  ContentBlock,
  ModelDriver,
  ModelToolSchema,
  ModelUsage,
  ToolCallBlock,
  UserMessage,
} from "@openai-harness/llm";
import { MessageId } from "@openai-harness/llm";
import type { Agent, AssistantStreamFrame } from "./agent-types";
import { AssistantStreamAttempt } from "./assistant-stream";
import { debugLog } from "./debug";
import type { AgentLoopHost } from "./host";
import { requireAgentLoopHost } from "./host";
import { executeToolCalls, type ToolCallSpec } from "./tool-calls";

export interface RunStepOptions {
  agent: Agent;
  turn: number;
  step: number;
  instructions?: string;
  tools?: readonly ModelToolSchema[];
  signal?: AbortSignal;
  onStreamFrame?: (frame: AssistantStreamFrame) => void;
  queueNextStep: (context: UserMessage) => void;
  /** Explicit model driver; defaults to the host's resolved driver. */
  driver?: ModelDriver;
  /** Host services; defaults to the host bound by `configureAgentLoop`. */
  host?: AgentLoopHost;
}

export type RunStepOutcome =
  | { kind: "completed" }
  | {
      kind: "requires_action";
      toolCallsCount: number;
      concludesTurn?: true;
    };

/** Build the assistant content blocks for one settled step. */
function assistantContent(
  text: string,
  reasoning: string,
  toolCalls: readonly ToolCallBlock[] = [],
): ContentBlock[] {
  const content: ContentBlock[] = [];
  if (reasoning.trim().length > 0) {
    content.push({ type: "reasoning", reasoning });
  }
  if (text.length > 0) {
    content.push({ type: "text", text });
  }
  content.push(...toolCalls);
  return content;
}

/** Render a thrown value for a trace line; abort reasons are plain objects. */
function describeError(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Preserve the caller-owned abort reason for the loop's turn end. */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/**
 * Iterate a model stream, settling as soon as the turn is aborted.
 *
 * Provider SDKs only observe the signal while a request is being opened; a
 * provider that accepts the request and then sends nothing leaves the step
 * waiting forever, so cancellation has to be enforced here rather than trusted
 * to the driver. The losing `next()` keeps running in the background, so its
 * eventual rejection is handled instead of surfacing as an unhandled one.
 *
 * @param source - driver frames.
 * @param signal - the turn's cancellation.
 */
async function* abortable<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal | undefined,
): AsyncGenerator<T> {
  if (!signal) {
    yield* source;
    return;
  }

  const iterator = source[Symbol.asyncIterator]();
  // One rejection for the whole stream: a listener per frame would leak.
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  aborted.catch(() => {});
  const onAbort = (): void => rejectAbort?.(abortReason(signal));
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (signal.aborted) throw abortReason(signal);

      const pending = iterator.next();
      // If abort wins the race, this rejection arrives after the fact.
      pending.catch(() => {});
      const next: IteratorResult<T> = await Promise.race([pending, aborted]);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    // Requested, never awaited: a generator suspended on a stalled network
    // read cannot settle its own `return()`, and the abort is already decided.
    try {
      const closing = iterator.return?.();
      if (closing !== undefined) closing.catch(() => {});
    } catch {
      // Closing an already-aborted provider stream is not an outcome.
    }
  }
}

export async function runStep(
  options: RunStepOptions,
): Promise<RunStepOutcome> {
  const {
    agent,
    turn,
    step,
    instructions = "",
    tools = [],
    signal,
    onStreamFrame,
    queueNextStep,
    driver,
  } = options;
  const host = options.host ?? requireAgentLoopHost();
  const { session } = agent;

  // The guard only rewrites what we persist; streamed frames stay as emitted.
  const finalText = (text: string): string =>
    host.guardAnswer?.({ text, session, turn, step }) ?? text;

  const resolvedDriver = driver ?? host.resolveDriver();
  const provider = host.provider();
  const model = host.model();

  session.append("request/header", {
    header: { config: { provider, model } },
    reason: step === 1 ? "initial" : "resume",
  });

  const compaction = host.compaction?.() ?? null;
  if (compaction?.config.auto === true) {
    try {
      await compaction.maybeCompact(session, resolvedDriver, signal);
    } catch (error: unknown) {
      if (signal?.aborted) throw abortReason(signal);
      console.warn(
        `[compaction] automatic compaction failed: ${
          error instanceof Error ? error.message : String(error)
        }; continuing the step`,
      );
    }
  }

  const messages = host.deriveMessages(session.events, instructions);

  const attempt = new AssistantStreamAttempt(
    session.id,
    step,
    turn,
    step,
    session.seq,
    (frame) => onStreamFrame?.(frame),
  );
  attempt.start();

  const pendingCalls = new Map<
    number,
    { id?: string; name?: string; arguments: string }
  >();
  let reasoning = "";
  let usage: ModelUsage | undefined;
  const startedAt = Date.now();
  let frames = 0;

  debugLog(
    `turn ${turn} step ${step}: requesting ${provider}/${model}`,
    { messages: messages.length, tools: tools.length },
  );

  try {
    for await (const frame of abortable(
      resolvedDriver.stream({
        messages,
        tools,
        signal,
        tenantId: session.userId,
      }),
      signal,
    )) {
      frames++;
      switch (frame.type) {
        case "text-delta":
          attempt.push(frame.delta);
          break;
        case "reasoning-delta":
          reasoning += frame.delta;
          break;
        case "tool-call-delta": {
          const call = pendingCalls.get(frame.index) ?? { arguments: "" };
          if (frame.id !== undefined) call.id = frame.id;
          if (frame.name !== undefined) call.name = frame.name;
          if (frame.argumentsDelta !== undefined) {
            call.arguments += frame.argumentsDelta;
          }
          pendingCalls.set(frame.index, call);
          break;
        }
        case "usage":
          usage = frame.usage;
          break;
        case "done":
          break;
      }

      if (signal?.aborted) {
        throw abortReason(signal);
      }
    }

    if (signal?.aborted) {
      throw abortReason(signal);
    }
  } catch (err) {
    if (!attempt.ended) attempt.abandon();
    debugLog(
      `turn ${turn} step ${step}: model request ${signal?.aborted ? "aborted" : "failed"} after ${Date.now() - startedAt}ms`,
      { frames, error: describeError(err) },
    );
    throw err;
  }

  debugLog(`turn ${turn} step ${step}: model stream ended`, {
    ms: Date.now() - startedAt,
    frames,
    text: attempt.text.length,
    toolCalls: pendingCalls.size,
    reasoning: reasoning.length,
  });

  const toolCalls: ToolCallBlock[] = Array.from(pendingCalls.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([index, call]) =>
      call.name
        ? [
            {
              type: "tool-call" as const,
              id: call.id ?? `call_${turn}_${step}_${index}`,
              name: call.name,
              arguments: call.arguments,
            },
          ]
        : [],
    );

  const appendAssistant = (content: ContentBlock[]) =>
    session.append("assistant/message", {
      turn,
      step,
      message: {
        id: attempt.attemptId as MessageId,
        role: "assistant",
        content,
        source: { kind: "model", provider, model },
      },
      ...(usage ? { usage } : {}),
    }).seq;

  if (toolCalls.length > 0) {
    attempt.settle("assistant/message", () =>
      appendAssistant(
        assistantContent(finalText(attempt.text), reasoning, toolCalls),
      ),
    );

    const specs: ToolCallSpec[] = toolCalls.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));

    const results = await executeToolCalls(agent, turn, step, specs, signal, {
      host,
    });

    for (const result of results) {
      const contextMessage: UserMessage = {
        id: MessageId(randomUUID()),
        role: "user",
        source: {
          kind: "tool-result",
          callId: result.callId,
          turnId: result.turnId,
          name: result.name,
          success: result.success,
          output: result.output,
          error: result.error,
        },
        content: [
          {
            type: "text",
            text: result.success
              ? typeof result.output === "string"
                ? result.output
                : JSON.stringify(result.output ?? "Tool execution succeeded")
              : (result.error ?? "Tool execution failed"),
          },
        ],
      };
      queueNextStep(contextMessage);

      // Deferred contexts ride this result durably: appending them to the log
      // (rather than the inbox) makes them visible to the next step's context.
      for (const context of result.additionalContexts ?? []) {
        session.append("user/message", context);
      }
    }

    const concludesTurn = results.some(
      (result) => result.concludesTurn === true,
    );

    return {
      kind: "requires_action",
      toolCallsCount: results.length,
      ...(concludesTurn ? { concludesTurn: true as const } : {}),
    };
  }

  if (attempt.text.length > 0 || reasoning.trim().length > 0) {
    attempt.settle("assistant/message", () =>
      appendAssistant(assistantContent(finalText(attempt.text), reasoning)),
    );
  } else {
    attempt.settle(
      "assistant/attempt",
      () => session.append("assistant/attempt", { turn, step }).seq,
    );
  }

  return { kind: "completed" };
}
