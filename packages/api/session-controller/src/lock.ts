/**
 * In-process FIFO mutex keyed by session id.
 *
 * Why this shape:
 * - Waiters are queued and handed the lock one at a time. The old
 *   `Map<session, Promise>` design let N waiters await the same promise and
 *   resume simultaneously, so several turns could run concurrently.
 * - Waiting is abortable and timeoutable, so a disconnected request cannot
 *   later steal the lock from a live one.
 * - Release is idempotent.
 *
 * Scope: this serializes turns inside a single Node process. Today the host
 * uses a single local file store, which is itself single-instance. If the
 * host moves to multiple instances, swap this for a distributed lease.
 *
 * This is the Session domain's own copy: the package must not import the
 * application's `@/lib` utility that this logic used to live in.
 *
 * @module @openai-harness/session-controller
 */

/** Raised when a queued admission waits longer than its timeout. */
export class SessionBusyError extends Error {
  constructor() {
    super("A turn is already running for this session.");
    this.name = "SessionBusyError";
  }
}

type Release = () => void;

interface Waiter {
  resolve: (release: Release) => void;
  reject: (error: Error) => void;
  detach: () => void;
}

interface LockEntry {
  locked: boolean;
  waiters: Waiter[];
}

const globalForLocks = globalThis as unknown as {
  __sessionLocks?: Map<string, LockEntry>;
};
const locks = (globalForLocks.__sessionLocks ??= new Map<string, LockEntry>());

function makeRelease(sessionId: string, entry: LockEntry): Release {
  let released = false;

  return () => {
    if (released) return;
    released = true;

    const next = entry.waiters.shift();
    if (next) {
      next.detach();
      next.resolve(makeRelease(sessionId, entry));
      return;
    }

    entry.locked = false;
    if (locks.get(sessionId) === entry) {
      locks.delete(sessionId);
    }
  };
}

/** Lock acquisition options. */
export interface AcquireSessionLockOptions {
  /** Abort a queued waiter when the request disconnects. */
  signal?: AbortSignal;
  /** Reject with SessionBusyError after this long. <= 0 waits indefinitely. */
  timeoutMs?: number;
}

/**
 * Acquire the per-session turn lock.
 * @param sessionId - session whose turn is being admitted.
 * @param options - cancellation and wait bound.
 * @returns the idempotent release function.
 * @throws {SessionBusyError} when the wait exceeds `timeoutMs`.
 */
export function acquireSessionLock(
  sessionId: string,
  { signal, timeoutMs = 60_000 }: AcquireSessionLockOptions = {},
): Promise<Release> {
  let entry = locks.get(sessionId);
  if (!entry) {
    entry = { locked: false, waiters: [] };
    locks.set(sessionId, entry);
  }
  const lockEntry = entry;

  if (!lockEntry.locked) {
    lockEntry.locked = true;
    return Promise.resolve(makeRelease(sessionId, lockEntry));
  }

  return new Promise<Release>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function detach() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      signal?.removeEventListener("abort", onAbort);
    }

    function removeFromQueue() {
      const index = lockEntry.waiters.indexOf(waiter);
      if (index !== -1) lockEntry.waiters.splice(index, 1);
    }

    function fail(error: Error) {
      removeFromQueue();
      detach();
      reject(error);
    }

    function onAbort() {
      fail(new Error("Session lock wait aborted"));
    }

    const waiter: Waiter = {
      detach,
      resolve: (release) => {
        detach();
        resolve(release);
      },
      reject: (error) => {
        detach();
        reject(error);
      },
    };

    if (signal?.aborted) {
      reject(new Error("Session lock wait aborted"));
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        fail(new SessionBusyError());
      }, timeoutMs);
      (timer as { unref?: () => void }).unref?.();
    }

    lockEntry.waiters.push(waiter);
  });
}
