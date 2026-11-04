/**
 * Absolute deployment paths. A model quoting `/Users/…/openai-harness/...`
 * hands an attacker the repository layout and, often, file names.
 *
 * Ordinary URLs are untouched: only local absolute prefixes match.
 *
 * @module @openai-harness/guardrails
 */

import type { GuardCheck } from "../types";
import { scanRules, withoutOverlaps, type Rule } from "./match";

const RULES: readonly Rule[] = [
  {
    // `/Users/<name>/.../openai-harness/...` and `/home/<name>/.../deepseek-harness/...`
    pattern:
      /\/(?:Users|home)\/[^\s"'`)]*?(?:openai-harness|deepseek-harness)\b[^\s"'`)]*/g,
    replacement: "[redacted path]",
  },
  {
    // A checkout path whose repository name is not one of the two above.
    pattern: /\/Users\/[^\s/"'`)]+\/Programming\/[^\s"'`)]+/g,
    replacement: "[redacted path]",
  },
];

/** Redacts local checkout paths; URLs and relative paths are left alone. */
export const internalPaths: GuardCheck = {
  name: "internal-paths",
  scan: (text) => withoutOverlaps(scanRules(text, RULES)),
};
