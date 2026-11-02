/**
 * Project-local filesystem roots for runtime state.
 *
 * The reference harness resolves user data from the OS home directory because
 * one machine can host many unrelated harness accounts. This project is a
 * single deployed checkout instead, so every durable byte stays inside it:
 * session logs, attachment blobs, scraper caches, and scratch files all live
 * under {@link dataRoot}.
 *
 * Paths derive from this module's location rather than `process.cwd()`, so
 * starting the gateway from a subdirectory, the repository root, or a test's
 * temporary directory never changes where data is written. The package is
 * imported by workspaces below the root, so the derivation must stay correct
 * for both `src/` (tests, source imports) and `lib/` (built output).
 *
 * - `DATA_ROOT` — optional override for the data directory itself. Relative
 *   values resolve against the project root.
 *
 * @module @openai-harness/paths
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Directory of this module: `packages/util/paths/src` or
 * `packages/util/paths/lib`. Both sit four levels below the repository root.
 */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Repository root: the directory holding `package.json` and `apps/`. */
export const PROJECT_ROOT = path.resolve(moduleDir, "../../../..");

/**
 * Resolve a configured path against the project root.
 *
 * @param value - absolute or project-relative path.
 * @returns the absolute path.
 */
export function fromProjectRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

/**
 * Root of all runtime state for this project.
 *
 * @returns `$DATA_ROOT` when set, otherwise `<project>/data`.
 */
export function dataRoot(): string {
  const override = process.env.DATA_ROOT?.trim();
  return override !== undefined && override.length > 0
    ? fromProjectRoot(override)
    : path.join(PROJECT_ROOT, "data");
}

/**
 * Join segments under the data root.
 *
 * @param segments - path segments below the data root.
 * @returns the absolute path.
 */
export function dataPath(...segments: string[]): string {
  return path.join(dataRoot(), ...segments);
}
