import test from "node:test";
import assert from "node:assert/strict";

import { parseJsonRpcLine } from "../src/index";

test("a request line decodes to a JSON-RPC 2.0 request", () => {
  assert.deepEqual(
    parseJsonRpcLine(
      '{"jsonrpc":"2.0","id":"a1","method":"session.list","params":{}}',
    ),
    {
      jsonrpc: "2.0",
      id: "a1",
      method: "session.list",
      params: {},
    },
  );
});

test("a notification has no id", () => {
  assert.deepEqual(
    parseJsonRpcLine('{"jsonrpc":"2.0","method":"ping"}'),
    { jsonrpc: "2.0", method: "ping" },
  );
});

test("blank lines are ignored", () => {
  assert.equal(parseJsonRpcLine("   "), undefined);
});

test("malformed JSON is rejected", () => {
  assert.throws(() => parseJsonRpcLine("{"), /not JSON/);
});

test("non-object payloads are rejected", () => {
  assert.throws(() => parseJsonRpcLine("[]"), /must be an object/);
});

test("the version and method are required", () => {
  assert.throws(
    () => parseJsonRpcLine('{"id":1,"method":"x"}'),
    /jsonrpc/,
  );
  assert.throws(
    () => parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"method":""}'),
    /non-empty method/,
  );
});

test("an id must be a string, number, or null", () => {
  assert.throws(
    () => parseJsonRpcLine('{"jsonrpc":"2.0","id":{},"method":"x"}'),
    /id must be/,
  );
});
