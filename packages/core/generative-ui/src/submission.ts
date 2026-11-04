/**
 * Translation of one submitted interactive block into model-facing context.
 *
 * Interaction state lives on `spec.values`, stamped by the renderer on submit.
 * This is the only place that vocabulary becomes prose, so the surface layer,
 * the gateway, and tools never hand-roll submission strings.
 *
 * @module @openai-harness/generative-ui
 */

import type { UIBlockSpec } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Resolved field values submitted with a block.
 *
 * Reserved `__`-prefixed keys carry surface control data (for example the
 * action name) and are not model-visible values.
 */
export function submissionValues(
  spec: UIBlockSpec,
): Array<[string, unknown]> {
  const raw = spec.values;
  if (!isRecord(raw)) return [];
  return Object.entries(raw).filter(([key]) => !key.startsWith("__"));
}

/** The action a submitted block requested, if it named one. */
export function submissionAction(spec: UIBlockSpec): string {
  const values = spec.values;
  const fromValues =
    isRecord(values) && typeof values.__action === "string"
      ? values.__action
      : undefined;
  if (fromValues) return fromValues;
  return typeof spec.action === "string" ? spec.action : "complete";
}

/**
 * Hidden user-message text for a block submission.
 *
 * The message rides the model context so the agent sees what the user chose;
 * `hidden` keeps it out of every chat projection.
 */
export function blockSubmissionText(spec: UIBlockSpec): string {
  const values = submissionValues(spec);
  if (values.length === 0) {
    return `The user submitted the interactive UI block (action: ${submissionAction(
      spec,
    )}) without values.`;
  }
  return [
    `The user submitted the interactive UI block (action: ${submissionAction(
      spec,
    )}) with these values:`,
    ...values.map(
      ([key, value]) =>
        `- ${key}: ${
          typeof value === "string" ? value : JSON.stringify(value)
        }`,
    ),
  ].join("\n");
}
