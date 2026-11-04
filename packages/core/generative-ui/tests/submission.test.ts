import test from "node:test";
import assert from "node:assert/strict";

import { blockSubmissionText, submissionAction } from "../src/submission";
import type { UIBlockSpec } from "../src/types";

const base: UIBlockSpec = { root: "root", elements: {} };

test("block submission text lists submitted values", () => {
  const text = blockSubmissionText({
    ...base,
    submitted: true,
    values: { priority: "Campaign Performance", count: 2 },
  });

  assert.match(text, /interactive UI block \(action: complete\)/);
  assert.match(text, /- priority: Campaign Performance/);
  assert.match(text, /- count: 2/);
});

test("reserved __ keys are control data, not model-visible values", () => {
  const spec = {
    ...base,
    values: { __action: "choose", priority: "Ads" },
  };

  assert.equal(submissionAction(spec), "choose");
  const text = blockSubmissionText(spec);
  assert.doesNotMatch(text, /__action/);
  assert.match(text, /action: choose/);
});

test("a submission without values still describes the action", () => {
  const text = blockSubmissionText({ ...base, action: "refresh" });
  assert.equal(
    text,
    "The user submitted the interactive UI block (action: refresh) without values.",
  );
});
