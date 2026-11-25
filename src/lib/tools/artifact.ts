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
import type { UIBlockNode } from "@/lib/generative.ui/types";
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

const MIN_REPORT_CARDS = 3;
const MAX_TEXT_BLOCK_CHARS = 800;

/**
 * Deterministic report shape, independent of the judge. The judge can be
 * talked into "richness"; these checks cannot: a saved report is a vertical
 * Stack with real section Cards, headings, no essay inside one Text, and more
 * than one surface treatment.
 */
function reportStructureError(spec: CanonicalUIMesssage): string | null {
  const elements = spec.elements as Record<string, UIBlockNode>;
  const root = elements[spec.root];
  if (!root) return "The report has no root element.";
  if (root.type !== "Stack") {
    return `A report must be a Stack of sections, not a single ${root.type}. Build sections as Cards inside a vertical Stack.`;
  }

  const childrenOf = (node: UIBlockNode): string[] =>
    Array.isArray(node.children) ? node.children : [];

  const rootChildren = childrenOf(root);
  if (rootChildren.length === 0) {
    return "The report Stack has no sections.";
  }

  // A section is a Card directly under the root, or under a root-level Grid /
  // Stack. Content thrown straight onto the root is a flat list, not a report.
  const sectionIds = new Set<string>();
  const rootContentIds: string[] = [];
  const collectSections = (ids: string[]): void => {
    for (const id of ids) {
      const node = elements[id];
      if (!node) continue;
      if (node.type === "Card") {
        sectionIds.add(id);
      } else if (node.type === "Grid" || node.type === "Stack") {
        collectSections(childrenOf(node));
      } else {
        rootContentIds.push(id);
      }
    }
  };
  collectSections(rootChildren);

  if (rootContentIds.length > 0 && sectionIds.size === 0) {
    return "The report is a flat list under the root Stack; nest the content inside section Cards.";
  }
  if (sectionIds.size < MIN_REPORT_CARDS) {
    return `A report needs at least ${MIN_REPORT_CARDS} section Cards under the root Stack; this has ${sectionIds.size}.`;
  }

  for (const id of sectionIds) {
    const card = elements[id];
    if (childrenOf(card).length === 0) {
      return `Section Card "${id}" is empty; each section needs a heading and its content.`;
    }
  }

  const nodes = Object.values(elements);
  const headings = nodes.filter(
    (node) => node.type === "Heading" || node.type === "Eyebrow",
  );
  if (headings.length === 0) {
    return "A report needs section headings (Heading or Eyebrow).";
  }

  for (const node of nodes) {
    if (node.type !== "Text") continue;
    const text = (node.props as { text?: unknown })?.text;
    if (typeof text === "string" && text.length > MAX_TEXT_BLOCK_CHARS) {
      return "One Text block is carrying an essay; split it into section Cards.";
    }
  }

  const sectionCards = [...sectionIds].map((id) => elements[id]);
  const variants = sectionCards.map(
    (card) => (card.props as { variant?: unknown })?.variant,
  );
  const allDefault = variants.every(
    (variant) => variant === undefined || variant === null || variant === "accent",
  );
  if (allDefault) {
    return "Every Card is on the default accent surface, so the report reads as one colored wall. Use light/muted surfaces and reserve accent for focal points.";
  }

  return null;
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

  const structureError = reportStructureError(spec);
  if (structureError !== null) {
    return { ok: false, error: `The report was not saved: ${structureError}` };
  }

  const key = attemptKey(params);
  const attempt = nextAttempt(key);
  const finalAttempt = attempt >= ARTIFACT_SAVE_ATTEMPTS;
  const skill = skillRegistry.get(params.skillName);

  if (!finalAttempt && skill) {
    const verdict = await judgeUIBlockFormat(spec, [skill], [], {
      sessionId: params.context?.sessionId,
      turn: params.context?.turn,
    });
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
