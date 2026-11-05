import assert from "node:assert/strict";
import test from "node:test";

import { MessageId } from "@openai-harness/llm";
import { SessionSeq } from "@openai-harness/session";
import type { SessionEvent } from "@openai-harness/session";

import { selectCompactableRange } from "../src/region";

function ev(type: string, data: unknown, seq: number): SessionEvent {
  return {
    seq: SessionSeq(seq),
    type,
    time: Date.parse("2026-01-01T00:00:00.000Z"),
    data,
  } as unknown as SessionEvent;
}

function userMessage(text: string): unknown {
  return {
    id: MessageId(`user-${text.length}-${text.slice(0, 4)}`),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  };
}

function assistantToolCall(): unknown {
  return {
    turn: 1,
    step: 1,
    message: {
      id: MessageId("assistant-call"),
      role: "assistant",
      content: [
        { type: "tool-call", id: "call-1", name: "search", arguments: "{}" },
      ],
    },
  };
}

function toolResult(): unknown {
  return {
    turn: 1,
    step: 1,
    message: {
      role: "tool",
      toolCallId: "call-1",
      content: [{ type: "text", text: "b".repeat(400) }],
    },
  };
}

test("moves the cut before an assistant tool call to keep pairing", () => {
  const events = [
    ev("user/message", userMessage("a".repeat(400)), 0),
    ev("assistant/message", assistantToolCall(), 1),
    ev("tool/result", toolResult(), 2),
    ev("user/message", userMessage("c".repeat(400)), 3),
  ];

  const range = selectCompactableRange(events, 150);
  assert.deepEqual(range, {
    startSeq: SessionSeq(0),
    endSeq: SessionSeq(0),
    shadowedSeqs: [SessionSeq(0)],
  });
});

test("keeps an assistant call and its result together", () => {
  const events = [
    ev("user/message", userMessage("a".repeat(400)), 0),
    ev("assistant/message", assistantToolCall(), 1),
    ev("tool/result", toolResult(), 2),
    ev("user/message", userMessage("c".repeat(400)), 3),
  ];

  const range = selectCompactableRange(events, 50);
  assert.deepEqual(range, {
    startSeq: SessionSeq(0),
    endSeq: SessionSeq(2),
    shadowedSeqs: [SessionSeq(0), SessionSeq(1), SessionSeq(2)],
  });
});

test("never compacts the leading system message", () => {
  const events = [
    ev("system/message", { role: "system", content: "system instructions" }, 0),
    ev("user/message", userMessage("a".repeat(400)), 1),
    ev("user/message", userMessage("c".repeat(400)), 2),
  ];

  const range = selectCompactableRange(events, 5);
  assert.deepEqual(range, {
    startSeq: SessionSeq(1),
    endSeq: SessionSeq(1),
    shadowedSeqs: [SessionSeq(1)],
  });
});

test("returns null when no old span exists", () => {
  const events = [
    ev("user/message", userMessage("a".repeat(400)), 0),
  ];
  assert.equal(selectCompactableRange(events, 1), null);
});
