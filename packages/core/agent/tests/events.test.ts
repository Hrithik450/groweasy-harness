import test from "node:test";
import assert from "node:assert/strict";

import {
  type AgentEvent,
  type MessageContent,
  type SessionMessageEvent,
} from "../src/runtime-types";

/** A stand-in for the host's persisted session row. */
interface HostSession {
  id: string;
  title: string;
  updatedAt: number;
}

/** Compile-time assertion that a value has the expected type. */
function expectType<T>(_value: T): void {}

test("session/message carries content, role, and position", () => {
  const event: AgentEvent<HostSession> = {
    type: "session/message",
    seq: 3,
    data: {
      id: "message-1",
      role: "assistant",
      kind: "text",
      content: "hello",
      turn: 1,
      step: 2,
    },
  };

  if (event.type !== "session/message") assert.fail("wrong discriminator");
  assert.equal(event.seq, 3);
  assert.equal(event.data.role, "assistant");
  assert.equal(event.data.content, "hello");
  assert.equal(event.data.turn, 1);
  assert.equal(event.data.step, 2);
});

test("session/update accepts a partial host snapshot plus detailBar", () => {
  const event: AgentEvent<HostSession> = {
    type: "session/update",
    data: { title: "renamed", detailBar: { type: "ad-manager" } },
  };

  if (event.type !== "session/update") assert.fail("wrong discriminator");
  assert.equal(event.data.title, "renamed");
  assert.deepEqual(event.data.detailBar, { type: "ad-manager" });
});

test("turn/end degrades to its turn number when no reason is recorded", () => {
  const event: AgentEvent<HostSession> = { type: "turn/end", data: { turn: 4 } };

  if (event.type !== "turn/end") assert.fail("wrong discriminator");
  assert.equal(event.data.turn, 4);
  assert.equal(event.data.reason, undefined);
});

test("SessionMessageEvent narrows the union to the message member", () => {
  const message: SessionMessageEvent<HostSession> = {
    type: "session/message",
    data: { id: "message-2", role: "user", kind: "text", content: "hi" },
  };

  expectType<MessageContent>(message.data);
  expectType<string>(message.data.id);
  assert.equal(message.data.id, "message-2");
});

test("the default session snapshot keeps the vocabulary usable without a host type", () => {
  const event: AgentEvent = {
    type: "session/update",
    data: { detailBar: null },
  };

  if (event.type !== "session/update") assert.fail("wrong discriminator");
  assert.equal(event.data.detailBar, null);
});

test("tool events expose their discriminated payloads", () => {
  const call: AgentEvent<HostSession> = {
    type: "tool/call",
    data: { name: "search", arguments: "{}" },
  };
  const result: AgentEvent<HostSession> = {
    type: "tool/result",
    data: { name: "search", success: true, meta: { durationMs: 12 } },
  };

  if (call.type !== "tool/call") assert.fail("wrong discriminator");
  if (result.type !== "tool/result") assert.fail("wrong discriminator");
  assert.equal(call.data.name, "search");
  assert.equal(result.data.success, true);
  assert.deepEqual(result.data.meta, { durationMs: 12 });
});
