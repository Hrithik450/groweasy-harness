/**
 * Project-local scratch roots used by the host-facing attachment facade.
 *
 * Durable attachment bytes live in Cloudflare R2; this module only resolves
 * the transient materialization directory used by tools that need a real
 * local file. The repository root is derived from this module's location
 * rather than `process.cwd()`, so starting the host from a package directory
 * or a test's temporary directory never changes where scratch files land.
 *
 * - `DATA_ROOT` — optional override for the data directory itself. Relative
 *   values resolve against the repository root.
 *
 * @module @openai-harness/attachment-r2/paths
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory of this module: `packages/attachment/attachment-r2/src`. */
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
 * Join segments under the project data root.
 *
 * @param segments - path segments below the data root.
 * @returns the absolute path; `$DATA_ROOT` when set, otherwise `<project>/data`.
 */
export function dataPath(...segments: string[]): string {
  const override = process.env.DATA_ROOT?.trim();
  const root =
    override !== undefined && override.length > 0
      ? fromProjectRoot(override)
      : path.join(PROJECT_ROOT, "data");
  return path.join(root, ...segments);
}
