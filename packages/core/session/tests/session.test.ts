import assert from "node:assert/strict";
import { test } from "node:test";

import { TOOL_NOT_STARTED, TOOL_OUTCOME_UNKNOWN } from "../src/repair";
import {
  Session,
  configureSessionPersistence,
  resetSessionPersistence,
} from "../src/session";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionSeq,
  type SessionHeader,
} from "../src/types";
import type { SessionEvent } from "../src/events";

const sessionId = SessionId("session-load-test");

function header(): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt: 0,
  };
}

/** Build one persisted event; data is unvalidated test input. */
function at(seq: number, type: string, data: unknown): SessionEvent {
  return {
    seq: SessionSeq(seq),
    type,
    time: Date.parse("2026-02-02T00:00:00.000Z"),
    data,
  } as unknown as SessionEvent;
}

test("load leaves a balanced log untouched", async (t) => {
  const events: SessionEvent[] = [
    at(0, "turn/start", { turn: 1 }),
    at(1, "step/start", { turn: 1, step: 1 }),
    at(2, "step/end", { turn: 1, step: 1 }),
    at(3, "turn/end", { turn: 1, reason: { kind: "completed" } }),
  ];
  let appendCount = 0;

  t.after(() => resetSessionPersistence());
  configureSessionPersistence({
    getEvents: async () => events,
    appendBatch: async () => {
      appendCount += 1;
    },
  });

  const session = await Session.load(header());

  assert.equal(appendCount, 0);
  assert.equal(session.events.length, events.length);
  assert.deepEqual(session.events, events);
});

test("load closes a started-but-unresulted tool call with TOOL_OUTCOME_UNKNOWN", async (t) => {
  const events: SessionEvent[] = [
    at(0, "turn/start", { turn: 1 }),
    at(1, "step/start", { turn: 1, step: 1 }),
    at(2, "assistant/message", {
      turn: 1,
      step: 1,
      message: {
        role: "assistant",
        content: [
          { type: "tool-call", id: "started", name: "search", arguments: "{}" },
        ],
      },
    }),
    at(3, "tool/call", {
      turn: 1,
      step: 1,
      callId: "started",
      name: "search",
      arguments: "{}",
    }),
  ];
  let appended: readonly SessionEvent[] = [];

  t.after(() => resetSessionPersistence());
  configureSessionPersistence({
    getEvents: async () => events,
    appendBatch: async (
      _id: SessionId | string,
      batch: readonly SessionEvent[],
    ) => {
      appended = batch;
    },
  });

  const session = await Session.load(header());

  assert.deepEqual(
    appended.map((event) => event.type),
    ["tool/result", "step/end", "turn/end"],
  );

  const result = appended[0]!;
  assert.ok(result.type === "tool/result");
  assert.equal(result.data.message.isError, true);
  assert.equal(result.data.error?.code, TOOL_OUTCOME_UNKNOWN);

  const turnEnd = appended.at(-1)!;
  assert.ok(turnEnd.type === "turn/end");
  assert.deepEqual(turnEnd.data.reason, { kind: "interrupted" });

  assert.equal(session.events.length, events.length + appended.length);
  assert.deepEqual(session.events.slice(events.length), appended);
});

test("load closes a tool call that never reached tool/call with TOOL_NOT_STARTED", async (t) => {
  const events: SessionEvent[] = [
    at(0, "turn/start", { turn: 1 }),
    at(1, "step/start", { turn: 1, step: 1 }),
    at(2, "assistant/message", {
      turn: 1,
      step: 1,
      message: {
        role: "assistant",
        content: [
          { type: "tool-call", id: "never", name: "search", arguments: "{}" },
        ],
      },
    }),
  ];
  let appended: readonly SessionEvent[] = [];

  t.after(() => resetSessionPersistence());
  configureSessionPersistence({
    getEvents: async () => events,
    appendBatch: async (
      _id: SessionId | string,
      batch: readonly SessionEvent[],
    ) => {
      appended = batch;
    },
  });

  const session = await Session.load(header());

  assert.deepEqual(
    appended.map((event) => event.type),
    ["tool/result", "step/end", "turn/end"],
  );

  const result = appended[0]!;
  assert.ok(result.type === "tool/result");
  assert.equal(result.data.message.isError, true);
  assert.equal(result.data.error?.code, TOOL_NOT_STARTED);

  const turnEnd = appended.at(-1)!;
  assert.ok(turnEnd.type === "turn/end");
  assert.deepEqual(turnEnd.data.reason, { kind: "interrupted" });

  assert.equal(session.events.length, events.length + appended.length);
  assert.deepEqual(session.events.slice(events.length), appended);
});
