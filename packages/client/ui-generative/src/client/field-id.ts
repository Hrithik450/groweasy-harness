"use client";

/**
 * React binding for deterministic field ids.
 *
 * The pure composition helper lives in `@openai-harness/generative-ui`; the
 * domain package must not import React, so the `useId` half lives here.
 *
 * @module @openai-harness/client-ui-generative
 */
import { useId } from "react";
import { composeFieldId } from "@openai-harness/generative-ui";

/**
 * Compose a stable field id from a label or name, falling back to a React id.
 * @param nameOrLabel - explicit field name/label.
 * @param fallback - base used when neither a name nor a React id is usable.
 * @returns the normalized field id.
 */
export function useNormalizedFieldId(
  nameOrLabel?: string,
  fallback = "field",
): string {
  const rawId = useId();
  return composeFieldId(nameOrLabel, rawId, fallback);
}
