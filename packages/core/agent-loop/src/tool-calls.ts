/**
 * Schedules one assistant step's tool calls.
 *
 * Exclusive calls form barriers; parallel calls use a bounded rolling pool and
 * are reclassified before start. Dispatch may overlap while policy, results,
 * and result context remain model-ordered. Abort or an internal scheduler
 * failure stops replenishment and drains started calls.
 *
 * Abort records synthetic error results for skipped calls so replay stays
 * valid. A terminal scheduler failure rejects after draining; the owning step
 * records conservative recovery results before closing.
 *
 * The registry itself is host-owned: concurrency classification and execution
 * come from {@link AgentLoopHost}.
 *
 * @module @openai-harness/agent-loop
 */

import type { ToolResultMessage, UserMessage } from "@openai-harness/llm";
import { ToolCallId } from "@openai-harness/llm";
import type { SessionSeq } from "@openai-harness/session";
import type { Agent, AgentSession } from "./agent-types";
import {
  requireAgentLoopHost,
  type AgentLoopHost,
  type ExecuteToolOutput,
  type ToolExecutionInput,
} from "./host";

/**
 * Canonical error code for cancellation before a tool body was invoked.
 *
 * Kept here as the loop's wire-compatible copy of the registry's constant; the
 * host registry stays authoritative for its own executions.
 */
export const TOOL_ABORTED_BEFORE_DISPATCH = "ABORTED_BEFORE_DISPATCH";

export interface ToolCallSpec {
  id: string;
  name: string;
  arguments: string;
  turnId?: string;
  scope?: string;
}

export interface ExecutedToolResult {
  callId: string;
  turnId?: string;
  name: string;
  success: boolean;
  output: unknown;
  error?: string;
  reminder?: string;
  /** Context the tool deferred; the agent loop appends it after its result. */
  additionalContexts?: UserMessage[];
  /** Whether the agent loop stops after committing this successful batch. */
  concludesTurn?: true;
}

/** Default rolling-pool width when the caller does not override it. */
const DEFAULT_MAX_PARALLEL_TOOL_CALLS = 8;

/** Signal for calls whose caller supplied none; never aborted. */
const NEVER_ABORTED = new AbortController().signal;

/** One tool call after argument parsing, ready to schedule. */
interface PlannedCall {
  spec: ToolCallSpec;
  exec: ToolExecutionInput;
}

/** Settled dispatch awaiting model-order finalization. */
interface Slot {
  raw: ExecuteToolOutput;
}

/** One scheduler group outcome, including a drained cancellation. */
interface GroupOutcome {
  consumed: number;
  aborted: boolean;
  results: ExecutedToolResult[];
}

export interface ExecuteToolCallsOptions {
  /** Rolling-pool width for `parallel` calls. */
  maxParallelToolCalls?: number;
  /** Host services; defaults to the host bound by `configureAgentLoop`. */
  host?: AgentLoopHost;
}

/**
 * Parse model arguments, preserving invalid JSON as text and mapping empty
 * input to `{}`.
 */
function parseArguments(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
}

/**
 * Fail-closed live classification: only an exact `parallel` result may
 * overlap siblings; unknown, undeclared, or throwing classifiers are
 * exclusive.
 */
function executionModeOf(
  host: AgentLoopHost,
  exec: ToolExecutionInput,
): "parallel" | "exclusive" {
  try {
    return host.executionMode(exec).kind === "parallel"
      ? "parallel"
      : "exclusive";
  } catch {
    return "exclusive";
  }
}

/**
 * Execute a step's tool calls by their live concurrency mode.
 *
 * Ordinary completion and abort commit started-call results in model order.
 * Abort stops replenishment, drains started calls, records synthetic results
 * for the remaining model calls, and returns the full model-ordered batch.
 * An internal scheduler failure drains already-started calls and rejects with
 * the first failure.
 *
 * @param agent - the agent on whose behalf every call in this batch runs; its
 *   session receives `tool/call` and `tool/result` events.
 * @param turn - current turn number.
 * @param step - current step number.
 * @param toolCalls - assistant calls in model order.
 * @param signal - abort signal shared by the step.
 * @param options - scheduler tuning and the host tool services.
 * @returns one result per model call, in model order, for the driver.
 */
export async function executeToolCalls(
  agent: Agent,
  turn: number,
  step: number,
  toolCalls: readonly ToolCallSpec[],
  signal?: AbortSignal,
  options: ExecuteToolCallsOptions = {},
): Promise<ExecutedToolResult[]> {
  const host = options.host ?? requireAgentLoopHost();
  const { session } = agent;
  const planned: PlannedCall[] = toolCalls.map((spec) => ({
    spec,
    exec: {
      callId: ToolCallId(spec.id),
      name: spec.name,
      arguments: parseArguments(spec.arguments),
      scope: spec.scope ?? session.header.agentPreset,
      signal: signal ?? NEVER_ABORTED,
      agent,
    },
  }));

  const maxParallelToolCalls = Math.max(
    1,
    options.maxParallelToolCalls ?? DEFAULT_MAX_PARALLEL_TOOL_CALLS,
  );
  const results: ExecutedToolResult[] = [];

  let next = 0;
  while (next < planned.length) {
    // Commit before classifying again so registry changes affect unstarted calls.
    const first = planned[next]!;
    const mode = executionModeOf(host, first.exec);
    const group = mode === "parallel" ? planned.slice(next) : [first];
    const outcome = await runGroup(
      host,
      session,
      turn,
      step,
      group,
      mode,
      signal,
      maxParallelToolCalls,
    );
    results.push(...outcome.results);
    next += outcome.consumed;
    if (outcome.aborted) {
      for (const call of planned.slice(next)) {
        results.push(appendSkippedToolCall(session, turn, step, call.spec));
      }
      return results;
    }
  }

  return results;
}

/**
 * Run one exclusive barrier or parallel pool. Later calls are reclassified
 * before start; an exclusive reclassification waits for the current pool to
 * drain and remains for the caller's next barrier. Results commit in model
 * order. Abort stops starts, drains and commits started calls, records results
 * for skipped calls, and returns an aborted outcome. Scheduler failure drains
 * dispatches and rejects for the owning step to record recovery results.
 */
async function runGroup(
  host: AgentLoopHost,
  session: AgentSession,
  turn: number,
  step: number,
  group: readonly PlannedCall[],
  mode: "parallel" | "exclusive",
  signal: AbortSignal | undefined,
  maxParallelToolCalls: number,
): Promise<GroupOutcome> {
  const slots: (Slot | undefined)[] = group.map(() => undefined);
  // Started slots retain their `tool/call` seq so the result can cite it.
  const callSeqs: Array<SessionSeq | undefined> = group.map(() => undefined);
  const results: ExecutedToolResult[] = [];
  let nextToStart = 0;
  let committed = 0;
  let started = 0;
  let aborted = signal?.aborted ?? false;
  let schedulerFailure: { error: unknown } | undefined;

  const throwSchedulerFailure = (): void => {
    if (schedulerFailure !== undefined) throw schedulerFailure.error;
  };

  // `committed` advances only across contiguous model-order slots.
  const commitReady = (): void => {
    while (committed < group.length) {
      const slot = slots[committed];
      if (slot === undefined) break;
      const call = group[committed]!;
      appendToolResult(
        session,
        turn,
        step,
        call.spec,
        slot.raw,
        callSeqs[committed]!,
      );
      results.push({
        callId: call.spec.id,
        turnId: call.spec.turnId,
        name: call.spec.name,
        success: slot.raw.success,
        output: slot.raw.data,
        error: slot.raw.error,
        ...(slot.raw.additionalContexts !== undefined
          ? { additionalContexts: slot.raw.additionalContexts }
          : {}),
        ...(slot.raw.concludesTurn === true ? { concludesTurn: true } : {}),
      });
      committed++;
    }
  };

  const inFlight = new Map<number, Promise<number>>();

  const startCall = async (index: number): Promise<void> => {
    const call = group[index]!;
    callSeqs[index] = appendToolCall(session, turn, step, call.spec);
    started++;
    const promise = host
      .executeTool(call.spec.name, {
        callId: call.exec.callId,
        args: call.exec.arguments,
        signal: call.exec.signal,
        ...(call.exec.scope !== undefined ? { scope: call.exec.scope } : {}),
        ...(call.exec.agent !== undefined ? { agent: call.exec.agent } : {}),
      })
      .then(
        (raw) => {
          slots[index] = { raw };
          return index;
        },
        (error: unknown) => {
          schedulerFailure ??= { error };
          return index;
        },
      );
    inFlight.set(index, promise);
  };

  const fillPool = async (): Promise<void> => {
    while (
      !aborted &&
      nextToStart < group.length &&
      inFlight.size < maxParallelToolCalls
    ) {
      // Re-read later modes after ordered commits so registry changes can
      // create a barrier.
      const nextCall = group[nextToStart]!;
      if (
        nextToStart > 0 &&
        mode === "parallel" &&
        executionModeOf(host, nextCall.exec) !== "parallel"
      ) {
        break;
      }
      await startCall(nextToStart);
      nextToStart++;
      throwSchedulerFailure();
      commitReady();
      throwSchedulerFailure();
      // Abort may arrive while pre-execute awaits.
      if (signal?.aborted) aborted = true;
    }
  };

  // Ordered start may await; only dispatch/body overlaps. A scheduler failure
  // stops new dispatches and reaches the turn boundary after every
  // already-started dispatch settles.
  try {
    await fillPool();
    while (inFlight.size > 0) {
      const settledIndex = await Promise.race(inFlight.values());
      inFlight.delete(settledIndex);
      throwSchedulerFailure();
      commitReady();
      throwSchedulerFailure();
      // Abort may arrive while a tool or ordered commit awaits.
      if (signal?.aborted) aborted = true;
      await fillPool();
    }
  } catch (error: unknown) {
    schedulerFailure ??= { error };
    await Promise.allSettled(inFlight.values());
    throw schedulerFailure.error;
  }

  if (aborted) {
    // Started calls and their results settle first; every remaining model call
    // then receives an ordered synthetic result before the turn aborts.
    for (const call of group.slice(started)) {
      results.push(appendSkippedToolCall(session, turn, step, call.spec));
    }
    return { consumed: group.length, aborted: true, results };
  }

  if (committed !== started) {
    throw new Error("tool-call scheduler: uncommitted settled calls");
  }
  return { consumed: started, aborted: false, results };
}

/** Append the durable call/result pair for a model call skipped after cancellation. */
function appendSkippedToolCall(
  session: AgentSession,
  turn: number,
  step: number,
  spec: ToolCallSpec,
): ExecutedToolResult {
  const callSeq = appendToolCall(session, turn, step, spec);
  const message: ToolResultMessage = {
    role: "tool",
    toolCallId: spec.id,
    content: "Error: tool call aborted before dispatch",
    isError: true,
  };
  session.append(
    "tool/result",
    {
      turn,
      step,
      message,
      error: {
        name: "AbortError",
        code: TOOL_ABORTED_BEFORE_DISPATCH,
      },
    },
    { surfaceOp: "append", sourceEventSeqs: [callSeq] },
  );
  return {
    callId: spec.id,
    turnId: spec.turnId,
    name: spec.name,
    success: false,
    output: null,
    error: "Operation aborted",
  };
}

/** Append a started call and return the event seq that its result must cite. */
function appendToolCall(
  session: AgentSession,
  turn: number,
  step: number,
  spec: ToolCallSpec,
): SessionSeq {
  const event = session.append("tool/call", {
    turn,
    step,
    callId: spec.id,
    name: spec.name,
    arguments: spec.arguments,
  });
  return event.seq;
}

/** Append a model-ordered result linked to its call event. */
function appendToolResult(
  session: AgentSession,
  turn: number,
  step: number,
  spec: ToolCallSpec,
  raw: ExecuteToolOutput,
  callSeq: SessionSeq,
): void {
  // Most tool output is text. Image-bearing results must survive as blocks so
  // the model driver can forward the pixels; a JSON string would drop them.
  const hasImageBlocks =
    raw.success && raw.content.some((block) => block.type === "image");

  const message: ToolResultMessage = {
    role: "tool",
    toolCallId: spec.id,
    content: raw.success
      ? hasImageBlocks
        ? raw.content
        : typeof raw.data === "string"
          ? raw.data
          : JSON.stringify(raw.data ?? "Tool execution succeeded")
      : (raw.error ?? "Tool execution failed"),
    isError: !raw.success,
  };
  session.append(
    "tool/result",
    {
      turn,
      step,
      message,
      ...(raw.success
        ? {}
        : {
            error: {
              name: spec.name,
              code: "EXECUTION_FAILURE",
              reason: raw.error,
            },
          }),
      meta: raw.data,
    },
    { surfaceOp: "append", sourceEventSeqs: [callSeq] },
  );
}
