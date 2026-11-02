import test from "node:test";
import assert from "node:assert/strict";

import {
  isJsonArray,
  isJsonObject,
  isJsonPrimitive,
  type JsonValue,
} from "../src/index";

test("primitive, object, and array discrimination", () => {
  assert.equal(isJsonPrimitive("value"), true);
  assert.equal(isJsonPrimitive(1), true);
  assert.equal(isJsonPrimitive(false), true);
  assert.equal(isJsonPrimitive(null), true);
  assert.equal(isJsonPrimitive({}), false);
  assert.equal(isJsonPrimitive([]), false);

  assert.equal(isJsonObject({ key: "value" }), true);
  assert.equal(isJsonObject([]), false);
  assert.equal(isJsonObject(null), false);

  assert.equal(isJsonArray([1, "two", null]), true);
  assert.equal(isJsonArray({}), false);
});

test("JsonValue accepts the lossless JSON shape", () => {
  const value: JsonValue = {
    name: "alpha",
    count: 2,
    enabled: true,
    nested: [1, null, { description: "leaf" }],
  };
  assert.deepEqual(value.nested, [1, null, { description: "leaf" }]);
});
