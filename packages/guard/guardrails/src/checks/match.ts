/**
 * Rule scanning shared by the built-in checks.
 *
 * Checks declare patterns as data; this module turns them into matches and
 * resolves overlaps the same way everywhere, so no two checks can disagree
 * about which of two intersecting spans wins.
 *
 * @module @openai-harness/guardrails
 */

import type { GuardMatch } from "../types";

/** One pattern and the text that replaces whatever it matches. */
export interface Rule {
  readonly pattern: RegExp;
  /** A literal replacement, or a function of the pattern's capture groups. */
  readonly replacement: string | ((groups: readonly string[]) => string);
}

/**
 * Run every rule over `text` and collect the matches.
 *
 * @param text - candidate text.
 * @param rules - patterns, each declared with the `g` flag.
 * @returns matches in rule order; overlaps are resolved by the caller.
 */
export function scanRules(text: string, rules: readonly Rule[]): GuardMatch[] {
  const found: GuardMatch[] = [];
  for (const rule of rules) {
    // Rules are module-level objects, so a shared lastIndex would leak state
    // between calls; `matchAll` needs it reset.
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      if (match.index === undefined) continue;
      const replacement =
        typeof rule.replacement === "string"
          ? rule.replacement
          : rule.replacement(match.slice(1));
      found.push({
        start: match.index,
        end: match.index + match[0].length,
        replacement,
      });
    }
  }
  return found;
}

/**
 * Keep non-overlapping matches, earliest first.
 *
 * Sorting by start and then by longest span makes the rule deterministic: a
 * broad rule that starts earlier wins over a narrow one nested inside it, and
 * two rules that start together keep the longer replacement.
 *
 * @param matches - candidate matches, in any order.
 * @returns the kept matches, ascending by start.
 */
export function withoutOverlaps<T extends GuardMatch>(
  matches: readonly T[],
): T[] {
  const ordered = [...matches].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const kept: T[] = [];
  let cursor = 0;
  for (const match of ordered) {
    if (match.start < cursor) continue;
    kept.push(match);
    cursor = match.end;
  }
  return kept;
}
