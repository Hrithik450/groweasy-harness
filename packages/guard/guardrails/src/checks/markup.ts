/**
 * Output-injection vectors: terminal escapes, executable or content-loading
 * HTML tags, and dangerous URL schemes.
 *
 * The goal is neutralization, not sanitization. Tags become `[removed markup]`
 * and dangerous schemes become `[removed]`, so the surrounding markdown stays
 * readable while the vector no longer resolves. Ordinary markdown, `https:`
 * links, code identifiers, and the words "script"/"iframe" in prose are left
 * untouched: every rule requires actual markup syntax.
 *
 * @module @openai-harness/guardrails
 */

import type { GuardCheck } from "../types";
import { scanRules, withoutOverlaps, type Rule } from "./match";

/**
 * Paired blocks whose bodies must disappear with the tags. A non-greedy body
 * spans newlines and stops at the first matching close, so a multi-line
 * `<script>` does not leak its contents.
 */
const BLOCK_RULES: readonly Rule[] = [
  {
    pattern: /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    replacement: "[removed markup]",
  },
  {
    pattern: /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,
    replacement: "[removed markup]",
  },
];

/** Opening or closing tags that execute or load content, with attributes. */
const TAG_RULES: readonly Rule[] = [
  {
    pattern:
      /<\/?(?:script|iframe|object|embed|form|style|link|meta|base|img|svg|math|video|audio|source|input|button|textarea|select|option)\b[^>]*>/gi,
    replacement: "[removed markup]",
  },
  {
    // Any tag carrying an inline event handler, including on a harmless tag.
    pattern: /<[a-z][^>]*\son[a-z]+\s*=[^>]*>/gi,
    replacement: "[removed markup]",
  },
];

/**
 * Schemes are matched with optional whitespace between characters and before
 * the colon, mirroring how browsers forgive `java\nscript:` and `javascript :`.
 */
const SCHEME_RULES: readonly Rule[] = [
  {
    pattern:
      /\b(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t)\s*:/gi,
    replacement: "[removed]",
  },
  {
    pattern:
      /\b(?:d\s*a\s*t\s*a\s*:\s*t\s*e\s*x\s*t\s*\/\s*h\s*t\s*m\s*l)/gi,
    replacement: "[removed]",
  },
];

const ANSI_RULES: readonly Rule[] = [
  {
    pattern: /\x1b\[[0-9;]*[A-Za-z]/g,
    replacement: "",
  },
];

const RULES: readonly Rule[] = [
  ...BLOCK_RULES,
  ...TAG_RULES,
  ...SCHEME_RULES,
  ...ANSI_RULES,
];

/**
 * Neutralizes terminal escapes, dangerous HTML tags, and `javascript:`,
 * `vbscript:`, and `data:text/html` schemes.
 */
export const unsafeMarkup: GuardCheck = {
  name: "markup",
  scan: (text) => withoutOverlaps(scanRules(text, RULES)),
};
