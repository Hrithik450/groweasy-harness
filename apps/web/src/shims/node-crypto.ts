/**
 * `node:crypto` browser shim.
 *
 * The projection layer imports `randomUUID` from the compaction strategy,
 * which is otherwise a pure function. Browsers expose the same call as
 * `globalThis.crypto.randomUUID`, so the shell maps the builtin here instead
 * of excluding the module (which would fail at bundle time).
 */
export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}
