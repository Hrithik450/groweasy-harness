import test from "node:test";
import assert from "node:assert/strict";

import type { SessionEvent } from "@openai-harness/session";
import { SessionSeq } from "@openai-harness/session";
import { MessageId } from "@openai-harness/llm";
import {
  pendingPrompts,
  withAssistantStream,
  withOptimisticPrompts,
} from "../src/derive/live";
import { foldEventsToTurns } from "../src/derive/turns";

const sessionId = "session-1";

function userEvent(seq: number, text: string, rpcId?: string): SessionEvent {
  return {
    type: "user/message",
    seq: SessionSeq(seq),
    time: 1_000,
    data: {
      id: MessageId(`user-${seq}`),
      role: "user",
      content: [{ type: "text", text }],
      ...(rpcId === undefined ? {} : { source: { kind: "user", rpcId } }),
    },
  };
}

test("pendingPrompts drops prompts whose durable rpc id committed", () => {
  const prompts = [
    { requestId: "r1", text: "first", createdAt: "2026-01-01T00:00:00.000Z" },
    { requestId: "r2", text: "second", createdAt: "2026-01-01T00:00:01.000Z" },
  ];

  assert.deepEqual(
    pendingPrompts([userEvent(0, "first", "r1")], prompts).map(
      (prompt) => prompt.requestId,
    ),
    ["r2"],
  );
  assert.deepEqual(pendingPrompts([], prompts), prompts);
  assert.deepEqual(pendingPrompts([userEvent(0, "x")], []), []);
});

test("withOptimisticPrompts appends one running turn carrying every prompt", () => {
  const turns = withOptimisticPrompts(
    [],
    [
      { requestId: "r1", text: "one", createdAt: "2026-01-01T00:00:00.000Z" },
      { requestId: "r2", text: "two", createdAt: "2026-01-01T00:00:01.000Z" },
    ],
    sessionId,
  );

  assert.equal(turns.length, 1);
  assert.equal(turns[0]!.turn, 1);
  assert.equal(turns[0]!.status, "running");
  assert.deepEqual(
    turns[0]!.inputs.map((item) => item.id),
    [MessageId("optimistic:r1"), MessageId("optimistic:r2")],
  );
  assert.equal(turns[0]!.inputs[0]!.content[0]!.type, "text");
});

test("withAssistantStream appends live text to the open turn", () => {
  const durable = foldEventsToTurns(
    [
      {
        type: "turn/start",
        seq: SessionSeq(0),
        time: 1_000,
        data: { turn: 1 },
      },
    ],
    { sessionId },
  );

  const turns = withAssistantStream(durable, {
    attemptId: "attempt-1",
    turn: 1,
    step: 1,
    text: "streaming now",
  });

  assert.equal(turns.length, 1);
  assert.equal(turns[0]!.finalAnswer?.id, MessageId("attempt-1"));
  assert.deepEqual(turns[0]!.finalAnswer?.content, [
    { type: "text", text: "streaming now" },
  ]);
});

test("withAssistantStream creates the turn when the log has not opened it", () => {
  const turns = withAssistantStream([], {
    attemptId: "attempt-2",
    turn: 3,
    step: 1,
    text: "late",
  });

  assert.equal(turns.length, 1);
  assert.equal(turns[0]!.turn, 3);
  assert.equal(turns[0]!.status, "running");
});
