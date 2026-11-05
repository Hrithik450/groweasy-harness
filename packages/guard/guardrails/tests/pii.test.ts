import test from "node:test";
import assert from "node:assert/strict";
import { piiAll, piiHigh } from "../src/checks/pii";
import { runGuardrails } from "../src/pipeline";

test("piiHigh redacts an SSN", () => {
  assert.equal(
    runGuardrails("SSN 123-45-6789 on file.", [piiHigh]).text,
    "SSN [redacted pii] on file.",
  );
});

test("piiHigh redacts a Luhn-valid card with either separator", () => {
  assert.equal(
    runGuardrails("Card 4111 1111 1111 1111 on file.", [piiHigh]).text,
    "Card [redacted pii] on file.",
  );
  assert.equal(
    runGuardrails("Card 4111-1111-1111-1111 on file.", [piiHigh]).text,
    "Card [redacted pii] on file.",
  );
});

test("piiHigh redacts a mod-97-valid IBAN", () => {
  assert.equal(
    runGuardrails("IBAN GB82WEST12345698765432 for the account.", [piiHigh])
      .text,
    "IBAN [redacted pii] for the account.",
  );
});

test("piiHigh leaves a bad Luhn card alone", () => {
  const text = "Reference 1234 5678 9012 3456 is not a card.";
  assert.equal(runGuardrails(text, [piiHigh]).text, text);
});

test("piiHigh leaves a bad mod-97 IBAN alone", () => {
  const text = "IBAN GB82WEST12345698765431 is not valid.";
  assert.equal(runGuardrails(text, [piiHigh]).text, text);
});

test("piiHigh leaves ordinary copy alone", () => {
  const copy =
    "Call +91 98765 43210, use code SAVE20, budget $1,299, ref ABC123, year 2024.";
  assert.equal(runGuardrails(copy, [piiHigh]).text, copy);
});

test("piiHigh leaves emails and phones alone", () => {
  const text = "Email user.name+tag@example.co.uk or call +14155552671.";
  assert.equal(runGuardrails(text, [piiHigh]).text, text);
});

test("piiHigh does not mistake an email local part for a card", () => {
  const text = "Write to 4111111111111111@example.com.";
  assert.equal(runGuardrails(text, [piiHigh]).text, text);
});

test("piiAll redacts emails and phones", () => {
  assert.equal(
    runGuardrails("Email user.name+tag@example.co.uk now.", [piiAll]).text,
    "Email [redacted email] now.",
  );
  assert.equal(
    runGuardrails("Call +14155552671 today.", [piiAll]).text,
    "Call [redacted phone] today.",
  );
});

test("piiAll still redacts the high-confidence identifiers", () => {
  assert.equal(
    runGuardrails("SSN 123-45-6789, card 4111111111111111.", [piiAll]).text,
    "SSN [redacted pii], card [redacted pii].",
  );
});

test("piiAll leaves grouped numbers alone", () => {
  // The conservative phone rule needs one contiguous run; a grouped number is
  // deliberately not matched rather than partially redacted.
  const copy = "Call +91 98765 43210, budget $1,299, year 2024.";
  assert.equal(runGuardrails(copy, [piiAll]).text, copy);
});
