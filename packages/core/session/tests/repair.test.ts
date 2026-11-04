import test from "node:test";
import assert from "node:assert/strict";

import { SessionSeq } from "../src/types";
import type { SessionEvent } from "../src/events";
import {
  TOOL_NOT_STARTED,
  TOOL_OUTCOME_UNKNOWN,
  interruptedTurnClosers,
} from "../src/repair";

/** Moved from the agent-loop test suite: this covers session repair, not the loop. */
test("interruptedTurnClosers closes an open turn conservatively", () => {
  const time = Date.parse("2026-02-02T00:00:00.000Z");

  function at(seq: number, type: string, data: unknown): SessionEvent {
    return {
      seq: SessionSeq(seq),
      type,
      time,
      data,
    } as unknown as SessionEvent;
  }

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
          { type: "tool-call", id: "never", name: "search", arguments: "{}" },
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

  const closers = interruptedTurnClosers(events);

  assert.deepEqual(
    closers.map((event) => event.type),
    ["tool/result", "tool/result", "step/end", "turn/end"],
  );
  assert.deepEqual(
    closers.map((event) => Number(event.seq)),
    [4, 5, 6, 7],
  );
  assert.ok(closers.every((event) => event.time === time));

  const results = closers.filter((event) => event.type === "tool/result");
  assert.equal(results.length, 2);

  const startedResult = results[0]!;
  assert.ok(startedResult.type === "tool/result");
  assert.equal(startedResult.data.message.isError, true);
  assert.equal(startedResult.data.message.toolCallId, "started");
  assert.equal(startedResult.data.error?.code, TOOL_OUTCOME_UNKNOWN);

  const notStartedResult = results[1]!;
  assert.ok(notStartedResult.type === "tool/result");
  assert.equal(notStartedResult.data.message.toolCallId, "never");
  assert.equal(notStartedResult.data.error?.code, TOOL_NOT_STARTED);

  const turnEnd = closers.at(-1);
  assert.ok(turnEnd?.type === "turn/end");
  assert.deepEqual(turnEnd.data.reason, { kind: "interrupted" });

  // A balanced log needs no closers.
  const balanced = [
    ...events,
    at(4, "step/end", { turn: 1, step: 1 }),
    at(5, "turn/end", { turn: 1, reason: { kind: "completed" } }),
  ];
  assert.deepEqual(interruptedTurnClosers(balanced), []);
});
