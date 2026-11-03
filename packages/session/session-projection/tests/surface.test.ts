import test from "node:test";
import assert from "node:assert/strict";

import type { SessionEvent } from "@openai-harness/session";
import { SessionSeq } from "@openai-harness/session";
import { MessageId } from "@openai-harness/llm";
import { classifyUserSource, foldSurface } from "../src/derive/surface";
import { foldSurfaceToTurns } from "../src/derive/turns";

function userEvent(
  seq: number,
  source: { kind: string; [key: string]: unknown },
): SessionEvent {
  return {
    type: "user/message",
    seq: SessionSeq(seq),
    time: Date.parse("2026-11-12T00:00:00.000Z"),
    data: {
      id: MessageId(`message-${seq}`),
      role: "user",
      content: [{ type: "text", text: `message ${seq}` }],
      source,
    },
  } as SessionEvent;
}

test("classifyUserSource separates human, trigger, and context inputs", () => {
  assert.equal(classifyUserSource(undefined), "message");
  assert.equal(classifyUserSource({ kind: "user" }), "message");
  assert.equal(classifyUserSource({ kind: "cron" }), "trigger");
  assert.equal(classifyUserSource({ kind: "agent" }), "trigger");
  assert.equal(classifyUserSource({ kind: "skill-catalog" }), "context");
  assert.equal(classifyUserSource({ kind: "skill-invocation" }), "context");
  assert.equal(classifyUserSource({ kind: "compact-checkpoint" }), "context");
  assert.equal(classifyUserSource({ kind: "tool-result" }), "context");
  assert.equal(classifyUserSource({ kind: "ui-action" }), "context");
});

test("context items stay in the surface but never become turn inputs", () => {
  const events = [
    userEvent(1, { kind: "user" }),
    userEvent(2, { kind: "skill-catalog", form: "catalog" }),
    userEvent(3, { kind: "cron", cronJobId: "job-1" }),
  ];

  const surface = foldSurface(events, { sessionId: "session-1" });
  assert.deepEqual(
    surface.map((item) => item.kind),
    ["message", "context", "trigger"],
  );

  const turns = foldSurfaceToTurns(surface, "session-1");
  assert.equal(turns.length, 2);
  assert.deepEqual(
    turns.map((turn) => turn.inputs.map((item) => item.id)),
    [[MessageId("message-1")], [MessageId("message-3")]],
  );
});

test("interactive submissions stay hidden while their block replaces in place", () => {
  const block = (seq: number, choice: string): SessionEvent =>
    ({
      type: "ui/block",
      seq: SessionSeq(seq),
      time: 0,
      data: { id: "block-1", spec: { root: "Form", values: { choice } } },
    }) as unknown as SessionEvent;

  const events = [
    block(1, "a"),
    userEvent(2, { kind: "ui-action", blockId: "block-1" }),
    block(3, "b"),
  ];

  const surface = foldSurface(events, { sessionId: "session-1" });

  assert.deepEqual(
    surface.map((item) => [item.id, item.seq, item.kind, item.hidden]),
    [
      [MessageId("block-1"), SessionSeq(3), "message", false],
      [MessageId("message-2"), SessionSeq(2), "context", true],
    ],
  );
});
