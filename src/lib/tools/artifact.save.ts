/**
 * Save-time validation and rendering for report artifacts.
 *
 * Report skills no longer render through `renderUIBlock`. Their save tool is
 * the single boundary: validate structurally, judge against the tool's own
 * skill, persist the canonical spec, then emit the block to the chat. One
 * pass, one source of truth, and the chat and the viewer read the same spec.
 *
 * Attempts: the first two judge failures return the issues to the model; the
 * third attempt is accepted as-is (syntax is already guaranteed by the
 * structural normalization), so a turn can never dead-end on the judge.
 *
 * @module @/lib/tools/artifact.save
 */

import {
  validateAndNormalizeUI,
  type CanonicalUIMesssage,
} from "@/lib/generative.ui";
import { judgeUIBlockFormat } from "@/lib/skills/format.judge";
import { skillRegistry } from "@/lib/skills/registry";
import type { ToolEvent } from "@/lib/tools/types";

export const ARTIFACT_SAVE_ATTEMPTS = 3;

interface AttemptState {
  count: number;
  updatedAt: number;
}

const attempts = new Map<string, AttemptState>();
const ATTEMPT_TTL_MS = 30 * 60 * 1000;

function attemptKey(params: ArtifactSaveParams): string {
  return [
    params.context?.sessionId ?? "no-session",
    params.context?.turn ?? 0,
    params.skillName,
  ].join(":");
}

function nextAttempt(key: string, now = Date.now()): number {
  if (attempts.size > 500) {
    for (const [entryKey, state] of attempts) {
      if (now - state.updatedAt > ATTEMPT_TTL_MS) attempts.delete(entryKey);
    }
  }
  const current = attempts.get(key);
  const count = (current?.count ?? 0) + 1;
  attempts.set(key, { count, updatedAt: now });
  return count;
}

export interface ArtifactSaveParams {
  /** Raw `blocks` argument from the model. */
  rawSpec: unknown;
  /** The skill this artifact belongs to; the judge is bound to it statically. */
  skillName: string;
  context?: {
    sessionId?: string;
    turn?: number;
    emitEvent?: (event: ToolEvent) => void | Promise<void>;
  };
  /** Write the canonical spec. Runs only after validation/judging passes. */
  persist: (spec: CanonicalUIMesssage) => Promise<void> | void;
}

export type ArtifactSaveResult =
  | { ok: true; spec: CanonicalUIMesssage }
  | { ok: false; error: string };

function rejectionText(
  reason: string,
  issues: readonly string[],
  attempt: number,
): string {
  return [
    `The report was not saved (review attempt ${attempt} of ${ARTIFACT_SAVE_ATTEMPTS}).`,
    reason ? `Review: ${reason}` : "",
    ...issues.map((issue) => `- ${issue}`),
    "Fix these and call this tool again with the corrected blocks. The final attempt saves the latest valid draft as-is.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Validate → judge → persist → emit. See the module contract above. */
export async function saveArtifact(
  params: ArtifactSaveParams,
): Promise<ArtifactSaveResult> {
  if (params.rawSpec == null) {
    return { ok: false, error: "Missing required argument 'blocks'." };
  }

  let spec: CanonicalUIMesssage | undefined;
  try {
    spec = validateAndNormalizeUI(params.rawSpec);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!spec) {
    return { ok: false, error: "Missing required argument 'blocks'." };
  }

  const key = attemptKey(params);
  const attempt = nextAttempt(key);
  const finalAttempt = attempt >= ARTIFACT_SAVE_ATTEMPTS;
  const skill = skillRegistry.get(params.skillName);

  if (!finalAttempt && skill) {
    const verdict = await judgeUIBlockFormat(spec, [skill], []);
    if (verdict !== null && !verdict.pass) {
      return {
        ok: false,
        error: rejectionText(verdict.reason, verdict.issues, attempt),
      };
    }
  }

  attempts.delete(key);
  await params.persist(spec);

  try {
    await params.context?.emitEvent?.({ type: "ui/block", spec });
  } catch {
    // The artifact is saved; a failed chat emission must not undo it.
  }

  return { ok: true, spec };
}
