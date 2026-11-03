/**
 * Cross-process write-ownership lock for one session's artifact directory,
 * held for the life of the process's write handle.
 *
 * The reference provider arbitrates with a non-blocking kernel `flock(2)`.
 * Node exposes no portable `flock`, so this implementation uses the same
 * observable contract with an exclusive-create lock document
 * (`session.lock`, written with `O_EXCL`):
 *
 * - Contention maps to {@link SessionAlreadyOwnedError}.
 * - The document carries the owner pid; a lock whose pid is no longer alive
 *   is stale and is reclaimed, so a crashed holder never blocks a successor.
 * - Release removes the document only when it still carries this holder's
 *   token. Readers never touch the lock.
 *
 * The lock file lives beside the log so the whole session directory remains
 * the unit of ownership and deletion.
 *
 * @module @openai-harness/session-persistence-jsonl
 */

import { open, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { SessionId } from "@openai-harness/session";

/** Base name of the lock document inside a session's directory. */
export const LEASE_FILENAME = "session.lock";

/** The session already has an active write owner. */
export class SessionAlreadyOwnedError extends Error {
  constructor(readonly sessionId: SessionId | string) {
    super(`session "${String(sessionId)}" is already owned by an active write handle`);
    this.name = "SessionAlreadyOwnedError";
  }
}

/** The durable session identity already exists. */
export class SessionAlreadyExistsError extends Error {
  constructor(readonly sessionId: SessionId | string) {
    super(`session "${String(sessionId)}" already exists`);
    this.name = "SessionAlreadyExistsError";
  }
}

/** The durable session identity has no log visible to this caller. */
export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: SessionId | string) {
    super(`session "${String(sessionId)}" not found`);
    this.name = "SessionNotFoundError";
  }
}

interface LeaseDocument {
  readonly token: string;
  readonly pid: number;
  readonly acquiredAt: number;
}

/** Whether a pid still names a live process. */
function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code === "EPERM";
  }
}

/** Read and parse one lease document; malformed documents are stale. */
async function readLease(path: string): Promise<LeaseDocument | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.token !== "string" ||
      typeof record.pid !== "number" ||
      typeof record.acquiredAt !== "number"
    ) {
      return undefined;
    }
    return {
      token: record.token,
      pid: record.pid,
      acquiredAt: record.acquiredAt,
    };
  } catch {
    return undefined;
  }
}

/**
 * One held write lock. Constructed only by {@link SessionWriteLease.acquire}.
 */
export class SessionWriteLease {
  private released = false;

  private constructor(
    private readonly path: string,
    private readonly document: LeaseDocument,
  ) {}

  /**
   * Acquire the session directory's write lock.
   * @param dir - the session's artifact directory (created by the caller).
   * @param id - the session the lock guards, for error identities.
   * @returns the held lock.
   * @throws {SessionAlreadyOwnedError} while another live holder owns it.
   */
  static async acquire(
    dir: string,
    id: SessionId | string,
  ): Promise<SessionWriteLease> {
    const path = join(dir, LEASE_FILENAME);

    // Bounded retry: a releasing holder may unlink between our EEXIST and our
    // stale check, and a stale document may be reclaimed by a concurrent peer.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const document: LeaseDocument = {
        token: randomUUID(),
        pid: process.pid,
        acquiredAt: Date.now(),
      };
      try {
        const handle = await open(path, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify(document), "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        return new SessionWriteLease(path, document);
      } catch (error) {
        if ((error as NodeJS.ErrnoException | null)?.code !== "EEXIST") {
          throw error;
        }
      }

      const existing = await readLease(path);
      if (existing !== undefined && isProcessAlive(existing.pid)) {
        throw new SessionAlreadyOwnedError(id);
      }
      // Stale or unreadable lock: reclaim it. Losing this race to a peer just
      // sends us around the loop, where the fresh document reads as live.
      await rm(path, { force: true });
    }

    throw new SessionAlreadyOwnedError(id);
  }

  /**
   * Release the lock by removing the document when it still carries this
   * holder's token. Idempotent.
   */
  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    const current = await readLease(this.path);
    if (current?.token === this.document.token) {
      await rm(this.path, { force: true });
    }
  }
}
