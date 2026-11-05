/**
 * Guardrail vocabulary: one check scans text, a pipeline folds findings into a
 * rewritten string.
 *
 * A match owns a half-open span and the exact text that replaces it, so checks
 * never mutate text themselves and the pipeline can resolve overlaps between
 * checks without either one knowing the other exists.
 *
 * @module @openai-harness/guardrails
 */

/** One half-open `[start, end)` span a check wants replaced. */
export interface GuardMatch {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/** One deterministic rule over text. Must be synchronous and side-effect free. */
export interface GuardCheck {
  readonly name: string;
  scan(text: string): readonly GuardMatch[];
}

/** A match attributed to the check that produced it. */
export interface GuardFinding extends GuardMatch {
  readonly check: string;
  /** Optional human-readable note for findings with no meaningful span. */
  readonly detail?: string;
}

/** The rewritten text and every finding the pipeline applied to it. */
export interface GuardResult {
  readonly text: string;
  readonly findings: readonly GuardFinding[];
}
