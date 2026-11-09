import test from "node:test";
import assert from "node:assert/strict";

import { RpcError } from "../src/errors";

test("RpcError carries its stable code and message", () => {
  const error = new RpcError("not_found", "Session not found");
  assert.equal(error.name, "RpcError");
  assert.equal(error.code, "not_found");
  assert.equal(error.message, "Session not found");
  assert.equal(error instanceof Error, true);
});
