import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RPC_METHODS,
  rpcParamSchemas,
  subscriptionParamsSchemas,
} from "../src/contracts";

test("every RPC method has exactly one param schema", () => {
  assert.deepEqual(
    [...RPC_METHODS].sort(),
    Object.keys(rpcParamSchemas).sort(),
  );

  for (const method of RPC_METHODS) {
    assert.ok(rpcParamSchemas[method], `missing schema for ${method}`);
  }
});

test("session.list accepts void only", () => {
  assert.equal(
    rpcParamSchemas["session.list"].safeParse(undefined).success,
    true,
  );
  assert.equal(rpcParamSchemas["session.list"].safeParse({}).success, false);
  assert.equal(rpcParamSchemas["session.list"].safeParse(null).success, false);
});

test("session.inspect requires a non-empty sessionId", () => {
  assert.equal(
    rpcParamSchemas["session.inspect"].safeParse({ sessionId: "s1" }).success,
    true,
  );
  assert.equal(
    rpcParamSchemas["session.inspect"].safeParse({ sessionId: "" }).success,
    false,
  );
  assert.equal(rpcParamSchemas["session.inspect"].safeParse({}).success, false);
});

test("session.prompt requires a request id, mode, and text content", () => {
  const schema = rpcParamSchemas["session.prompt"];
  const base = {
    requestId: "r1",
    sessionId: "s1",
    mode: "queue",
    content: [{ type: "text", text: "hello" }],
  };

  assert.equal(schema.safeParse(base).success, true);
  assert.equal(
    schema.safeParse({ ...base, mode: "steer", origin: "ui-action" }).success,
    true,
  );
  assert.equal(schema.safeParse({ ...base, requestId: "" }).success, false);
  assert.equal(schema.safeParse({ ...base, mode: "now" }).success, false);
  assert.equal(schema.safeParse({ ...base, content: [] }).success, false);
  assert.equal(
    schema.safeParse({ ...base, content: [{ type: "text", text: "   " }] })
      .success,
    false,
  );
  assert.equal(schema.safeParse({ ...base, origin: "other" }).success, false);
});

test("session.page validates cursor and window bounds", () => {
  const schema = rpcParamSchemas["session.page"];

  assert.equal(schema.safeParse({ sessionId: "s1" }).success, true);
  assert.equal(
    schema.safeParse({
      sessionId: "s1",
      beforeSeq: 10,
      maxMessages: 20,
      turnWindow: { minMessages: 2, minTurns: 1 },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ sessionId: "s1", maxMessages: 0 }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ sessionId: "s1", turnWindow: { minTurns: 1 } }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ sessionId: "s1", beforeSeq: -1 }).success,
    false,
  );
});

test("session.block.submit requires a block id and an object spec", () => {
  const schema = rpcParamSchemas["session.block.submit"];

  assert.equal(
    schema.safeParse({
      sessionId: "s1",
      blockId: "b1",
      spec: { root: "r", elements: {}, values: { choice: "a" } },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ sessionId: "s1", blockId: "", spec: {} }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ sessionId: "s1", blockId: "b1", spec: "nope" })
      .success,
    false,
  );
});

test("session.cancel requires a sessionId", () => {
  assert.equal(
    rpcParamSchemas["session.cancel"].safeParse({ sessionId: "s1" }).success,
    true,
  );
  assert.equal(
    rpcParamSchemas["session.cancel"].safeParse({}).success,
    false,
  );
});

test("session.follow subscription params validate afterSeq", () => {
  const schema = subscriptionParamsSchemas["session.follow"];

  assert.equal(schema.safeParse({ sessionId: "s1" }).success, true);
  assert.equal(
    schema.safeParse({ sessionId: "s1", afterSeq: 3 }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ sessionId: "s1", afterSeq: -1 }).success,
    false,
  );
  assert.equal(schema.safeParse({ sessionId: "" }).success, false);
});
