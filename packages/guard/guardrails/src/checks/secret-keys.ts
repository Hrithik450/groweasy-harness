/**
 * Credentials and key material that must never reach a model or a transcript:
 * PEM blocks, provider keys, bearer tokens, assignments, and env-style values.
 *
 * The rules deliberately keep a key's *name* (`API_KEY = …`) so redacted text
 * still tells the reader what was removed.
 *
 * @module @openai-harness/guardrails
 */

import type { GuardCheck } from "../types";
import { scanRules, withoutOverlaps, type Rule } from "./match";

const RULES: readonly Rule[] = [
  {
    pattern:
      /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
    replacement: "[redacted private key]",
  },
  {
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    replacement: "[redacted key]",
  },
  {
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: "[redacted key]",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
    replacement: "Bearer [redacted]",
  },
  {
    // The capture group keeps `api_key =` / `token:` so the shape survives.
    pattern:
      /\b((?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*)["']?[A-Za-z0-9._~+/=-]{12,}["']?/gi,
    replacement: (groups) => `${groups[0] ?? ""}[redacted]`,
  },
  {
    pattern: /\b[A-Z][A-Z0-9_]{2,}(?:KEY|SECRET|TOKEN|PASSWORD)\s*=\s*\S+/g,
    replacement: "[redacted env assignment]",
  },
];

/** Redacts key material; `sk-` keys inside an env assignment stay one finding. */
export const secretKeys: GuardCheck = {
  name: "secret-keys",
  scan: (text) => withoutOverlaps(scanRules(text, RULES)),
};
