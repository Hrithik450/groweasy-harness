import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeUserId, slugToTitle } from "../src/index";

test("sanitizeUserId keeps safe characters and replaces the rest", () => {
  assert.equal(sanitizeUserId("user_42-abc"), "user_42-abc");
  assert.equal(sanitizeUserId("../etc/passwd"), "___etc_passwd");
  assert.equal(sanitizeUserId("  spaced id  "), "__spaced_id__");
  assert.equal(sanitizeUserId(""), "");
  assert.equal(sanitizeUserId(undefined), "");
});

test("slugToTitle splits camelCase into a display title", () => {
  assert.equal(slugToTitle("adManager"), "Ad Manager");
  assert.equal(slugToTitle("adStrategist"), "Ad Strategist");
  assert.equal(slugToTitle("businessProfile"), "Business Profile");
});
