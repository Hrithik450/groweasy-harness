/**
 * Prompt-injection and instruction-override attempts embedded in tool output,
 * retrieved pages, or user-supplied copy.
 *
 * The rules match only phrases that clearly address an AI or system — a verb
 * aimed at "instructions", a role assignment naming an assistant, an
 * exfiltration request for credentials, or a raw chat-template marker.
 * Ordinary marketing language that happens to share a noun ("ignore the
 * previous campaign's results", "act as a mediator", "repeat the headline") is
 * deliberately left untouched: over-redacting real copy breaks an answer just
 * as badly as missing an attack.
 *
 * @module @openai-harness/guardrails
 */

import type { GuardCheck } from "../types";
import { scanRules, withoutOverlaps, type Rule } from "./match";

/** Replacement applied to every recognised embedded instruction. */
const REPLACEMENT = "[removed: embedded instruction]";

/**
 * Personas that only make sense when the text is reassigning the assistant's
 * role: an AI, an unrestricted model, a jailbreak mode.
 */
const PERSONA = [
  "ai\\b",
  "a\\.i\\.",
  "assistant",
  "language\\s+model",
  "model",
  "chatbot",
  "bot\\b",
  "dan\\b",
  "jailbroken(?:\\s+(?:ai|model|assistant))?",
  "(?:unrestricted|uncensored|unfiltered)\\s+(?:ai|model|assistant)\\b",
  "(?:developer|debug|god|admin|dan)\\s+mode",
  "without\\s+(?:any\\s+)?(?:rules|restrictions|limits|filters|guidelines)",
].join("|");

const RULES: readonly Rule[] = [
  {
    // "ignore all previous instructions", "override the system prompt"
    pattern: new RegExp(
      "\\b(?:ignore|disregard|forget|override)\\s+(?:(?:all|any|the|your|previous|prior|above|earlier)\\s+)+(?:instructions?|prompts?|rules?|guidelines?|directives?|system\\s+prompt)\\b",
      "gi",
    ),
    replacement: REPLACEMENT,
  },
  {
    // "new instructions:" — an override header.
    pattern: /\bnew\s+instructions?\s*:/gi,
    replacement: REPLACEMENT,
  },
  {
    // "system:" only at the start of a line; an inline "operating system:" is
    // ordinary prose.
    pattern: /^[ \t]*system\s*:/gim,
    replacement: REPLACEMENT,
  },
  {
    pattern: /\bdeveloper\s+message\s*:/gi,
    replacement: REPLACEMENT,
  },
  {
    // "system prompt" as a header, not copy that merely mentions it
    // ("the system prompt for this ad is bold and direct").
    pattern: /(?:^[ \t]*system\s+prompt\b|\bsystem\s+prompt\s*:)/gim,
    replacement: REPLACEMENT,
  },
  {
    // Role reassignment aimed at an AI persona.
    pattern: new RegExp(
      `\\byou\\s+are\\s+now\\s+(?:an?\\s+)?(?:${PERSONA})`,
      "gi",
    ),
    replacement: REPLACEMENT,
  },
  {
    pattern: new RegExp(
      `\\bfrom\\s+now\\s+on[\\s,]+you\\s+are\\s+(?:an?\\s+)?(?:${PERSONA})`,
      "gi",
    ),
    replacement: REPLACEMENT,
  },
  {
    pattern: new RegExp(
      `\\bact\\s+as\\s+(?:an?\\s+)?(?:${PERSONA})`,
      "gi",
    ),
    replacement: REPLACEMENT,
  },
  {
    // "you are no longer bound by the rules".
    pattern: new RegExp(
      `\\byou\\s+are\\s+no\\s+longer\\s+(?:(?:an?\\s+)?(?:${PERSONA})|bound|restricted|limited|subject\\s+to)`,
      "gi",
    ),
    replacement: REPLACEMENT,
  },
  {
    // Requests to disclose hidden instructions.
    pattern:
      /\b(?:reveal|show|print|repeat|output|display|leak)(?:\s+me)?\s+(?:your|the)\s+(?:system\s+prompt|instructions?|rules?|developer\s+message|prompts?)\b/gi,
    replacement: REPLACEMENT,
  },
  {
    // Secrecy from the user.
    pattern:
      /\b(?:(?:do\s+not|don't|dont)\s+tell\s+the\s+user|without\s+telling\s+the\s+user)\b/gi,
    replacement: REPLACEMENT,
  },
  {
    // Exfiltration of credentials.
    pattern:
      /\b(?:send|post|email|e-mail|upload|transfer|transmit|forward)\s+(?:me\s+|us\s+)?(?:your\s+|the\s+|all\s+)?(?:credentials?|api[-\s]?keys?|passwords?|secrets?|tokens?)\b/gi,
    replacement: REPLACEMENT,
  },
  {
    // Raw chat-template and tool-call markers.
    pattern: /<\/?(?:tool_call|tool_use|function_call|tool_calls|function_calls)>/gi,
    replacement: REPLACEMENT,
  },
  {
    pattern: /\[INST\]/gi,
    replacement: REPLACEMENT,
  },
  {
    pattern: /<<\/?SYS>>/gi,
    replacement: REPLACEMENT,
  },
  {
    pattern: /###\s*(?:system|instructions?|assistant|developer)\b/gi,
    replacement: REPLACEMENT,
  },
];

/** Detects instruction-override attempts that address the AI or its system. */
export const promptInjection: GuardCheck = {
  name: "prompt-injection",
  scan: (text) => withoutOverlaps(scanRules(text, RULES)),
};

/**
 * Whether `text` contains a recognised injection phrase.
 *
 * @param text - candidate text.
 */
export function containsInjection(text: string): boolean {
  return promptInjection.scan(text).length > 0;
}
