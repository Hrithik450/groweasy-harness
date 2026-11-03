import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import {
  claimLiveSession,
  configureSessionPersistence,
  resetSessionPersistence,
  Session,
  SessionId,
  SessionSeq,
  type SessionEvent,
} from "@openai-harness/session";
import { DETAIL_BAR_STATE_VERSION } from "@openai-harness/session-projection";
import Storage from "@openai-harness/storage";
import { JsonStorageBackend } from "@openai-harness/storage-json";
import { DomainFacility } from "@openai-harness/storage-domain";
import {
  configureProjectionCacheLoader,
  configureSessionEventsStore,
  DETAIL_BAR_KEY,
  mutateDetailBarState,
  projectionCacheDomainSpec,
  readDetailBarState,
  resetProjectionCacheLoader,
  resetSessionEventsStore,
  sessionEventsRepo,
  sessionProjectionsRepo,
  SessionsRepository,
  type ProjectionCacheTable,
} from "../src/index.ts";
import { JsonlSessionPersistenceBackend } from "../src/jsonl.backend.ts";

/**
 * These tests exercise the process-wide repositories the tools actually use,
 * so they bind the ledger store and projection-cache loader exactly as the
 * host does. One temp backend and one cache table are shared by the file;
 * every case uses its own session id.
 */

let root: string;
let eventsBackend: JsonlSessionPersistenceBackend;
let sessions: SessionsRepository;
let closeCache = async (): Promise<void> => {};
let sessionCounter = 0;
let published: Array<{ sessionId: string; events: readonly SessionEvent[] }>;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "detail-bar-repo-"));
  eventsBackend = new JsonlSessionPersistenceBackend({
    root: join(root, "events"),
  });
  sessions = new SessionsRepository({
    backend: eventsBackend,
    mintId: () => `minted-${String(++sessionCounter)}`,
    userExists: () => true,
  });

  const ctx = new Context();
  await ctx.plugin(Storage);
  const cacheBackend = new JsonStorageBackend(join(root, "cache"));
  ctx.storage.backend.register("json", cacheBackend);
  const facility = new DomainFacility(ctx, { backend: "json" });
  const domain = await facility.open(projectionCacheDomainSpec);
  const table = domain.table(
    "checkpoints",
  ) as unknown as ProjectionCacheTable;
  closeCache = async () => {
    await domain.close();
    await cacheBackend.close();
  };

  published = [];
  configureSessionEventsStore({
    backend: eventsBackend,
    publish: (sessionId, events) => {
      published.push({ sessionId, events });
    },
  });
  configureProjectionCacheLoader(async () => table);
});

after(async () => {
  resetProjectionCacheLoader();
  resetSessionEventsStore();
  await closeCache();
  await eventsBackend.close();
  await rm(root, { recursive: true, force: true });
});

async function newSession(): Promise<string> {
  const id = `detail-bar-${String(++sessionCounter)}`;
  await sessions.createSession({ id, userId: "user-1", title: "Test" });
  return id;
}

/**
 * Append one committed `detailBar/update` at the current cursor.
 * @returns its sequence number.
 */
async function appendDetailBar(
  sessionId: string,
  payload: unknown,
): Promise<number> {
  const seq = await sessionEventsRepo.getNextSeq(sessionId);
  await sessionEventsRepo.append(sessionId, {
    seq: SessionSeq(seq),
    type: "detailBar/update",
    time: Date.now(),
    data: { detailBar: payload },
  } as unknown as SessionEvent);
  return seq;
}

test("read → mutate → read round-trips the whole value and advances the watermark", async () => {
  const sessionId = await newSession();

  const initial = await readDetailBarState(sessionId, "adStrategist");
  assert.deepEqual(initial.state, { type: "adStrategist", data: {} });
  assert.equal(initial.asOfSeq, -1);
  assert.equal(initial.stateVersion, DETAIL_BAR_STATE_VERSION);

  const researchItem = { title: "WhatsApp automation", content: "angle" };
  const written = await mutateDetailBarState(
    sessionId,
    "adStrategist",
    (current) => {
      const data = current.data as { competitorResearches?: unknown[] };
      return {
        ...current,
        type: "adStrategist",
        data: {
          ...data,
          competitorResearches: [
            researchItem,
            ...(data.competitorResearches ?? []),
          ],
        },
      };
    },
  );

  assert.ok(written);
  assert.deepEqual(
    (written.data as { competitorResearches: unknown[] }).competitorResearches,
    [researchItem],
  );

  const reread = await readDetailBarState(sessionId, "adStrategist");
  assert.deepEqual(reread.state, written);
  assert.equal(reread.asOfSeq, 0);
  assert.equal(reread.stateVersion, DETAIL_BAR_STATE_VERSION);

  const checkpoint = await sessionProjectionsRepo.getCheckpoint(
    sessionId,
    DETAIL_BAR_KEY,
  );
  assert.equal(checkpoint?.asOfSeq, 0);
  assert.equal(checkpoint?.stateVersion, DETAIL_BAR_STATE_VERSION);
  assert.deepEqual(checkpoint?.state, written);
});

test("a current-version checkpoint seeds the fold instead of the empty base", async () => {
  const sessionId = await newSession();

  // The committed event at seq 0 is a stale value the checkpoint says is
  // already folded; the read must not replay it over the checkpoint state.
  await appendDetailBar(sessionId, {
    type: "adStrategist",
    data: { competitorResearches: ["stale-event"] },
  });
  await sessionProjectionsRepo.saveCheckpoint(sessionId, DETAIL_BAR_KEY, {
    stateVersion: DETAIL_BAR_STATE_VERSION,
    asOfSeq: 0,
    state: {
      type: "adStrategist",
      data: { competitorResearches: ["checkpoint"] },
    },
  });

  const read = await readDetailBarState(sessionId, "adStrategist");
  assert.deepEqual(
    (read.state.data as { competitorResearches: string[] }).competitorResearches,
    ["checkpoint"],
  );
  assert.equal(read.asOfSeq, 0);
});

test("events after the checkpoint watermark are folded onto its state", async () => {
  const sessionId = await newSession();

  await appendDetailBar(sessionId, {
    type: "adStrategist",
    data: { competitorResearches: ["seq-0"] },
  });
  await sessionProjectionsRepo.saveCheckpoint(sessionId, DETAIL_BAR_KEY, {
    stateVersion: DETAIL_BAR_STATE_VERSION,
    asOfSeq: 0,
    state: {
      type: "adStrategist",
      data: { competitorResearches: ["seq-0", "from-checkpoint"] },
    },
  });
  await appendDetailBar(sessionId, {
    type: "adStrategist",
    data: { competitorResearches: ["seq-1-wins"] },
  });

  const read = await readDetailBarState(sessionId, "adStrategist");
  assert.deepEqual(read.state, {
    type: "adStrategist",
    data: { competitorResearches: ["seq-1-wins"] },
  });
  assert.equal(read.asOfSeq, 1);
});

test("a malformed detailBar payload is skipped, not applied", async () => {
  const sessionId = await newSession();

  const seq = await appendDetailBar(sessionId, {
    type: 5,
    data: null,
  });

  const read = await readDetailBarState(sessionId, "adStrategist");
  assert.deepEqual(read.state, { type: "adStrategist", data: {} });
  // The malformed event is still the inclusive watermark of the fold.
  assert.equal(read.asOfSeq, seq);
});

test("mutate publishes the committed detailBar/update event", async () => {
  const sessionId = await newSession();
  published.length = 0;

  const next = await mutateDetailBarState(
    sessionId,
    "adManager",
    (current) => ({
      ...current,
      type: "adManager",
      data: {
        ...current.data,
        alerts: [{ id: "alert-1" }],
      },
    }),
  );

  assert.equal(published.length, 1);
  const batch = published[0]!;
  assert.equal(batch.sessionId, sessionId);
  assert.equal(batch.events.length, 1);
  const event = batch.events[0]!;
  assert.equal(event.type, "detailBar/update");
  assert.deepEqual(
    (event.data as { detailBar: unknown }).detailBar,
    next,
  );
});

test("a write during a live turn appends through the session, keeping seqs contiguous", async () => {
  const sessionId = await newSession();
  configureSessionPersistence(sessionEventsRepo);
  const session = await Session.load({
    version: 1,
    id: SessionId(sessionId),
    userId: "user-1",
    createdAt: Date.now(),
  });
  const release = claimLiveSession(session);

  try {
    session.append("detailBar/update", {
      detailBar: { type: "adStrategist", data: {} },
    });
    await session.whenPersisted();

    // A tool writing the detail bar while this turn owns the log.
    await mutateDetailBarState(sessionId, "adStrategist", (current) => ({
      ...current,
      type: "adStrategist",
      data: { competitorResearches: ["live-write"] },
    }));

    // The turn's own next event must follow the detail-bar event, not collide.
    session.append("detailBar/update", {
      detailBar: { type: "adStrategist", data: { reports: [] } },
    });
    await session.whenPersisted();

    const events = await sessionEventsRepo.getEvents(sessionId);
    assert.deepEqual(
      events.map((event) => event.seq),
      [0, 1, 2],
    );
    assert.deepEqual(
      (events[1]!.data as { detailBar: { data: unknown } }).detailBar.data,
      { competitorResearches: ["live-write"] },
    );

    const read = await readDetailBarState(sessionId, "adStrategist");
    assert.deepEqual(read.state.data, { reports: [] });
    assert.equal(read.asOfSeq, 2);
  } finally {
    release();
    resetSessionPersistence();
  }
});

test("a mutator returning undefined appends nothing", async () => {
  const sessionId = await newSession();
  const before = await sessionEventsRepo.countEvents(sessionId);

  const result = await mutateDetailBarState(
    sessionId,
    "adManager",
    () => undefined,
  );

  assert.equal(result, undefined);
  assert.equal(await sessionEventsRepo.countEvents(sessionId), before);
});
