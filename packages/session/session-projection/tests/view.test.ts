import test from "node:test";
import assert from "node:assert/strict";

import type { SessionEvent, SessionView } from "@openai-harness/session";
import { SessionSeq } from "@openai-harness/session";
import { MessageId } from "@openai-harness/llm";
import {
  applySessionViewEvents,
  assembleSessionView,
  foldSessionViewEvents,
} from "../src/view";

const view: SessionView = {
  id: "session-1",
  userId: "user-1",
  title: "Old title",
  slug: null,
  hidden: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function event<E extends SessionEvent["type"]>(
  type: E,
  seq: number,
  time: number,
  data: Extract<SessionEvent, { type: E }>["data"],
): SessionEvent {
  return { type, seq: SessionSeq(seq), time, data } as SessionEvent;
}

const events: SessionEvent[] = [
  event("session/title", 0, 1_000, { title: "New title" }),
  event("detailBar/update", 1, 2_000, {
    detailBar: {
      type: "adManager",
      data: { alerts: ["one"] },
    },
  }),
  event("turn/start", 2, 3_000, { turn: 1 }),
  event("user/message", 3, 3_000, {
    id: MessageId("user-1"),
    role: "user",
    content: [{ type: "text", text: "hello" }],
    source: { kind: "user" },
  }),
  event("assistant/message", 4, 3_000, {
    turn: 1,
    step: 1,
    message: {
      id: MessageId("assistant-1"),
      role: "assistant",
      content: [{ type: "text", text: "hi there" }],
    },
  }),
  event("turn/end", 5, 4_000, { turn: 1, reason: { kind: "completed" } }),
];

test("foldSessionViewEvents folds the title", () => {
  const folded = foldSessionViewEvents(events, view);

  assert.equal(folded.title, "New title");
  assert.equal(folded.updatedAt, new Date(4_000).toISOString());
});

test("applySessionViewEvents preserves identity fields and returns a new view", () => {
  const applied = applySessionViewEvents(view, events);

  assert.notEqual(applied, view);
  assert.equal(applied.id, view.id);
  assert.equal(applied.userId, view.userId);
  assert.equal(applied.title, "New title");
  assert.equal(applied.updatedAt, new Date(4_000).toISOString());
});

test("an empty log leaves the wire view unchanged", () => {
  assert.deepEqual(applySessionViewEvents(view, []), view);
});

test("assembleSessionView adds optimistic and assistant overlays", () => {
  const assembled = assembleSessionView(view, events, {
    prompts: [
      {
        requestId: "request-1",
        text: "next prompt",
        createdAt: "2026-01-01T00:00:05.000Z",
      },
    ],
    assistantStream: {
      attemptId: "attempt-1",
      turn: 2,
      step: 1,
      text: "streaming answer",
    },
  });

  assert.equal(assembled.session.title, "New title");
  assert.equal(assembled.turns.length, 2);

  const optimistic = assembled.turns[1]!;
  assert.equal(optimistic.turn, 2);
  assert.equal(optimistic.status, "running");
  assert.equal(optimistic.inputs[0]!.content[0]!.type, "text");
  if (optimistic.inputs[0]!.content[0]!.type === "text") {
    assert.equal(optimistic.inputs[0]!.content[0]!.text, "next prompt");
  }
  assert.deepEqual(optimistic.finalAnswer?.content, [
    { type: "text", text: "streaming answer" },
  ]);
});
