/**
 * Deterministic text guardrails.
 *
 * Every check is a pure scan over a string: no model calls, no network, no
 * configuration, so the pipeline is cheap enough to run on every assistant
 * answer and every tool result. It is a backstop, not a classifier — the
 * system prompt still owns behavior, and a semantic judgment ("did this
 * paraphrase our instructions?") is out of scope here.
 *
 * @module @openai-harness/guardrails
 */

import { identity } from "./checks/identity";
import { withoutOverlaps } from "./checks/match";
import { secretKeys } from "./checks/secret-keys";
import type { GuardCheck, GuardFinding, GuardMatch, GuardResult } from "./types";

/**
 * Fold non-overlapping matches into `text`.
 *
 * @param text - the original text.
 * @param matches - matches to apply; must not overlap.
 * @returns the rewritten text.
 */
export function applyMatches(
  text: string,
  matches: readonly GuardMatch[],
): string {
  let output = "";
  let cursor = 0;
  for (const match of matches) {
    output += text.slice(cursor, match.start) + match.replacement;
    cursor = match.end;
  }
  return output + text.slice(cursor);
}

/**
 * Checks safe for anything the model reads: credentials only.
 *
 * Local-path redaction is deliberately excluded here. The model depends on
 * real workspace paths — a skill's own base directory, a file it was asked to
 * open — and rewriting them corrupts the content the user asked for.
 */
export const TOOL_CHECKS: readonly GuardCheck[] = [secretKeys];

/** Tool checks plus self-referential identity claims, for assistant answers. */
export const ANSWER_CHECKS: readonly GuardCheck[] = [...TOOL_CHECKS, identity];

/** The default set; answers are the strictest surface, so they lead. */
export const DEFAULT_CHECKS: readonly GuardCheck[] = ANSWER_CHECKS;

/**
 * Apply every check to `text` and fold the non-overlapping findings.
 *
 * Findings are resolved globally: when two checks claim intersecting spans,
 * the earliest one wins, so a broad rule (an env assignment) masks a narrow
 * one nested inside it (the key itself).
 *
 * @param text - candidate text.
 * @param checks - checks to run; defaults to {@link DEFAULT_CHECKS}.
 * @returns the rewritten text and the findings that were applied.
 */
export function runGuardrails(
  text: string,
  checks: readonly GuardCheck[] = DEFAULT_CHECKS,
): GuardResult {
  if (text.length === 0) return { text, findings: [] };

  const findings: GuardFinding[] = [];
  for (const check of checks) {
    for (const match of check.scan(text)) {
      findings.push({ check: check.name, ...match });
    }
  }

  const applied = withoutOverlaps(findings);
  if (applied.length === 0) return { text, findings: [] };

  return { text: applyMatches(text, applied), findings: applied };
}

/**
 * Guard one assistant answer.
 *
 * @param text - the answer about to be persisted.
 * @returns the answer with credentials, paths, and identity claims redacted.
 */
export function guardAnswerText(text: string): string {
  return runGuardrails(text, ANSWER_CHECKS).text;
}

/**
 * Guard one tool result before the model reads it.
 *
 * Identity checks are excluded: a tool may legitimately return a competitor's
 * name, and only the assistant's own claims are disclosures.
 *
 * @param text - one text block of a tool result.
 * @returns the block with credentials and local paths redacted.
 */
export function guardToolText(text: string): string {
  return runGuardrails(text, TOOL_CHECKS).text;
}
