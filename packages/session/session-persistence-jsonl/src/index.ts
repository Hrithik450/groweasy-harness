/**
 * Append-only JSONL session provider.
 *
 * A session is one directory under the configured root holding a single
 * header-first `session.vN.jsonl` generation file:
 *
 * - creation writes a temporary file, fsyncs it, and publishes it with
 *   `link(2)` (never `rename`), so an existing log is never clobbered and a
 *   reader sees either no file or the complete header + metadata records;
 * - appends write complete JSONL records at the end and fsync them; a failed
 *   write is truncated back to the previous size;
 * - a write handle holds a cross-process `session.lock` (§lease.ts) and writes
 *   are serialized per session inside the process;
 * - `list()` discovers sessions by scanning the root; metadata is folded from
 *   the header plus the last `session/metadata` record.
 *
 * Plaintext `.jsonl` is the only physical encoding this app writes; a
 * compressed `.jsonl.zstd` peer is refused explicitly.
 *
 * @module @openai-harness/session-persistence-jsonl
 */

import {
  link,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat as statFile,
  truncate,
  unlink,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  type SessionEvent,
  type SessionHeader,
} from "@openai-harness/session";

import {
  assertContiguous,
  eventLines,
  logPath,
  parseGenerationLogFilename,
  scanLog,
  sealEvent,
  sessionDir,
  toHeaderLine,
  toMetadataLine,
  JsonlSessionCorruptionError,
  JsonlSessionFormatError,
  type SessionMetadataState,
} from "./format.ts";
import {
  SessionAlreadyExistsError,
  SessionAlreadyOwnedError,
  SessionNotFoundError,
  SessionWriteLease,
} from "./lease.ts";

export * from "./format.ts";
export * from "./lease.ts";

/** Provider configuration. */
export interface JsonlSessionPersistenceConfig {
  /** Root directory holding one project directory per session group. */
  readonly root: string;
  /** Clock override, Unix epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Values written with a new session. */
export interface JsonlSessionMetadataInput {
  readonly title: string;
  readonly slug: string | null;
  readonly hidden: boolean;
  /** Non-negative safe integer Unix epoch milliseconds. */
  readonly updatedAt: number;
}

/** One session as returned by `stat`/`list` (no event body). */
export interface JsonlSessionSnapshot {
  readonly header: SessionHeader;
  readonly title: string;
  readonly slug: string | null;
  readonly hidden: boolean;
  /** Non-negative safe integer Unix epoch milliseconds. */
  readonly updatedAt: number;
  readonly eventCount: number;
  readonly sizeBytes: number;
}

/** One session with its committed event body. */
export interface JsonlSessionRecord extends JsonlSessionSnapshot {
  readonly events: readonly SessionEvent[];
  readonly nextSeq: number;
}

/** The result of resolving a session directory to its current generation. */
interface ResolvedLog {
  readonly dir: string;
  readonly path: string;
  readonly version: number;
}

/** Whether an fs error means "absent". */
function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/** fsync a directory so a publish survives a crash on POSIX filesystems. */
async function syncDirectory(dir: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(dir, "r");
    await handle.sync();
  } catch {
    // Directory fsync is unsupported on some platforms (notably Windows).
    // The file itself was already fsynced; publication ordering is the only
    // weaker guarantee there.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/** Write and fsync one temporary file. */
async function writeSyncedTempFile(
  path: string,
  text: string,
): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Append text at the end of a file, fsyncing on success and truncating back to
 * the previous size on failure.
 */
async function appendSyncedText(
  path: string,
  text: string,
  previousSize: number,
): Promise<void> {
  const handle = await open(path, "a");
  let closed = false;
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    closed = true;
    await truncate(path, previousSize).catch(() => undefined);
    throw error;
  } finally {
    if (!closed) await handle.close().catch(() => undefined);
  }
}

/** Append one metadata record. */
async function appendSyncedMetadata(
  path: string,
  metadata: SessionMetadataState,
  previousSize: number,
): Promise<void> {
  await appendSyncedText(
    path,
    `${JSON.stringify(toMetadataLine(metadata))}\n`,
    previousSize,
  );
}

/**
 * One process-wide JSONL session store.
 *
 * `create` materializes immediately, so a newly created session is visible to
 * every process's `list()` before the call returns. Write handles are kept for
 * the life of the store (one writer per session), matching the reference
 * provider's one-active-writer claim; `close()` releases every lease.
 */
export class JsonlSessionPersistence {
  private readonly root: string;
  private readonly now: () => number;
  private readonly chains = new Map<string, Promise<void>>();
  private readonly leases = new Map<string, SessionWriteLease>();
  private closed = false;

  /**
   * @param config - session root and optional clock.
   */
  constructor(config: JsonlSessionPersistenceConfig) {
    if (!config.root) throw new Error("JSONL session root is required");
    this.root = config.root;
    this.now = config.now ?? Date.now;
  }

  /**
   * Create one session log.
   *
   * The header and the initial metadata record are published atomically. A
   * session id that already has a log is refused with
   * {@link SessionAlreadyExistsError}.
   *
   * @param header - immutable session identity.
   * @param metadata - initial mutable metadata.
   */
  async create(
    header: SessionHeader,
    metadata: JsonlSessionMetadataInput,
  ): Promise<void> {
    // Validate before touching the medium.
    const headerLine = toHeaderLine(header);
    const metadataLine = toMetadataLine({
      title: metadata.title,
      slug: metadata.slug,
      hidden: metadata.hidden,
      updatedAt: metadata.updatedAt,
    });
    const text = `${JSON.stringify(headerLine)}\n${JSON.stringify(metadataLine)}\n`;
    const dir = sessionDir(this.root, undefined, header.id);
    const path = logPath(this.root, undefined, header.id);

    await this.enqueue(String(header.id), async () => {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      try {
        await this.acquireLease(String(header.id), dir);
      } catch (error) {
        // Another process owns the log: if the identity already exists, the
        // caller's create race is an "already exists", not "already owned".
        const exists = await statFile(path).then(
          () => true,
          () => false,
        );
        if (exists) throw new SessionAlreadyExistsError(header.id);
        throw error;
      }
      try {
        await statFile(path).then(
          () => {
            throw new SessionAlreadyExistsError(header.id);
          },
          (error: unknown) => {
            if (!isMissing(error)) throw error;
          },
        );

        const temp = join(
          dir,
          `.session.${String(process.pid)}.${randomUUID()}.tmp`,
        );
        try {
          await writeSyncedTempFile(temp, text);
          try {
            await link(temp, path);
          } catch (error) {
            if ((error as NodeJS.ErrnoException | null)?.code === "EEXIST") {
              throw new SessionAlreadyExistsError(header.id);
            }
            throw error;
          }
          await syncDirectory(dir);
        } finally {
          await unlink(temp).catch(() => undefined);
        }
      } catch (error) {
        // A failed create must not leave the process holding the session.
        await this.releaseLease(String(header.id));
        throw error;
      }
    });
  }

  /**
   * Read one session with its committed event prefix.
   * @param id - session id.
   * @returns the session, or `undefined` when no log exists.
   */
  async read(id: SessionId | string): Promise<JsonlSessionRecord | undefined> {
    const resolved = await this.resolveLog(id);
    if (resolved === undefined) return undefined;
    const { snapshot, events, nextSeq } = await this.readResolved(resolved);
    return { ...snapshot, events, nextSeq };
  }

  /**
   * Observe one session without its event body.
   * @param id - session id.
   * @returns the snapshot, or `undefined` when no log exists.
   */
  async stat(
    id: SessionId | string,
  ): Promise<JsonlSessionSnapshot | undefined> {
    const resolved = await this.resolveLog(id);
    if (resolved === undefined) return undefined;
    const { snapshot } = await this.readResolved(resolved);
    return snapshot;
  }

  /**
   * The stored next sequence, or `0` when the session does not exist.
   * @param id - session id.
   */
  async getNextSeq(id: SessionId | string): Promise<number> {
    return (await this.stat(id))?.eventCount ?? 0;
  }

  /**
   * List every session visible under the root.
   *
   * Discovery walks each project directory under the root; only canonical
   * generation filenames identify sessions. A corrupt or foreign log is
   * surfaced, never silently skipped.
   */
  async list(): Promise<JsonlSessionSnapshot[]> {
    const sessions: JsonlSessionSnapshot[] = [];
    let projectEntries;
    try {
      projectEntries = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return sessions;
      throw error;
    }

    for (const project of projectEntries) {
      if (!project.isDirectory()) continue;
      const projectPath = join(this.root, project.name);
      let sessionEntries;
      try {
        sessionEntries = await readdir(projectPath, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      for (const session of sessionEntries) {
        if (!session.isDirectory()) continue;
        const dir = join(projectPath, session.name);
        const resolved = await resolveGeneration(dir);
        if (resolved === undefined) continue;
        const { snapshot } = await this.readResolved(resolved);
        sessions.push(snapshot);
      }
    }

    return sessions;
  }

  /**
   * Append one contiguous event batch.
   *
   * The batch's first `seq` must equal the stored next sequence. A torn tail
   * left by a previous crash is truncated to the last complete record before
   * the batch is written.
   *
   * @param id - session id.
   * @param events - contiguous batch in sequence order.
   */
  async append(
    id: SessionId | string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    if (events.length === 0) return;
    const key = String(id);
    await this.enqueue(key, async () => {
      const resolved = await this.resolveRequired(key);
      await this.acquireLease(key, resolved.dir);
      const buffer = await readFile(resolved.path);
      const scan = scanLog(buffer);
      if (String(scan.header.id) !== key) {
        throw new JsonlSessionCorruptionError(
          `stored session identity mismatch: requested "${key}", header contains "${String(scan.header.id)}"`,
        );
      }
      assertContiguous(key, events, scan.nextSeq);
      await this.truncateTornTail(resolved.path, buffer, scan.committedBytes);
      const { size } = await statFile(resolved.path);
      await appendSyncedText(resolved.path, `${eventLines(events)}\n`, size);
    });
  }

  /**
   * Append a metadata record; the last metadata record wins.
   *
   * Metadata updates never consume an event sequence and never rewrite the
   * header, so the log stays strictly append-only.
   *
   * @param id - session id.
   * @param patch - defined fields replace the current values.
   * @returns the updated snapshot, or `undefined` when the session is absent.
   */
  async updateMetadata(
    id: SessionId | string,
    patch: {
      title?: string;
      slug?: string | null;
      hidden?: boolean;
      updatedAt?: number;
    },
  ): Promise<JsonlSessionSnapshot | undefined> {
    const key = String(id);
    const existing = await this.stat(key);
    if (existing === undefined) return undefined;

    return this.enqueue(key, async () => {
      const resolved = await this.resolveRequired(key);
      await this.acquireLease(key, resolved.dir);
      const buffer = await readFile(resolved.path);
      const scan = scanLog(buffer);
      const current = scan.metadata;
      const next: SessionMetadataState = {
        title: patch.title ?? current.title,
        slug: patch.slug !== undefined ? patch.slug : current.slug,
        hidden: patch.hidden ?? current.hidden,
        updatedAt: patch.updatedAt ?? this.now(),
      };
      await this.truncateTornTail(resolved.path, buffer, scan.committedBytes);
      const { size } = await statFile(resolved.path);
      await appendSyncedMetadata(resolved.path, next, size);
      return this.snapshotFrom(scan.header, next, scan.nextSeq, 0n);
    });
  }

  /**
   * Delete one session directory.
   * @param id - session id.
   * @returns whether a directory existed.
   */
  async delete(id: SessionId | string): Promise<boolean> {
    const key = String(id);
    return this.enqueue(key, async () => {
      const dir = sessionDir(this.root, undefined, key);
      const existed = await statFile(dir).then(
        () => true,
        (error: unknown) => {
          if (isMissing(error)) return false;
          throw error;
        },
      );
      await this.releaseLease(key);
      if (existed) await rm(dir, { recursive: true, force: true });
      return existed;
    });
  }

  /**
   * Durability barrier: wait for every queued mutation. Each append and
   * metadata write already fsyncs before resolving, so this is a chain drain.
   */
  async flush(): Promise<void> {
    await Promise.all([...this.chains.values()]);
  }

  /**
   * Release every write lease and reject further mutations. Idempotent.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.chains.values()]);
    const leases = [...this.leases.values()];
    this.leases.clear();
    await Promise.allSettled(leases.map((lease) => lease.release()));
  }

  /** Serialize mutations per session. */
  private enqueue<T>(id: string, job: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error("JSONL session persistence is closed"));
    }
    const previous = this.chains.get(id) ?? Promise.resolve();
    const run = previous.then(job, job);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(id, settled);
    void settled.then(() => {
      if (this.chains.get(id) === settled) this.chains.delete(id);
    });
    return run;
  }

  /** Acquire the session's write lease once per process. */
  private async acquireLease(id: string, dir: string): Promise<void> {
    if (this.leases.has(id)) return;
    const lease = await SessionWriteLease.acquire(dir, id);
    this.leases.set(id, lease);
  }

  /** Release the session's write lease, if held. */
  private async releaseLease(id: string): Promise<void> {
    const lease = this.leases.get(id);
    if (lease === undefined) return;
    this.leases.delete(id);
    await lease.release();
  }

  /** Resolve a session's current log, or `undefined` when absent. */
  private async resolveLog(
    id: SessionId | string,
  ): Promise<ResolvedLog | undefined> {
    return resolveGeneration(sessionDir(this.root, undefined, id));
  }

  /** Resolve a session's current log or throw {@link SessionNotFoundError}. */
  private async resolveRequired(id: string): Promise<ResolvedLog> {
    const resolved = await this.resolveLog(id);
    if (resolved === undefined) throw new SessionNotFoundError(id);
    return resolved;
  }

  /** Read and parse one resolved log. */
  private async readResolved(resolved: ResolvedLog): Promise<{
    snapshot: JsonlSessionSnapshot;
    events: SessionEvent[];
    nextSeq: number;
  }> {
    const buffer = await readFile(resolved.path);
    const scan = scanLog(buffer);
    if (String(scan.header.id) !== idFromDirectory(resolved.dir)) {
      throw new JsonlSessionCorruptionError(
        `stored session identity mismatch: directory "${resolved.dir}" does not match header "${String(scan.header.id)}"`,
      );
    }
    const events = scan.events.map(sealEvent);
    const lastTime = events.at(-1)?.time ?? 0;
    const updatedAt = Math.max(
      scan.metadata.updatedAt,
      scan.header.createdAt,
      Number.isFinite(lastTime) ? lastTime : 0,
    );
    const { size } = await statFile(resolved.path);
    return {
      snapshot: {
        ...this.snapshotFrom(
          scan.header,
          { ...scan.metadata, updatedAt },
          scan.nextSeq,
          size,
        ),
      },
      events,
      nextSeq: scan.nextSeq,
    };
  }

  /** Assemble a snapshot from a folded header and metadata. */
  private snapshotFrom(
    header: SessionHeader,
    metadata: SessionMetadataState,
    eventCount: number,
    sizeBytes: bigint | number,
  ): JsonlSessionSnapshot {
    return {
      header,
      title: metadata.title,
      slug: metadata.slug,
      hidden: metadata.hidden,
      updatedAt: metadata.updatedAt,
      eventCount,
      sizeBytes: Number(sizeBytes),
    };
  }

  /** Truncate a torn trailing record so the next append starts cleanly. */
  private async truncateTornTail(
    path: string,
    buffer: Buffer,
    committedBytes: number,
  ): Promise<void> {
    if (committedBytes < buffer.length) {
      await truncate(path, committedBytes);
    }
  }
}

/**
 * Resolve the highest canonical generation in one session directory.
 * @param dir - session directory.
 * @returns the selected generation, or `undefined` when none exists.
 */
async function resolveGeneration(
  dir: string,
): Promise<ResolvedLog | undefined> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }

  let best: { version: number; path: string } | undefined;
  let compressed = false;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".jsonl.zstd")) {
      compressed = true;
      continue;
    }
    const version = parseGenerationLogFilename(entry.name);
    if (version === undefined) continue;
    if (best === undefined || version > best.version) {
      best = { version, path: join(dir, entry.name) };
    }
  }

  if (best === undefined) {
    if (compressed) {
      throw new JsonlSessionFormatError(
        `session log in "${dir}" is zstd-compressed, but this build reads plaintext .jsonl`,
      );
    }
    return undefined;
  }
  if (best.version !== SESSION_FORMAT_VERSION) {
    throw new JsonlSessionFormatError(
      `session log in "${dir}" uses format v${best.version}, but this build reads only v${SESSION_FORMAT_VERSION}`,
    );
  }
  return { dir, path: best.path, version: best.version };
}

/** Decode the session directory's escaped id for an identity cross-check. */
function idFromDirectory(dir: string): string {
  const escaped = dir.slice(dir.lastIndexOf("/") + 1);
  let raw = "";
  for (let index = 0; index < escaped.length; index += 1) {
    const char = escaped[index];
    if (char !== "~") {
      raw += char;
      continue;
    }
    const code = Number.parseInt(escaped.slice(index + 1, index + 5), 16);
    if (!Number.isFinite(code)) return escaped;
    raw += String.fromCharCode(code);
    index += 4;
  }
  return raw;
}
