/**
 * Fixed-window tool-call limiter.
 *
 * OWASP LLM10 (unbounded consumption) requires rate limits and quotas, and an
 * agent that loops can spend a customer's generation budget in seconds. The
 * limiter is process-local and per session: a restart forgets the window, which
 * is acceptable for a single-host harness and keeps the package dependency
 * free. Deployments that need shared quotas should supply their own limiter.
 *
 * @module @openai-harness/guardrails
 */

/** One fixed-window counter per key. */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  /**
   * Whether a call may proceed, recording it when it may.
   *
   * @param key - limiter namespace (for example `sessionId:toolName`).
   * @param limit - allowed calls per window.
   * @param windowMs - window length in milliseconds.
   * @param now - injectable clock for tests.
   * @returns true when the call is within the window's allowance.
   */
  allow(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): boolean {
    if (limit <= 0) return true;
    const cutoff = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
