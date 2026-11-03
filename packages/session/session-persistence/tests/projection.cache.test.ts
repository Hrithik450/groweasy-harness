import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@openai-harness/storage";
import { JsonStorageBackend } from "@openai-harness/storage-json";
import { DomainFacility } from "@openai-harness/storage-domain";
import {
  decodeProjectionCacheKey,
  projectionCacheDomainSpec,
  projectionCacheKey,
  SessionProjectionsRepository,
  type ProjectionCacheTable,
} from "../src/projection.cache.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "projection-cache-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function openRepository(): Promise<{
  repository: SessionProjectionsRepository;
  close: () => Promise<void>;
}> {
  const ctx = new Context();
  await ctx.plugin(Storage);
  const backend = new JsonStorageBackend(root);
  ctx.storage.backend.register("json", backend);
  const facility = new DomainFacility(ctx, { backend: "json" });
  const domain = await facility.open(projectionCacheDomainSpec);
  const table = domain.table("checkpoints") as unknown as ProjectionCacheTable;
  return {
    repository: new SessionProjectionsRepository(async () => table),
    close: async () => {
      await domain.close();
      await backend.close();
    },
  };
}

test("checkpoint keys encode the logical session/key pair", () => {
  const key = projectionCacheKey("session-1", "detailBar");
  assert.match(key, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeProjectionCacheKey(key), {
    sessionId: "session-1",
    key: "detailBar",
  });
  assert.equal(decodeProjectionCacheKey("not-a-canonical-key"), undefined);
});

test("projection checkpoints round-trip and are scoped per session/key", async () => {
  const { repository, close } = await openRepository();
  try {
    await repository.saveCheckpoint("session-1", "detailBar", {
      stateVersion: 2,
      asOfSeq: 7,
      state: { data: { competitorResearches: [] } },
    });

    const stored = await repository.getCheckpoint<{
      data: { competitorResearches: unknown[] };
    }>("session-1", "detailBar");
    assert.equal(stored?.stateVersion, 2);
    assert.equal(stored?.asOfSeq, 7);
    assert.deepEqual(stored?.state, { data: { competitorResearches: [] } });

    assert.equal(
      await repository.getCheckpoint("session-2", "detailBar"),
      null,
    );
    assert.equal(
      await repository.getCheckpoint("session-1", "other"),
      null,
    );
  } finally {
    await close();
  }
});

test("checkpoints survive a reopen and clear is per session", async () => {
  const first = await openRepository();
  await first.repository.saveCheckpoint("session-1", "detailBar", {
    stateVersion: 1,
    asOfSeq: 0,
    state: { value: 1 },
  });
  await first.repository.saveCheckpoint("session-2", "detailBar", {
    stateVersion: 1,
    asOfSeq: 0,
    state: { value: 2 },
  });
  await first.close();

  const second = await openRepository();
  try {
    assert.deepEqual(
      (await second.repository.getCheckpoint("session-1", "detailBar"))?.state,
      { value: 1 },
    );

    await second.repository.clearCheckpoints("session-1");
    assert.equal(
      await second.repository.getCheckpoint("session-1", "detailBar"),
      null,
    );
    assert.deepEqual(
      (await second.repository.getCheckpoint("session-2", "detailBar"))?.state,
      { value: 2 },
    );
  } finally {
    await second.close();
  }
});
