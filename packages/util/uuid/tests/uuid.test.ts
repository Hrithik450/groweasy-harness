import assert from "node:assert/strict";
import { test } from "node:test";
import {
  randomUUID,
  uuidv7,
  isValidUuid,
  isValidUuidV7,
  bytesToBase64,
} from "../src/index";

test("randomUUID produces valid RFC 9562 v4 UUIDs", () => {
  for (let i = 0; i < 32; i++) {
    const id = randomUUID();
    assert.equal(isValidUuid(id), true);
    // RFC 9562 §5.4: byte 6 high nibble must be 4
    assert.equal(id.charAt(14), "4");
    // byte 8 high nibble must be 8, 9, a, or b
    assert.match(id.charAt(19), /[89ab]/i);
  }
});

test("uuidv7 produces valid RFC 9562 v7 UUIDs with time ordering", () => {
  const ids: string[] = [];
  for (let i = 0; i < 32; i++) {
    const id = uuidv7(1000 + i);
    assert.equal(isValidUuid(id), true);
    assert.equal(isValidUuidV7(id), true);
    // RFC 9562 §5.7: byte 6 high nibble must be 7
    assert.equal(id.charAt(14), "7");
    // byte 8 high nibble must be 8, 9, a, or b
    assert.match(id.charAt(19), /[89ab]/i);
    ids.push(id);
  }

  // Ensure chronological lexicographical order
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i] > ids[i - 1], `Expected ${ids[i]} > ${ids[i - 1]}`);
  }
});

test("isValidUuid and isValidUuidV7 correctly distinguish formats", () => {
  const v4 = randomUUID();
  const v7 = uuidv7();

  assert.equal(isValidUuid(v4), true);
  assert.equal(isValidUuid(v7), true);
  assert.equal(isValidUuidV7(v7), true);
  assert.equal(isValidUuidV7("not-a-uuid"), false);
  assert.equal(isValidUuid("00000000-0000-0000-0000-000000000000"), false);
});

test("bytesToBase64 handles chunks without stack overflow", () => {
  const sample = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  assert.equal(bytesToBase64(sample), Buffer.from("Hello").toString("base64"));
});
