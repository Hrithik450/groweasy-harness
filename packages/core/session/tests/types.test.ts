import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionId, SessionSeq, SessionLogOffset } from "../src/types";

test("SessionId brands opaque session strings without modification", () => {
  const raw = "session-01931330-0c6a-7bc3-91a9-1ae7a9a96d80";
  const id = SessionId(raw);
  assert.equal(id, raw);
});

test("SessionSeq enforces safe non-negative integers and rejects invalid values", () => {
  assert.equal(SessionSeq(0), 0);
  assert.equal(SessionSeq(100), 100);

  assert.throws(() => SessionSeq(-1), /must be a non-negative safe integer/);
  assert.throws(() => SessionSeq(-0), /must be a non-negative safe integer/);
  assert.throws(() => SessionSeq(1.5), /must be a non-negative safe integer/);
  assert.throws(() => SessionSeq(Number.NaN), /must be a non-negative safe integer/);
  assert.throws(() => SessionSeq(Infinity), /must be a non-negative safe integer/);
});

test("SessionLogOffset enforces safe non-negative integers and rejects invalid values", () => {
  assert.equal(SessionLogOffset(0), 0);
  assert.equal(SessionLogOffset(50), 50);

  assert.throws(() => SessionLogOffset(-5), /must be a non-negative safe integer/);
  assert.throws(() => SessionLogOffset(-0), /must be a non-negative safe integer/);
  assert.throws(() => SessionLogOffset(3.14), /must be a non-negative safe integer/);
});
