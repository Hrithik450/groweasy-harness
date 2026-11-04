import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MessageId,
  type ModelDriver,
  type ModelFrame,
  type UserMessage,
} from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";
import type { Agent } from "../src/agent-types";
import type { AgentLoopHost, ExecuteToolOutput } from "../src/host";
import { runStep } from "../src/driver";
import { RecordingSession, testHeader } from "./session-fixture";

/** Emit exactly one tool call, then finish the stream. */
function toolCallDriver(
  call: { id: string; name: string; arguments: string },
): ModelDriver {
  return {
    async *stream(): AsyncGenerator<ModelFrame> {
      yield {
        type: "tool-call-delta",
        index: 0,
        id: call.id,
        name: call.name,
        argumentsDelta: call.arguments,
      };
      yield { type: "done", finishReason: "tool_calls" };
    },
  };
}

/**
 * Host whose tool service returns one prepared output. Driver selection,
 * derivation, and the registry stay host concerns and are not under test here.
 */
function hostWithToolResult(result: ExecuteToolOutput): AgentLoopHost {
  return {
    resolveDriver() {
      throw new Error("driver should be supplied explicitly");
    },
    provider: () => "test-provider",
    model: () => "test-model",
    deriveMessages: () => [],
    executionMode: () => ({ kind: "exclusive" }),
    executeTool: async () => result,
  };
}

test("runStep defers context durably and reports a concluded turn", async () => {
  const deferred: UserMessage = {
    id: MessageId("deferred-context"),
    role: "user",
    source: { kind: "system" },
    content: [{ type: "text", text: "deferred context" }],
  };

  const toolName = "test_conclude_turn";
  const session = new RecordingSession(testHeader("driver-deferred-context"));
  const queued: UserMessage[] = [];

  const outcome = await runStep({
    agent: { id: session.id, session } as unknown as Agent,
    turn: 1,
    step: 1,
    driver: toolCallDriver({
      id: "call_conclude",
      name: toolName,
      arguments: "{}",
    }),
    host: hostWithToolResult({
      success: true,
      data: { ok: true },
      content: [{ type: "text", text: "ok" }],
      additionalContexts: [deferred],
      concludesTurn: true,
    }),
    queueNextStep: (context) => queued.push(context),
  });

  assert.deepEqual(outcome, {
    kind: "requires_action",
    toolCallsCount: 1,
    concludesTurn: true,
  });

  const deferredEvent = session.events.find(
    (event): event is Extract<SessionEvent, { type: "user/message" }> =>
      event.type === "user/message" && event.data.id === deferred.id,
  );
  assert.ok(deferredEvent, "deferred context should be appended durably");
  assert.deepEqual(deferredEvent.data, deferred);

  // It follows the corresponding tool result, so the next step reads it.
  const resultIndex = session.events.findIndex(
    (event) => event.type === "tool/result",
  );
  assert.ok(resultIndex >= 0, "tool result should be committed");
  assert.ok(
    session.events.indexOf(deferredEvent) > resultIndex,
    "deferred context should follow its tool result",
  );

  const assistant = session.events.find(
    (event): event is Extract<SessionEvent, { type: "assistant/message" }> =>
      event.type === "assistant/message",
  );
  assert.ok(assistant, "assistant message should be committed");
  assert.ok(
    assistant.data.message.content.some(
      (block) =>
        block.type === "tool-call" &&
        block.id === "call_conclude" &&
        block.name === toolName &&
        block.arguments === "{}",
    ),
    "assistant message should contain the requested tool call",
  );

  // The hidden tool-result message stays queued for the next step.
  assert.equal(queued.length, 1);
  assert.equal(queued[0]!.source?.kind, "tool-result");
});

test("runStep settles on abort even when the provider stream never yields", async () => {
  const session = new RecordingSession(testHeader("driver-abort-stalled"));

  // A provider that accepts the request and then sends nothing: the stream
  // stays suspended forever, exactly like a stalled HTTP response.
  const stalledDriver: ModelDriver = {
    async *stream(): AsyncGenerator<ModelFrame> {
      await new Promise<void>(() => {});
      yield { type: "done", finishReason: "stop" };
    },
  };

  const controller = new AbortController();
  setTimeout(() => controller.abort({ kind: "user" }), 10);

  await assert.rejects(
    runStep({
      agent: { id: session.id, session } as unknown as Agent,
      turn: 1,
      step: 1,
      driver: stalledDriver,
      signal: controller.signal,
      host: hostWithToolResult({ success: true, content: [] }),
      queueNextStep: () => {},
    }),
    (error: unknown) => {
      assert.deepEqual(error, { kind: "user" });
      return true;
    },
  );
});
