import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASPECT_CONFIG,
  getNearestAspectRatio,
  normalizeAspectRatio,
} from "../src/image-utils";

test("getNearestAspectRatio maps dimensions to the curated sizes", () => {
  assert.equal(getNearestAspectRatio(1080, 1920), "9/16");
  assert.equal(getNearestAspectRatio(1080, 1350), "4/5");
  assert.equal(getNearestAspectRatio(1000, 1000), "1/1");
  assert.equal(getNearestAspectRatio(1500, 1000), "3/2");
  assert.equal(getNearestAspectRatio(1920, 1080), "16/9");
});

test("getNearestAspectRatio defaults invalid dimensions to square", () => {
  assert.equal(getNearestAspectRatio(0, 0), "1/1");
});

test("normalizeAspectRatio accepts legacy spellings", () => {
  assert.equal(normalizeAspectRatio("16:9"), "16/9");
  assert.equal(normalizeAspectRatio("3x2"), "3/2");
  assert.equal(normalizeAspectRatio("nope"), undefined);
  assert.equal(normalizeAspectRatio(undefined), undefined);
});

test("every standard ratio has a card configuration", () => {
  for (const ratio of Object.keys(ASPECT_CONFIG)) {
    assert.ok(ASPECT_CONFIG[ratio as keyof typeof ASPECT_CONFIG].aspectClass);
  }
});
