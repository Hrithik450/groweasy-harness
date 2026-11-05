import assert from "node:assert/strict";
import test from "node:test";

import { CompactionId } from "../src/brand";
import {
  compactCheckpointSource,
  isCompactCheckpointSource,
} from "../src/checkpoint";

test("creates a frozen correlated checkpoint source", () => {
  const compactionId = CompactionId("compaction-1");
  const source = compactCheckpointSource(compactionId, "command-1");

  assert.deepEqual(source, {
    kind: "compact-checkpoint",
    compactionId: "compaction-1",
    sourceCommandId: "command-1",
  });
  assert.ok(Object.isFrozen(source));
  assert.equal(isCompactCheckpointSource(source), true);
});

test("omits an absent source command and rejects other sources", () => {
  const source = compactCheckpointSource(CompactionId("compaction-2"));

  assert.equal("sourceCommandId" in source, false);
  assert.equal(isCompactCheckpointSource({ kind: "user" }), false);
  assert.equal(isCompactCheckpointSource({ kind: "cron" }), false);
});
