import test from "node:test";
import assert from "node:assert/strict";

import type { SessionEvent } from "@openai-harness/session";
import { SessionId, SessionSeq } from "@openai-harness/session";
import { MessageId } from "@openai-harness/llm";
import { foldEventsToTurns } from "../src/derive/turns";

const sessionId = "s1";

function event<E extends SessionEvent["type"]>(
  type: E,
  seq: number,
  data: Extract<SessionEvent, { type: E }>["data"],
): SessionEvent {
  return {
    type,
    seq: SessionSeq(seq),
    time: 0,
    data,
  } as SessionEvent;
}

test("tool-emitted UI blocks survive the finalized assistant answer", () => {
  const spec = {
    root: "root",
    elements: { root: { type: "Text", props: { text: "hello" } } },
  };

  const events: SessionEvent[] = [
    event("turn/start", 1, { turn: 1 }),
    event("step/start", 2, { turn: 1, step: 1 }),
    event("ui/block", 3, { id: "block-1", spec } as never),
    event("assistant/message", 4, {
      turn: 1,
      step: 1,
      message: {
        id: MessageId("a1"),
        role: "assistant",
        content: [{ type: "text", text: "Here is your block" }],
      },
    }),
    event("step/end", 5, { turn: 1, step: 1 }),
    event("turn/end", 6, { turn: 1, reason: { kind: "completed" } } as never),
  ];

  const turns = foldEventsToTurns(events, { sessionId: SessionId(sessionId) });
  assert.equal(turns.length, 1);

  const content = turns[0]!.finalAnswer?.content ?? [];
  assert.deepEqual(
    content.map((block) => block.type),
    ["block", "text"],
  );

  const block = content[0];
  assert.equal(block?.type, "block");
  if (block?.type === "block") assert.equal(block.id, "block-1");
});

test("a submitted block replaces its prior spec in place", () => {
  const spec = {
    root: "root",
    elements: { root: { type: "Choice", props: {} } },
  };
  const submittedSpec = {
    ...spec,
    submitted: true,
    values: { demoTopic: "Campaign Performance" },
  };

  const events: SessionEvent[] = [
    event("turn/start", 1, { turn: 1 }),
    event("step/start", 2, { turn: 1, step: 1 }),
    event("ui/block", 3, { id: "block-1", spec } as never),
    event("step/end", 4, { turn: 1, step: 1 }),
    event("turn/end", 5, { turn: 1, reason: { kind: "completed" } } as never),
    // Interaction update appended after the turn, before the next one starts.
    event("ui/block", 6, { id: "block-1", spec: submittedSpec } as never),
    event("turn/start", 7, { turn: 2 }),
    event("turn/end", 8, { turn: 2, reason: { kind: "completed" } } as never),
  ];

  const turns = foldEventsToTurns(events, { sessionId: SessionId(sessionId) });
  assert.equal(turns.length, 2);

  const content = turns[0]!.finalAnswer?.content ?? [];
  assert.equal(content.length, 1);
  const block = content[0];
  assert.equal(block?.type, "block");
  if (block?.type === "block") {
    assert.deepEqual(
      (block.spec as { values?: Record<string, unknown> }).values,
      { demoTopic: "Campaign Performance" },
    );
    assert.equal((block.spec as { submitted?: boolean }).submitted, true);
  }
});

test("a turn repaired as interrupted reads as stopped, not failed", () => {
  const events: SessionEvent[] = [
    event("turn/start", 1, { turn: 1 }),
    event("step/start", 2, { turn: 1, step: 1 }),
    event("step/end", 3, { turn: 1, step: 1 }),
    event("turn/end", 4, {
      turn: 1,
      reason: { kind: "interrupted" },
    } as never),
  ];

  const turns = foldEventsToTurns(events, { sessionId: SessionId(sessionId) });
  assert.equal(turns[0]!.status, "aborted");
  assert.equal(turns[0]!.error, undefined);
});
