import test from "node:test";
import assert from "node:assert/strict";

import { SessionSeq } from "@openai-harness/session";
import type { SessionEvent } from "@openai-harness/session";

import { pageSessionEvents } from "../src/event-page";

function message(seq: number): SessionEvent {
  return {
    type: "user/message",
    seq: SessionSeq(seq),
    time: 0,
    data: {
      id: `m${seq}`,
      role: "user",
      content: [{ type: "text", text: `m${seq}` }],
    },
  } as SessionEvent;
}

function turnStart(seq: number, turn: number): SessionEvent {
  return {
    type: "turn/start",
    seq: SessionSeq(seq),
    time: 0,
    data: { turn },
  } as SessionEvent;
}

function pairs(page: { records: readonly { event: SessionEvent }[] }): number[] {
  return page.records.map((record) => Number(record.event.seq));
}

const log = [
  turnStart(0, 1),
  message(1),
  message(2),
  turnStart(3, 2),
  message(4),
  message(5),
  turnStart(6, 3),
  message(7),
];

test("an empty log leaves an empty page", () => {
  assert.deepEqual(pageSessionEvents([], { sessionId: "s1" }), {
    records: [],
    hasMore: false,
  });
});

test("a page starts on the newest turn boundary and reports earlier history", () => {
  const page = pageSessionEvents(log, { sessionId: "s1", maxMessages: 1 });
  assert.deepEqual(pairs(page), [6, 7]);
  assert.equal(page.hasMore, true);
});

test("throughSeq is inclusive and beforeSeq is exclusive", () => {
  const page = pageSessionEvents(log, {
    sessionId: "s1",
    throughSeq: 5,
    beforeSeq: 6,
    maxMessages: 2,
  });
  assert.deepEqual(pairs(page), [3, 4, 5]);
  assert.equal(page.hasMore, true);
});

test("turnWindow raises the message budget until both minima are crossed", () => {
  const page = pageSessionEvents(log, {
    sessionId: "s1",
    maxMessages: 1,
    turnWindow: { minMessages: 1, minTurns: 2 },
  });
  assert.deepEqual(pairs(page), [3, 4, 5, 6, 7]);
  assert.equal(page.hasMore, true);
});

test("a page reaching the start of the log reports no more history", () => {
  const page = pageSessionEvents(log, { sessionId: "s1", maxMessages: 100 });
  assert.deepEqual(pairs(page), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(page.hasMore, false);
});
