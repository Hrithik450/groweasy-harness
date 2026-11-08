/**
 * Local filesystem skill provider plugin.
 *
 * The reference harness names this package `skill-filesystem`. It discovers
 * directory-bundle and flat Markdown skills from configured roots. This
 * repository keeps the reusable discovery/loading class in
 * `@openai-harness/skill` (the gateway's application shim can only resolve
 * already-installed packages); this plugin mounts one provider instance on the
 * Cordis `skills` service.
 *
 * @module @openai-harness/skill-filesystem
 */

import type { Context } from "@deepseek-ai/cordis";
import { BundledFileSystemSkillProvider } from "@openai-harness/skill";

export { BundledFileSystemSkillProvider } from "@openai-harness/skill";

/** Cordis plugin name. */
export const name = "skill-filesystem";
/** The skills service must exist before the provider can register. */
export const inject = ["skills"];

/** Provider configuration. */
export interface Config {
  /**
   * Root directory scanned recursively for `SKILL.md`. Defaults to this
   * module's directory, matching the provider's own default.
   */
  rootDir?: string;
}

/**
 * Mount the filesystem provider on `ctx.skills`.
 *
 * @param ctx - context carrying the skill service.
 * @param config - optional discovery root.
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.effect(() =>
    ctx.skills.registerProvider(
      new BundledFileSystemSkillProvider(config.rootDir),
    ),
  );
}
