/**
 * Self-referential identity claims: the assistant saying which model, provider,
 * or vendor it is.
 *
 * Only *first-person* claims match. Comparing competitors — "ChatGPT is a
 * competitor worth analysing", "Google Ads and Meta Ads benchmarks" — is
 * ordinary marketing work and must pass untouched, so no pattern fires on a
 * bare vendor name.
 *
 * @module @openai-harness/guardrails
 */

import type { GuardCheck } from "../types";
import { scanRules, withoutOverlaps, type Rule } from "./match";

const VENDORS =
  "openai|anthropic|google(?:\\s+deepmind)?|meta(?:\\s+ai)?|deepseek|mistral(?:\\s+ai)?|xai|microsoft|nvidia";

/**
 * `(?![\w-])` instead of `\b` so a hyphenated compound ("AI-powered",
 * "OpenAI-compatible") is not read as a claim about the system itself.
 */
const RULES: readonly Rule[] = [
  {
    pattern: new RegExp(
      "\\b(?:i(?:'m| am)|we(?:'re| are))\\s+(?:just\\s+|only\\s+)?(?:an?\\s+)?(?:ai|a\\.i\\.|large language model|language model|chatbot|openai(?:'s)? model|chatgpt|gpt-[\\w.]+|claude|gemini|llama|copilot|deepseek)(?:\\s+(?:(?:language\\s+)?(?:model|assistant)|chatbot))?(?![\\w-])",
      "gi",
    ),
    replacement: "[identity withheld]",
  },
  {
    pattern: new RegExp(
      `\\b(?:powered|built|based|running|trained|created|developed|made)\\s+(?:by|on|with)\\s+(?:${VENDORS})(?![\\w-])`,
      "gi",
    ),
    replacement: "[identity withheld]",
  },
  {
    pattern: /\b(?:my|the)\s+(?:base|underlying|foundation|current)\s+(?:model|llm)\b/gi,
    replacement: "[identity withheld]",
  },
  {
    // "as an AI" alone is too broad ("as an AI-powered platform"); require a noun.
    pattern:
      /\bas\s+an?\s+(?:ai\s+(?:language\s+)?(?:model|assistant)|large\s+language\s+model|language\s+model)(?![\w-])/gi,
    replacement: "[identity withheld]",
  },
  {
    pattern: new RegExp(
      `\\b(?:openai|anthropic|deepseek|mistral|xai|google deepmind)\\s+(?:model|llm|api)(?![\\w-])`,
      "gi",
    ),
    replacement: "[identity withheld]",
  },
  {
    // "…, an AI model from OpenAI." — the vendor clause attached to a model noun.
    pattern: new RegExp(
      `\\b(?:an?\\s+)?(?:ai|language)\\s+(?:model|assistant)\\s+(?:from|by|made by)\\s+(?:${VENDORS})(?![\\w-])`,
      "gi",
    ),
    replacement: "[identity withheld]",
  },
];

/**
 * Build an identity check with a custom replacement.
 *
 * @param options - replacement text; defaults to `[identity withheld]`.
 */
export function identityCheck(options: {
  readonly replacement?: string;
} = {}): GuardCheck {
  const replacement = options.replacement ?? "[identity withheld]";
  const rules = RULES.map((rule) => ({ ...rule, replacement }));
  return {
    name: "identity",
    scan: (text) => withoutOverlaps(scanRules(text, rules)),
  };
}

/** The default identity check. */
export const identity: GuardCheck = identityCheck();
