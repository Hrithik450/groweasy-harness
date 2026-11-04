/**
 * High-confidence personal identifiers: US Social Security numbers, payment
 * card numbers, and IBANs.
 *
 * These patterns are shape-based, so they over-match ordinary numbers. Every
 * candidate is therefore confirmed before it is redacted: card numbers must
 * pass the Luhn checksum and IBANs must pass mod-97. `piiHigh` deliberately
 * stops there — emails and phone numbers are left for callers that opt in to
 * `piiAll`, because they also appear in ordinary workspace content.
 *
 * @module @openai-harness/guardrails
 */

import type { GuardCheck, GuardMatch } from "../types";
import { scanRules, withoutOverlaps, type Rule } from "./match";

const SSN_RULES: readonly Rule[] = [
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[redacted pii]",
  },
];

/** 13–19 digits, optionally grouped with single spaces or hyphens. */
const CARD_RULE: Rule = {
  pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
  replacement: "[redacted pii]",
};

const IBAN_RULE: Rule = {
  pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  replacement: "[redacted pii]",
};

const EMAIL_RULES: readonly Rule[] = [
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[redacted email]",
  },
];

/**
 * A leading `+`, 1–3 country digits, one optional separator, then 6–14 more
 * digits. Ordinary prices, years, IDs, and budgets do not start with `+`.
 *
 * The single optional separator is the tradeoff: numbers grouped the other way
 * (`+91 98765 43210`, `+91-98765-43210`) are left untouched because loosening
 * the pattern to span groups also starts matching dates and numeric prose.
 */
const PHONE_RULES: readonly Rule[] = [
  {
    pattern: /\+\d{1,3}[\s-]?\d{6,14}\b/g,
    replacement: "[redacted phone]",
  },
];

/**
 * Luhn checksum over a digit string.
 *
 * @param digits - digits only; separators must already be removed.
 * @returns whether the digits form a valid Luhn sequence.
 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let doubling = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (doubling) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    doubling = !doubling;
  }
  return sum % 10 === 0;
}

/**
 * IBAN mod-97 checksum. The first four characters move to the end and letters
 * are expanded to two-digit values (A = 10 … Z = 35) before the remainder is
 * folded incrementally, so no large integers are needed.
 *
 * @param iban - uppercase IBAN candidate.
 * @returns whether the candidate is a valid mod-97 IBAN.
 */
function passesMod97(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const value =
      character >= "0" && character <= "9"
        ? character
        : String(character.charCodeAt(0) - 55);
    for (const digit of value) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/**
 * Scan one rule and keep only the matches its checksum accepts.
 *
 * @param text - candidate text.
 * @param rule - a pattern declared with the `g` flag.
 * @param accept - checksum predicate over the matched text and span.
 * @returns accepted matches, in source order.
 */
function scanAccepted(
  text: string,
  rule: Rule,
  accept: (value: string, match: GuardMatch) => boolean,
): GuardMatch[] {
  return scanRules(text, [rule]).filter((match) => {
    const value = text.slice(match.start, match.end);
    return accept(value, match);
  });
}

/**
 * Run the shared identifier rules plus caller-selected extras.
 *
 * @param text - candidate text.
 * @param extras - email and phone rules for `piiAll`; empty for `piiHigh`.
 * @returns non-overlapping matches.
 */
function scanPii(text: string, extras: readonly Rule[]): GuardMatch[] {
  return withoutOverlaps([
    ...scanRules(text, SSN_RULES),
    ...scanAccepted(text, CARD_RULE, (value, match) => {
      // A digit run right after `+` is a phone and one right before `@` is an
      // email local part; piiHigh must not touch either, even if Luhn passes.
      if (text[match.start - 1] === "+" || text[match.end] === "@") {
        return false;
      }
      return passesLuhn(value.replace(/[ -]/g, ""));
    }),
    ...scanAccepted(text, IBAN_RULE, passesMod97),
    ...scanRules(text, extras),
  ]);
}

/**
 * Redacts only identifiers strong enough to act on: SSNs, Luhn-valid cards,
 * and mod-97-valid IBANs. Emails and phone numbers are untouched.
 */
export const piiHigh: GuardCheck = {
  name: "pii",
  scan: (text) => scanPii(text, []),
};

/**
 * `piiHigh` plus email addresses and international-ish phone numbers.
 *
 * The phone rule is intentionally conservative; see {@link PHONE_RULES}.
 */
export const piiAll: GuardCheck = {
  name: "pii",
  scan: (text) => scanPii(text, [...EMAIL_RULES, ...PHONE_RULES]),
};
