import test from "node:test";
import assert from "node:assert/strict";

import {
  parseRemoteStreamClientMessage,
  parseRemoteStreamServerMessage,
  REMOTE_STREAM_MUX_PATH,
} from "../src/stream-protocol";

test("the mux path matches the Gateway route", () => {
  assert.equal(REMOTE_STREAM_MUX_PATH, "/api/remote.mux");
});

test("every Client message variant parses", () => {
  assert.deepEqual(
    parseRemoteStreamClientMessage(
      JSON.stringify({
        type: "open",
        streamId: "stream-1",
        endpoint: "session/follow",
        payload: { args: { sessionId: "s1" } },
      }),
    ),
    {
      type: "open",
      streamId: "stream-1",
      endpoint: "session/follow",
      payload: { args: { sessionId: "s1" } },
    },
  );
  assert.deepEqual(
    parseRemoteStreamClientMessage(
      JSON.stringify({ type: "cancel", streamId: "stream-1" }),
    ),
    { type: "cancel", streamId: "stream-1" },
  );
  assert.deepEqual(
    parseRemoteStreamClientMessage(
      JSON.stringify({
        type: "item",
        streamId: "stream-1",
        value: { line: "ls\n" },
      }),
    ),
    { type: "item", streamId: "stream-1", value: { line: "ls\n" } },
  );
  assert.deepEqual(
    parseRemoteStreamClientMessage(
      JSON.stringify({ type: "item", streamId: "stream-1" }),
    ),
    { type: "item", streamId: "stream-1" },
  );
  assert.deepEqual(
    parseRemoteStreamClientMessage(
      JSON.stringify({ type: "end", streamId: "stream-1" }),
    ),
    { type: "end", streamId: "stream-1" },
  );
});

test("invalid Client messages reject with the protocol message", () => {
  const invalid = [
    { type: "open", streamId: "", endpoint: "session/follow", payload: {} },
    { type: "open", streamId: "stream-1", endpoint: "", payload: {} },
    { type: "open", streamId: "stream-1", endpoint: "session/follow" },
    { type: "cancel", streamId: "stream-1", extra: true },
    { type: "item", streamId: "", value: "line" },
    { type: "item", streamId: "stream-1", value: "line", extra: true },
    { type: "item", streamId: "stream-1", endpoint: "session/follow" },
    { type: "end", streamId: "" },
    { type: "end", streamId: "stream-1", value: "line" },
    { type: "unknown", streamId: "stream-1" },
  ];
  for (const message of invalid) {
    assert.throws(
      () => parseRemoteStreamClientMessage(JSON.stringify(message)),
      /api gateway: invalid Remote stream client message/,
    );
  }
});

test("a lossy JSON uplink value is rejected", () => {
  assert.throws(
    () =>
      parseRemoteStreamClientMessage(
        '{"type":"item","streamId":"stream-1","value":-0}',
      ),
    /api gateway: invalid Remote stream client message/,
  );
});

test("every Host frame variant parses", () => {
  assert.deepEqual(
    parseRemoteStreamServerMessage(
      JSON.stringify({ type: "item", streamId: "stream-1", value: null }),
    ),
    { type: "item", streamId: "stream-1", value: null },
  );
  assert.deepEqual(
    parseRemoteStreamServerMessage(
      JSON.stringify({ type: "item", streamId: "stream-1" }),
    ),
    { type: "item", streamId: "stream-1" },
  );
  assert.deepEqual(
    parseRemoteStreamServerMessage(
      JSON.stringify({
        type: "error",
        streamId: "stream-1",
        error: { code: "offline", message: "connection lost", details: {} },
      }),
    ),
    {
      type: "error",
      streamId: "stream-1",
      error: { code: "offline", message: "connection lost", details: {} },
    },
  );
  assert.deepEqual(
    parseRemoteStreamServerMessage(
      JSON.stringify({ type: "end", streamId: "stream-1" }),
    ),
    { type: "end", streamId: "stream-1" },
  );
});

test("invalid Host frames reject with the protocol message", () => {
  const invalid = [
    { type: "item", streamId: "", value: "item" },
    { type: "item", streamId: "stream-1", extra: true },
    { type: "end", streamId: "stream-1", extra: true },
    { type: "error", streamId: "stream-1", error: [] },
    {
      type: "error",
      streamId: "stream-1",
      error: { code: 1, message: "failure", details: {} },
    },
    {
      type: "error",
      streamId: "stream-1",
      error: { code: "failed", message: 1, details: {} },
    },
    {
      type: "error",
      streamId: "stream-1",
      error: { code: "failed", message: "failure", details: [] },
    },
    { type: "unknown", streamId: "stream-1" },
  ];
  for (const message of invalid) {
    assert.throws(
      () => parseRemoteStreamServerMessage(JSON.stringify(message)),
      /api gateway: invalid Remote stream server message/,
    );
  }
});

test("non-object payloads reject before field validation", () => {
  for (const text of ["not json", "null", "[]", "1"]) {
    assert.throws(
      () => parseRemoteStreamServerMessage(text),
      /api gateway: Remote stream message/,
    );
  }
});
