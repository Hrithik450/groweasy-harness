import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanReactId,
  composeFieldId,
  getFieldValue,
  toCamelCase,
} from "../src/utils";

test("toCamelCase normalizes labels into identifier-safe names", () => {
  assert.equal(toCamelCase("Campaign Performance"), "campaignPerformance");
  assert.equal(toCamelCase("Avg CPA"), "avgCpa");
  assert.equal(toCamelCase("  "), "");
  assert.equal(toCamelCase(undefined), "");
});

test("composeFieldId prefers a label and falls back to the cleaned react id", () => {
  assert.equal(composeFieldId("Campaign Name"), "campaignName");
  assert.equal(composeFieldId(undefined, "«r0»", "field"), "field_r0");
  assert.equal(composeFieldId(undefined, undefined, "field"), "field");
});

test("cleanReactId strips non-alphanumeric characters", () => {
  assert.equal(cleanReactId(":r1:"), "r1");
});

test("getFieldValue resolves legacy suffixed keys", () => {
  const values = { subject_r0: "Launch", count: 3 };

  assert.equal(getFieldValue(values, "subject"), "Launch");
  assert.equal(getFieldValue(values, "missing", "count"), 3);
  assert.equal(getFieldValue(undefined, "subject"), undefined);
});
