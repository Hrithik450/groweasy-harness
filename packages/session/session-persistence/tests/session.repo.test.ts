import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SessionSeq,
  type SessionEvent,
} from "@openai-harness/session";
import { JsonlSessionPersistenceBackend } from "../src/jsonl.backend.ts";
import { SessionEventsRepository } from "../src/events.repo.ts";
import { SessionContiguityError } from "../src/contract.ts";
import { SessionsRepository } from "../src/repository.ts";

const SESSION_ID = "session-events-test";

let root: string;
let backend: JsonlSessionPersistenceBackend;
let events: SessionEventsRepository;
let sessions: SessionsRepository;
let sequence: number;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "session-repo-"));
  backend = new JsonlSessionPersistenceBackend({ root });
  events = new SessionEventsRepository({ backend });
  sequence = 0;
  sessions = new SessionsRepository({
    backend,
    mintId: () => `session-${String(++sequence)}`,
    userExists: () => true,
  });
});

afterEach(async () => {
  await backend.close();
  await rm(root, { recursive: true, force: true });
});

function event(seq: number): SessionEvent {
  return {
    seq: SessionSeq(seq),
    type: "turn/start",
    time: Date.now(),
    data: { turn: 1 },
  } as unknown as SessionEvent;
}

async function createTestSession(): Promise<void> {
  await sessions.createSession({
    id: SESSION_ID,
    userId: "user-1",
    title: "Test",
  });
}

test("appendBatch starts at seq 0 and continues from the stored cursor", async () => {
  await createTestSession();
  await events.appendBatch(SESSION_ID, [event(0), event(1)]);
  await events.appendBatch(SESSION_ID, [event(2)]);

  const rows = await events.getEvents(SESSION_ID);
  assert.deepEqual(
    rows.map((row) => row.seq),
    [0, 1, 2],
  );
  assert.equal(await events.countEvents(SESSION_ID), 3);
  assert.equal(await events.getNextSeq(SESSION_ID), 3);
});

test("append delegates to appendBatch and advances the cursor", async () => {
  await createTestSession();
  await events.appendBatch(SESSION_ID, [event(0), event(1)]);
  await events.append(SESSION_ID, event(2));

  assert.deepEqual(
    (await events.getEvents(SESSION_ID)).map((row) => row.seq),
    [0, 1, 2],
  );
});

test("appendBatch rejects a stale batch and writes nothing", async () => {
  await createTestSession();
  await events.appendBatch(SESSION_ID, [event(0), event(1)]);

  await assert.rejects(
    () => events.appendBatch(SESSION_ID, [event(1)]),
    SessionContiguityError,
  );

  assert.equal(await events.countEvents(SESSION_ID), 2);
  assert.equal(await events.getNextSeq(SESSION_ID), 2);
});

test("getEvents supports fromSeq and limit windows", async () => {
  await createTestSession();
  await events.appendBatch(SESSION_ID, [event(0), event(1), event(2)]);

  assert.deepEqual(
    (await events.getEvents(SESSION_ID, { fromSeq: 1 })).map(
      (row) => row.seq,
    ),
    [1, 2],
  );
  assert.deepEqual(
    (await events.getEvents(SESSION_ID, { limit: 2 })).map((row) => row.seq),
    [0, 1],
  );
});

test("empty batches are a no-op", async () => {
  await createTestSession();
  await events.appendBatch(SESSION_ID, []);
  assert.equal(await events.countEvents(SESSION_ID), 0);
});

test("concurrent fire-and-forget appends serialize cursor reads", async () => {
  await createTestSession();

  // `Session.append` dispatches without awaiting. All four writes must land in
  // order instead of racing on the same stored cursor.
  await Promise.all([
    events.append(SESSION_ID, event(0)),
    events.append(SESSION_ID, event(1)),
    events.append(SESSION_ID, event(2)),
    events.append(SESSION_ID, event(3)),
  ]);

  assert.deepEqual(
    (await events.getEvents(SESSION_ID)).map((entry) => entry.seq),
    [0, 1, 2, 3],
  );
});

test("session CRUD round-trips metadata without a SQL table", async () => {
  const created = await sessions.createSession({
    id: "session-crud",
    userId: "user-1",
    title: "First",
    slug: "adManager",
  });
  assert.equal(created.title, "First");
  assert.equal(created.slug, "adManager");

  const listed = await sessions.getSessionsByUserId("user-1");
  assert.deepEqual(
    listed.map((session) => session.id),
    ["session-crud"],
  );

  const bySlug = await sessions.getSessionByUserIdAndSlug(
    "user-1",
    "adManager",
  );
  assert.equal(bySlug?.id, "session-crud");

  const updated = await sessions.updateSession("user-1", "session-crud", {
    title: "Renamed",
    hidden: true,
  });
  assert.equal(updated?.title, "Renamed");
  assert.equal(updated?.hidden, true);

  // Hidden sessions disappear from the visible list but not from includeHidden.
  assert.equal((await sessions.getSessionsByUserId("user-1")).length, 0);
  assert.equal(
    (await sessions.getSessionsByUserId("user-1", true)).length,
    1,
  );

  assert.equal(await sessions.deleteSession("user-1", "session-crud"), true);
  assert.equal(await sessions.deleteSession("user-1", "session-crud"), false);
});

test("a session id owned by another user falls back to the default", async () => {
  await sessions.createSession({
    id: "default",
    userId: "user-1",
    title: "Default",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await sessions.createSession({
    id: "other",
    userId: "user-2",
    title: "Other",
    createdAt: "2026-01-02T00:00:00.000Z",
  });

  const resolved = await sessions.getSessionByUserIdAndSessionId(
    "user-1",
    "other",
  );
  assert.equal(resolved?.id, "default");
});

test("resolveSession reuses by slug and can flip visibility", async () => {
  const first = await sessions.resolveSession({
    userId: "user-1",
    slug: "adStrategist",
    title: "Ad Strategist",
    hidden: true,
  });
  const second = await sessions.resolveSession({
    userId: "user-1",
    slug: "adStrategist",
    title: "Ad Strategist",
    hidden: false,
  });

  assert.equal(second.id, first.id);
  assert.equal(second.hidden, false);
});

test("ensureDefaultSessions seeds once and respects the user guard", async () => {
  const guarded = new SessionsRepository({
    backend,
    mintId: () => `guarded-${String(++sequence)}`,
    userExists: () => false,
  });
  await guarded.ensureDefaultSessionsByUserId("user-1", [
    { slug: "adManager", title: "Ad Manager" },
  ]);
  assert.equal((await sessions.getSessionsByUserId("user-1", true)).length, 0);

  await sessions.ensureDefaultSessionsByUserId("user-1", [
    { slug: "adManager", title: "Ad Manager" },
    { slug: "adStrategist", title: "Ad Strategist", hidden: true },
  ]);
  await sessions.ensureDefaultSessionsByUserId("user-1", [
    { slug: "adManager", title: "Ad Manager" },
    { slug: "adStrategist", title: "Ad Strategist", hidden: true },
  ]);

  const stored = await sessions.getSessionsByUserId("user-1", true);
  assert.deepEqual(
    stored.map((session) => session.slug).sort(),
    ["adManager", "adStrategist"],
  );
});

test("listUserSessions orders by latest update and paginates", async () => {
  await sessions.createSession({
    id: "old",
    userId: "user-1",
    title: "Old",
    createdAt: "1970-01-01T00:00:01.000Z",
    updatedAt: "1970-01-01T00:00:01.000Z",
  });
  await sessions.createSession({
    id: "new",
    userId: "user-1",
    title: "New",
    createdAt: "1970-01-01T00:00:01.000Z",
    updatedAt: "1970-01-01T00:00:01.000Z",
  });
  await events.appendBatch("old", [
    {
      ...event(0),
      time: 4_000,
    } as unknown as SessionEvent,
  ]);

  const listed = await sessions.listUserSessions("user-1");
  assert.deepEqual(
    listed.map((snapshot) => snapshot.header.id),
    ["old", "new"],
  );
  assert.equal(listed[0]?.eventCount, 1);

  const page = await sessions.listUserSessions("user-1", { limit: 1 });
  assert.equal(page.length, 1);
});
