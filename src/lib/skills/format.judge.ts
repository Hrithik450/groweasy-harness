/**
 * Stateless format judge for UI blocks.
 *
 * After a tool normalizes a UI-block spec, this module asks one small,
 * stateless chat-completions call whether the block matches the skill the
 * assistant invoked in the current turn. It never sees the conversation: the
 * only inputs are the block spec and the current skill instructions.
 *
 * Rules:
 * - No skill invoked this turn (or a previous one) -> skip, it is a general block.
 * - Block is a question / partial / follow-up -> pass, nothing to enforce.
 * - Block is the skill's full final artifact -> compare its format and fail on
 *   material deviations only.
 *
 * The judge fails open: transport or parse errors never block a render.
 *
 * @module @/lib/skills/format.judge
 */

import { getOpenAIClient, getOpenAIJudgeModel } from "@/lib/core/agent/client";
import { isUIAnswerSource } from "@/lib/llm/llm/message";
import type { SessionEvent } from "@/lib/core/session/events";
import type { UIBlockSpec } from "@/lib/generative.ui";
import { readSessionLog } from "@/lib/session/log.cache";
import { skillRegistry } from "./registry";
import type { SkillDefinition } from "./types";
import { shortSkillVersion } from "./utils";

/** Hard cap on one judge hop; the turn waits on it, so keep it short. */
const JUDGE_TIMEOUT_MS = 20_000;

/** Input caps keep a pathological spec from blowing up the judge call. */
const MAX_SPEC_CHARS = 80_000;
const MAX_SKILL_CHARS = 60_000;
const MAX_USER_MESSAGES = 6;
const MAX_USER_CHARS = 2_000;

/** Minimal tool context the judge needs; matches `ToolInput["context"]`. */
export interface JudgeContext {
  readonly sessionId?: string;
  readonly turn?: number;
}

/** One verdict from the judge. */
export interface FormatVerdict {
  readonly pass: boolean;
  /** One-line explanation, used in the rejection message. */
  readonly reason: string;
  /** Concrete, actionable deviations. Empty when `pass`. */
  readonly issues: readonly string[];
  /** Skills the block was judged against. */
  readonly skills: readonly string[];
}

const JUDGE_SYSTEM_PROMPT = `You are a format validator for UI blocks produced by an assistant.

You receive exactly three things:
1. The user's recent requests (up to six), which define what the block was meant to deliver.
2. The instructions of the skill the assistant invoked, including its design rules and its reference example.
3. The UI block the assistant produced, as JSON.

The user requests decide WHAT the deliverable must cover; the skill decides HOW it must look, which sections apply and how much detail they need.

STEP 1 — Decide WHETHER to validate, and against what scope.
- Read the requests for intent first. If the user asked for a narrower or minimal output (a quick check, one section, a few options, a specific fix), a compact block that fully answers that request passes. Do not force a full report onto a narrower request.
- If the block is a question to the user, a partial or intermediate step, a small follow-up, a confirmation, or anything else that is NOT the requested deliverable, return pass.

STEP 2 — Know what you are protecting.
The skill's reference example is the quality bar for how the deliverable LOOKS AND FEELS to the user: its theme, density, rhythm and presentation. The sections listed in the skill are a menu, not a script. Judge one question above all:
"Would a user who has seen the reference example recognise this as the same product, at the same quality — or would it feel like a thinner, cheaper or different format?"

STEP 3 — Never fail for these. They are allowed:
- Sections skipped because the data does not support them.
- Sections reordered or renamed to fit the user's question.
- Extra sections added, as long as they are built with the same patterns as the reference.
- Fewer or more rows, cards, competitors or items than the reference.
- Wording, tone, phrasing, or the specific content and numbers.

STEP 4 — Fail on experience drift. These are material deviations:
1. Collapsed or compressed format: designed sections flattened into a plain list, bullets, chips or a single table; several sections squeezed into one card; the deliverable reduced to a few text blocks. Thinner and more compact than the reference = fail.
2. Bloat: walls of Text, paragraphs beyond the word limits, one card per evidence record, or a media gallery.
3. Ads not shown inline: when ad media is available, ads must appear as inline Video or Image inside their section. Fail if they are replaced by links, text descriptions, a Carousel or gallery, or are missing.
4. Broken section anatomy: sections not in their own Card; sections placed side by side; the numbered header pattern (accent Eyebrow number + heading, meta text, Separator) missing or applied inconsistently.
5. Broken color roles: whole sections in accent; more than one accent focal point in a section; badge meanings that contradict the skill's mapping or change within the report; raw colors or class names.
6. Flattened type hierarchy: no big Eyebrow numbers or labels; everything rendered as Text; "Label: value" packed into one Text instead of label-over-value pairs.
7. A hard rule the skill states explicitly is violated (a word limit, a forbidden component, a required field).

When in doubt, compare the block section by section against the reference example. Fail only if the difference is something the user would SEE as a downgrade, not a different but equally rich choice.

Return ONLY a JSON object, no prose:
{"pass": true|false, "reason": "one short line", "issues": ["concrete issue naming the element or section", "..."]}
Use "issues": [] when pass is true.`;

/** Parse one JSON object out of a model reply, tolerating code fences. */
function extractJson(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = fenced?.[1] !== undefined ? [fenced[1], text] : [text];

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate.trim());
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Skill name from a `skill` tool call's raw argument JSON. */
function skillNameFromArguments(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { name?: unknown }).name === "string"
    ) {
      const name = (parsed as { name: string }).name.trim();
      return name.length > 0 ? name : null;
    }
  } catch {
    /* malformed arguments: ignore */
  }
  return null;
}

/**
 * Skills the model loaded in the latest turn only.
 *
 * A caller-supplied `turn` pins the lookup to that turn; with no turn supplied
 * the highest turn in the log is the latest. Skills from earlier turns never
 * carry over.
 */
function skillNamesLoaded(
  events: readonly SessionEvent[],
  turn?: number,
): string[] {
  const skillCalls = events.filter(
    (event) => event.type === "tool/call" && event.data.name === "skill",
  );
  if (skillCalls.length === 0) return [];

  let targetTurn = turn;
  if (targetTurn === undefined) {
    targetTurn = -Infinity;
    for (const event of skillCalls) {
      if (event.type === "tool/call" && event.data.turn > targetTurn) {
        targetTurn = event.data.turn;
      }
    }
  }

  const names = new Set<string>();
  for (const event of skillCalls) {
    if (event.type !== "tool/call" || event.data.turn !== targetTurn) continue;
    const name = skillNameFromArguments(event.data.arguments);
    if (name !== null) names.add(name);
  }
  return [...names];
}

async function readSessionEvents(
  sessionId: string | undefined,
): Promise<readonly SessionEvent[]> {
  if (!sessionId) return [];
  try {
    return await readSessionLog(sessionId);
  } catch (error) {
    console.warn("[FormatJudge] Could not read session log:", error);
    return [];
  }
}

function skillsFromEvents(
  events: readonly SessionEvent[],
  turn?: number,
): SkillDefinition[] {
  return skillNamesLoaded(events, turn)
    .map((name) => skillRegistry.get(name))
    .filter((skill): skill is SkillDefinition => skill !== undefined);
}

/** Recent real user messages (not tool results), oldest first, capped. */
function lastUserTexts(events: readonly SessionEvent[]): string[] {
  const texts: string[] = [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== "user/message") continue;
    const kind = event.data.source?.kind;
    if (kind && kind !== "user" && !isUIAnswerSource(kind)) continue;
    const content = event.data.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();
    if (text.length === 0) continue;
    texts.unshift(
      text.length > MAX_USER_CHARS
        ? `${text.slice(0, MAX_USER_CHARS)}…[truncated]`
        : text,
    );
    if (texts.length >= MAX_USER_MESSAGES) break;
  }
  return texts;
}

/** Resolve the skills a block should be judged against, freshly from disk. */
export async function getInvokedSkills(
  context: JudgeContext,
): Promise<SkillDefinition[]> {
  const events = await readSessionEvents(context.sessionId);
  return skillsFromEvents(events, context.turn);
}

/** Render the judge's user turn. */
function judgeUserContent(
  spec: UIBlockSpec,
  skills: readonly SkillDefinition[],
  userRequests: readonly string[],
): string {
  const skillText = skills
    .map((skill) => {
      const content =
        skill.content.length > MAX_SKILL_CHARS
          ? `${skill.content.slice(0, MAX_SKILL_CHARS)}\n…[truncated]`
          : skill.content;
      return [
        `<skill name="${skill.name}" version="${shortSkillVersion(skill.version)}">`,
        content,
        "</skill>",
      ].join("\n");
    })
    .join("\n\n");

  const specText = JSON.stringify(spec);
  const blockText =
    specText.length > MAX_SPEC_CHARS
      ? `${specText.slice(0, MAX_SPEC_CHARS)}…[truncated]`
      : specText;

  const userText =
    userRequests.length > 0
      ? `<user_requests>\n${userRequests
          .map(
            (request, index) =>
              `<message index="${index + 1}">\n${request}\n</message>`,
          )
          .join("\n")}\n</user_requests>\n`
      : "";

  return [
    userText,
    skillText,
    "",
    "<ui_block>",
    blockText,
    "</ui_block>",
    "",
    "Decide whether this block is the skill's completed final artifact for the user requests. If it is, check its format. If it is a question, partial, follow-up, or general block, pass.",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

/**
 * One stateless judge call. Returns `null` when the judge is unavailable or
 * its reply cannot be parsed, so callers fail open.
 */
export async function judgeUIBlockFormat(
  spec: UIBlockSpec,
  skills: readonly SkillDefinition[],
  userRequests: readonly string[] = [],
  meta?: { sessionId?: string; turn?: number },
): Promise<FormatVerdict | null> {
  if (skills.length === 0) return null;

  const client = getOpenAIClient();
  if (!client) return null;

  const model = getOpenAIJudgeModel();
  const userContent = judgeUserContent(spec, skills, userRequests);
  console.log(
    "[FormatJudge] Input:",
    JSON.stringify({
      model,
      // Sessions run concurrently; the id/turn ties interleaved lines together.
      ...(meta?.sessionId ? { session: meta.sessionId.slice(-8) } : {}),
      ...(meta?.turn !== undefined ? { turn: meta.turn } : {}),
      userRequests,
      skills: skills.map((skill) => skill.name),
      specChars: JSON.stringify(spec).length,
    }).slice(0, 500),
  );

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      { timeout: JUDGE_TIMEOUT_MS },
    );

    const raw = completion.choices[0]?.message?.content ?? "";
    console.log("[FormatJudge] Output:", raw.slice(0, 500));
    const parsed = extractJson(raw);
    if (parsed === null || typeof parsed.pass !== "boolean") {
      console.warn("[FormatJudge] Unparseable verdict; skipping enforcement.");
      return null;
    }

    const reason =
      typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter(
          (issue): issue is string =>
            typeof issue === "string" && issue.trim().length > 0,
        )
      : [];

    return {
      pass: parsed.pass,
      reason,
      issues,
      skills: skills.map((skill) => skill.name),
    };
  } catch (error) {
    console.warn(
      "[FormatJudge] Judge call failed; skipping enforcement:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Full guard for one normalized block: resolve the invoked skill, then judge.
 * Returns `null` when there is nothing to judge (no skill, or judge offline).
 */
export async function validateUIBlockFormat(
  spec: UIBlockSpec,
  context: JudgeContext | undefined,
): Promise<FormatVerdict | null> {
  if (!context) return null;
  const events = await readSessionEvents(context.sessionId);
  const skills = skillsFromEvents(events, context.turn);
  if (skills.length === 0) return null;
  return judgeUIBlockFormat(spec, skills, lastUserTexts(events), {
    sessionId: context.sessionId,
    turn: context.turn,
  });
}

/** Build the model-facing rejection text for one failed verdict. */
export function formatRejection(verdict: FormatVerdict): string {
  const target =
    verdict.skills.length > 0 ? verdict.skills.join(", ") : "the invoked skill";
  const issues =
    verdict.issues.length > 0
      ? verdict.issues.map((issue) => `- ${issue}`).join("\n")
      : "- the block does not match the skill's required format";
  return [
    `This UI block does not match the format defined by the ${target} skill.`,
    verdict.reason.length > 0 ? `Judge: ${verdict.reason}` : "",
    issues,
    "",
    "Re-read the skill instructions with the `skill` tool, then regenerate the block so it matches the required format. Do not resend the same block unchanged. Never fall back to Markdown, plain text, or a Markdown table; correct the UI block instead.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
