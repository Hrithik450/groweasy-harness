/**
 * Project-local filesystem roots for the Google account user store.
 *
 * The reference harness resolves its user/workspace data from the OS home
 * directory because one machine user may host many unrelated deployments.
 * This gateway is a single deployed project instead, so every durable byte
 * stays inside the checkout: the root mirrors `apps/gateway/src/lib/paths.ts`
 * and `@openai-harness/attachment-r2/paths` rather than `$HOME`.
 *
 * The repository root is derived from this module's location rather than
 * `process.cwd()`, so starting the gateway from a package directory or a
 * test's temporary directory never changes where users are written.
 *
 * - `DATA_ROOT` — optional override for the data directory itself. Relative
 *   values resolve against the repository root.
 *
 * @module @openai-harness/google-account/paths
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory of this module: `packages/credentials/google-account/src`. */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Repository root: the directory holding `package.json` and `packages/`. */
const PROJECT_ROOT = path.resolve(moduleDir, "../../../..");

/**
 * Resolve a configured path against the repository root.
 *
 * @param value - absolute or repository-relative path.
 * @returns the absolute path.
 */
function fromProjectRoot(value: string): string {
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

/**
 * Resolve the directory that holds one tenant directory per user.
 *
 * The layout inside it is owned by `UserStore`:
 * `<usersRoot>/<uuid>/user.json` plus `<usersRoot>/.index/google-sub/<sub>`.
 *
 * @returns `$DATA_ROOT/users` when set, otherwise `<project>/data/users`.
 */
export function resolveUsersRoot(): string {
  return dataPath("users");
}
