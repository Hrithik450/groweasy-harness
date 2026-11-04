import { test } from "node:test";
import assert from "node:assert/strict";

import type { ModelDriver, ModelFrame } from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";
import type { Agent, AssistantStreamFrame } from "../src/agent-types";
import type { AgentLoopHost, ExecuteToolOutput } from "../src/host";
import { runStep } from "../src/driver";
import { RecordingSession, testHeader } from "./session-fixture";

/** Stream one text delta, then finish. */
function textDriver(text: string): ModelDriver {
  return {
    async *stream(): AsyncGenerator<ModelFrame> {
      yield { type: "text-delta", delta: text };
      yield { type: "done", finishReason: "stop" };
    },
  };
}

/** Emit a text preamble, then one tool call, then finish the stream. */
function textThenToolCallDriver(
  text: string,
  call: { id: string; name: string; arguments: string },
): ModelDriver {
  return {
    async *stream(): AsyncGenerator<ModelFrame> {
      yield { type: "text-delta", delta: text };
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
 * Host standing in for the application runtime. Driver selection, derivation,
 * and the registry are host concerns and are not under test here.
 */
function testHost(
  options: {
    guardAnswer?: AgentLoopHost["guardAnswer"];
    toolResult?: ExecuteToolOutput;
  } = {},
): AgentLoopHost {
  return {
    resolveDriver() {
      throw new Error("driver should be supplied explicitly");
    },
    provider: () => "test-provider",
    model: () => "test-model",
    deriveMessages: () => [],
    executionMode: () => ({ kind: "exclusive" }),
    executeTool: async () =>
      options.toolResult ?? {
        success: true,
        content: [{ type: "text", text: "ok" }],
      },
    ...(options.guardAnswer ? { guardAnswer: options.guardAnswer } : {}),
  };
}

/** The text block of the persisted assistant message, if any. */
function persistedText(session: RecordingSession): string | undefined {
  const assistant = session.events.find(
    (event): event is Extract<SessionEvent, { type: "assistant/message" }> =>
      event.type === "assistant/message",
  );
  const block = assistant?.data.message.content.find(
    (content) => content.type === "text",
  );
  return block?.type === "text" ? block.text : undefined;
}

/** Reconstruct the raw model text from the collected live stream frames. */
function streamedText(frames: readonly AssistantStreamFrame[]): string {
  return frames
    .flatMap((frame) =>
      frame.type === "chunk" && frame.delta !== undefined ? [frame.delta] : [],
    )
    .join("");
}

test("guardAnswer rewrites the persisted answer but not the stream", async () => {
  const raw = "the raw model answer";
  const redacted = "[redacted]";
  const session = new RecordingSession(testHeader("answer-guard-rewrite"));
  const frames: AssistantStreamFrame[] = [];

  await runStep({
    agent: { id: session.id, session } as unknown as Agent,
    turn: 1,
    step: 1,
    driver: textDriver(raw),
    host: testHost({
      guardAnswer: ({ text, turn, step, session: view }) => {
        assert.equal(text, raw);
        assert.equal(turn, 1);
        assert.equal(step, 1);
        assert.equal(view, session);
        return redacted;
      },
    }),
    onStreamFrame: (frame) => frames.push(frame),
    queueNextStep: () => {},
  });

  assert.equal(persistedText(session), redacted);
  assert.equal(streamedText(frames), raw);
});

test("guardAnswer returning undefined keeps the model's own text", async () => {
  const raw = "the model's own answer";
  const session = new RecordingSession(testHeader("answer-guard-undefined"));

  await runStep({
    agent: { id: session.id, session } as unknown as Agent,
    turn: 1,
    step: 1,
    driver: textDriver(raw),
    host: testHost({ guardAnswer: () => undefined }),
    queueNextStep: () => {},
  });

  assert.equal(persistedText(session), raw);
});

test("guardAnswer rewrites the preamble on a tool-call step", async () => {
  const raw = "checking that now";
  const redacted = "[redacted preamble]";
  const session = new RecordingSession(testHeader("answer-guard-tool-step"));
  const frames: AssistantStreamFrame[] = [];

  const outcome = await runStep({
    agent: { id: session.id, session } as unknown as Agent,
    turn: 1,
    step: 1,
    driver: textThenToolCallDriver(raw, {
      id: "call_guard",
      name: "test_guard_tool",
      arguments: "{}",
    }),
    host: testHost({
      guardAnswer: () => redacted,
      toolResult: {
        success: true,
        content: [{ type: "text", text: "ok" }],
      },
    }),
    onStreamFrame: (frame) => frames.push(frame),
    queueNextStep: () => {},
  });

  assert.equal(outcome.kind, "requires_action");
  assert.equal(persistedText(session), redacted);
  assert.equal(streamedText(frames), raw);

  const assistant = session.events.find(
    (event): event is Extract<SessionEvent, { type: "assistant/message" }> =>
      event.type === "assistant/message",
  );
  assert.ok(assistant, "assistant message should be committed");
  assert.ok(
    assistant.data.message.content.some(
      (block) => block.type === "tool-call" && block.id === "call_guard",
    ),
    "the tool call should still be persisted",
  );
});
