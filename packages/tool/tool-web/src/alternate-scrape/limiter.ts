/**
 * FIFO concurrency limiter for crawler submissions.
 *
 * Ad Library pages are expensive (a single crawl holds a browser tab for tens
 * of seconds), so a batch of searches must not open one crawl per query. Work
 * beyond the limit queues in submission order and starts as slots free up.
 * Queued work is dropped when its `AbortSignal` fires so a cancelled turn does
 * not launch crawls it no longer needs.
 *
 * @module @openai-harness/tool-web/src/alternate-scrape/limiter
 */

/** Cancellation error that preserves the signal's own reason when present. */
export function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

/** Observable, signal-aware concurrency gate. */
export interface ConcurrencyLimiter {
  /** Maximum number of tasks allowed to run at once. */
  readonly limit: number;
  /** Tasks currently running. */
  readonly active: number;
  /** Tasks queued for a slot. */
  readonly pending: number;
  /**
   * Run `task` once a slot is free.
   *
   * The returned promise settles with the task's own outcome. When the signal
   * aborts before the task starts, the promise rejects and the task never runs.
   *
   * @param task - work to run while holding one slot.
   * @param signal - optional cancellation for queued work.
   */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/**
 * Create a limiter allowing `limit` concurrent tasks.
 *
 * @param limit - positive integer slot count.
 */
export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `Concurrency limit must be a positive integer, received ${limit}.`,
    );
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const dispatch = (): void => {
    while (active < limit && queue.length > 0) {
      queue.shift()?.();
    }
  };

  return {
    limit,

    get active(): number {
      return active;
    },

    get pending(): number {
      return queue.length;
    },

    run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(abortReason(signal));

      return new Promise<T>((resolve, reject) => {
        let settled = false;
        let started = false;

        const removeFromQueue = (): void => {
          const index = queue.indexOf(start);
          if (index !== -1) queue.splice(index, 1);
        };

        const onAbort = (): void => {
          if (started || settled) return;
          settled = true;
          removeFromQueue();
          signal?.removeEventListener("abort", onAbort);
          reject(abortReason(signal!));
        };

        const start = (): void => {
          if (started || settled) return;
          started = true;
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            settled = true;
            reject(abortReason(signal));
            // This slot was never taken, so another queued task can start.
            dispatch();
            return;
          }

          active += 1;

          let work: Promise<T>;
          try {
            work = task();
          } catch (error) {
            work = Promise.reject(error);
          }

          work.then(
            (value) => {
              if (!settled) {
                settled = true;
                resolve(value);
              }
              active -= 1;
              dispatch();
            },
            (error: unknown) => {
              if (!settled) {
                settled = true;
                reject(error);
              }
              active -= 1;
              dispatch();
            },
          );
        };

        signal?.addEventListener("abort", onAbort, { once: true });

        if (active < limit) start();
        else queue.push(start);
      });
    },
  };
}
