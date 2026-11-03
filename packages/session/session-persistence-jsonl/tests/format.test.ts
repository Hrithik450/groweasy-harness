import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionSeq,
  type SessionEvent,
  type SessionHeader,
} from "@openai-harness/session";
import {
  JsonlSessionContiguityError,
  JsonlSessionPersistence,
  SessionAlreadyExistsError,
  SessionAlreadyOwnedError,
  encodeSegment,
  logPath,
  scanLog,
  sessionDir,
  type JsonlSessionMetadataInput,
} from "../src/index.ts";

const HEADER: SessionHeader = {
  version: SESSION_FORMAT_VERSION,
  id: SessionId("session-1"),
  userId: "user-1",
  createdAt: 1_000,
};

const METADATA: JsonlSessionMetadataInput = {
  title: "Ad Manager",
  slug: "adManager",
  hidden: false,
  updatedAt: 1_000,
};

let root: string;
let store: JsonlSessionPersistence | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jsonl-session-"));
});

afterEach(async () => {
  await store?.close();
  store = undefined;
  await rm(root, { recursive: true, force: true });
});

function event(seq: number, type: "turn/start" | "turn/end" = "turn/start"): SessionEvent {
  return {
    type,
    seq: SessionSeq(seq),
    time: 1_000 + seq,
    data: { turn: 1 },
  } as unknown as SessionEvent;
}

function newStore(): JsonlSessionPersistence {
  store = new JsonlSessionPersistence({ root, now: () => 5_000 });
  return store;
}

test("create publishes one header-first generation file", async () => {
  const persistence = newStore();
  await persistence.create(HEADER, METADATA);

  const path = logPath(root, undefined, HEADER.id);
  assert.equal(
    path,
    join(sessionDir(root, undefined, HEADER.id), "session.v1.jsonl"),
  );

  const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0] as string), {
    type: "session",
    version: 1,
    id: "session-1",
    createdAt: 1_000,
    userId: "user-1",
    isSeeded: false,
    delegationDepth: 0,
  });
  assert.deepEqual(JSON.parse(lines[1] as string), {
    type: "session/metadata",
    title: "Ad Manager",
    slug: "adManager",
    hidden: false,
    updatedAt: 1_000,
  });

  const listed = await persistence.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.title, "Ad Manager");
  assert.equal(listed[0]?.eventCount, 0);

  // Atomic publish leaves only the generation file behind.
  const entries = await readdir(sessionDir(root, undefined, HEADER.id));
  // The lease document lives beside the log; no temporary publish file remains.
  assert.deepEqual(entries.sort(), ["session.lock", "session.v1.jsonl"]);
});

test("append enforces dense seq and metadata records do not consume a seq", async () => {
  const persistence = newStore();
  await persistence.create(HEADER, METADATA);

  await persistence.append(HEADER.id, [event(0), event(1)]);
  await persistence.updateMetadata(HEADER.id, {
    title: "Renamed",
    hidden: true,
  });
  await persistence.append(HEADER.id, [event(2, "turn/end")]);

  const record = await persistence.read(HEADER.id);
  assert.ok(record);
  assert.deepEqual(
    record.events.map((entry) => entry.seq),
    [0, 1, 2],
  );
  assert.equal(record.nextSeq, 3);
  assert.equal(record.title, "Renamed");
  assert.equal(record.hidden, true);
});

test("a stale batch is refused and writes nothing", async () => {
  const persistence = newStore();
  await persistence.create(HEADER, METADATA);
  await persistence.append(HEADER.id, [event(0), event(1)]);

  await assert.rejects(
    () => persistence.append(HEADER.id, [event(1)]),
    JsonlSessionContiguityError,
  );

  const record = await persistence.read(HEADER.id);
  assert.equal(record?.eventCount, 2);
  assert.equal(record?.nextSeq, 2);
});

test("a torn tail is ignored on read and truncated before the next append", async () => {
  const persistence = newStore();
  await persistence.create(HEADER, METADATA);
  await persistence.append(HEADER.id, [event(0)]);

  const path = logPath(root, undefined, HEADER.id);
  const torn = '{"type":"turn/start","seq":1,"time":1001,"data":{"turn":1';
  await writeFile(path, torn, { flag: "a" });

  const snapshot = await persistence.stat(HEADER.id);
  assert.equal(snapshot?.eventCount, 1);

  await persistence.append(HEADER.id, [event(1, "turn/end")]);
  const record = await persistence.read(HEADER.id);
  assert.deepEqual(
    record?.events.map((entry) => entry.seq),
    [0, 1],
  );

  // No torn fragment survives in the committed bytes.
  const text = await readFile(path, "utf8");
  assert.equal(text.endsWith("\n"), true);
  assert.equal(text.includes('"data":{"turn":1\n'), false);
});

test("creating the same identity twice is refused", async () => {
  const persistence = newStore();
  await persistence.create(HEADER, METADATA);
  await assert.rejects(
    () => persistence.create(HEADER, METADATA),
    SessionAlreadyExistsError,
  );
});

test("the cross-process lease excludes a second writer until close", async () => {
  const first = new JsonlSessionPersistence({ root });
  const second = new JsonlSessionPersistence({ root });
  try {
    await first.create(HEADER, METADATA);
    await assert.rejects(
      () => second.append(HEADER.id, [event(0)]),
      SessionAlreadyOwnedError,
    );

    await first.close();
    await second.append(HEADER.id, [event(0)]);
    const record = await second.read(HEADER.id);
    assert.equal(record?.eventCount, 1);
  } finally {
    await first.close().catch(() => undefined);
    await second.close().catch(() => undefined);
  }
});

test("list discovers every session directory under the root", async () => {
  const persistence = newStore();
  const secondHeader: SessionHeader = {
    ...HEADER,
    id: SessionId("session-2"),
    createdAt: 2_000,
  };
  await persistence.create(HEADER, METADATA);
  await persistence.create(secondHeader, {
    ...METADATA,
    title: "Second",
    slug: null,
  });

  const listed = await persistence.list();
  assert.deepEqual(
    listed.map((entry) => entry.title).sort(),
    ["Ad Manager", "Second"],
  );
});

test("encodeSegment neutralizes traversal and keeps one path segment", () => {
  const encoded = encodeSegment("../session/one");
  assert.equal(encoded.includes("/"), false);
  // Embedded dots stay literal; the separator is escaped, so the result is
  // one segment rather than a parent-directory traversal.
  assert.equal(encoded, "..~002Fsession~002Fone");

  const dir = sessionDir(root, undefined, "../session/one");
  assert.equal(dir.startsWith(join(root, "_no-cwd")), true);
});

test("legacy metadata with an extra key still parses and the key is dropped", () => {
  const header = JSON.stringify({
    type: "session",
    version: 1,
    id: "session-1",
    createdAt: 1_000,
    userId: "user-1",
    isSeeded: false,
    delegationDepth: 0,
  });
  const legacyMetadata = JSON.stringify({
    type: "session/metadata",
    title: "Ad Manager",
    slug: "adManager",
    hidden: false,
    updatedAt: 1_000,
    extra: { detailBar: { type: "adManager" } },
  });

  const scan = scanLog(Buffer.from(`${header}\n${legacyMetadata}\n`, "utf8"));
  assert.equal(scan.metadata.title, "Ad Manager");
  assert.equal(Object.hasOwn(scan.metadata, "extra"), false);
});

test("scanLog reports the committed offset before a torn tail", () => {
  const header = JSON.stringify({
    type: "session",
    version: 1,
    id: "session-1",
    createdAt: 1_000,
    userId: "user-1",
    isSeeded: false,
    delegationDepth: 0,
  });
  const first = JSON.stringify({ type: "turn/start", seq: 0, time: 1, data: {} });
  const torn = '{"type":"turn/start","seq":1';
  const buffer = Buffer.from(`${header}\n${first}\n${torn}`, "utf8");

  const scan = scanLog(buffer);
  assert.equal(scan.header.id, "session-1");
  assert.equal(scan.nextSeq, 1);
  assert.equal(scan.committedBytes, Buffer.byteLength(`${header}\n${first}\n`));
});
