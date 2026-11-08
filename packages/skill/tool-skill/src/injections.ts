/**
 * Durable pre-step skill context: the session catalog and user invocations.
 *
 * Both are injected as user-role messages carrying a typed source, so
 * transcript consumers can present them from metadata. The catalog republishes
 * only when its durable entry digest changes; invocation bodies always follow
 * the catalog so the material the model must act on sits closest to its answer.
 *
 * The middleware is host-bound: this package owns the catalog frame, gesture
 * grammar, digest, and rendering, while the host supplies the registry and the
 * scope-aware tool visibility predicate. `configureSkillPreStep` binds the
 * application's singletons once so the original `skillPreStepMiddleware`
 * import keeps working.
 *
 * @module @openai-harness/tool-skill
 */

import { createHash, randomUUID } from "node:crypto";
import { MessageId, type UserMessage } from "@openai-harness/llm";
import {
  escapeText,
  isModelInvocable,
  isUserInvocable,
  renderSkillContent,
  type SkillCatalogSnapshot,
  type SkillCatalogSource,
  type SkillDefinition,
  type SkillInvocationSource,
  type SkillSummary,
  type SkillViewOptions,
} from "@openai-harness/skill";

/** Maximum normalized description length rendered in the session catalog. */
const CATALOG_DESCRIPTION_MAX_LENGTH = 500;

/**
 * A whitespace-bounded `/name` token (the public skill-name grammar) anywhere
 * in user text. A second `/` or non-boundary character breaks the match,
 * keeping file paths (`/usr/bin`) and fractions (`5/8`) out.
 */
const SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g;

type CatalogEntry = { readonly name: string; readonly description: string };

/** Registry surface consumed by the pre-step middleware. */
export interface SkillCatalogRegistry {
  snapshot(options?: SkillViewOptions): Promise<SkillCatalogSnapshot>;
  get(
    name: string,
    options?: SkillViewOptions,
  ): Promise<SkillDefinition | undefined>;
}

/** One durable session event read by the catalog history scan. */
export interface SkillSessionEvent {
  readonly type: string;
  readonly data?: unknown;
}

/** Minimal session view required to find the last published catalog. */
export interface SkillSessionLog {
  readonly header?: { readonly agentPreset?: string };
  readonly events: readonly SkillSessionEvent[];
}

export interface SkillPreStepInput {
  /** Messages claimed for this step, before injection. */
  claimed: readonly UserMessage[];
  turn: number;
  step: number;
  /** Durable event log used to read the last published catalog. */
  session: SkillSessionLog;
  signal?: AbortSignal;
}

export interface SkillPreStepResult {
  messages: UserMessage[];
}

/** Host services the catalog and invocation middleware needs. */
export interface SkillPreStepHost {
  /** Provider registry used for catalog snapshots and body loads. */
  readonly registry: SkillCatalogRegistry;
  /** Whether the model-facing `skill` tool is visible in this scope. */
  isSkillToolVisible(scope: string | undefined): boolean;
}

/** Optional catalog rendering limits. */
export interface SkillPreStepConfig {
  /** Maximum normalized description length rendered in the catalog. */
  catalogDescriptionMaxLength?: number;
}

/** Pre-step hook signature compatible with the agent loop's `PreStepHook`. */
export type SkillPreStepHook = (
  input: SkillPreStepInput,
) => Promise<SkillPreStepResult>;

/**
 * Extracts candidate `/name` gesture tokens from claimed user messages,
 * deduplicated in first-seen order.
 */
export function extractInvokedSkillNames(
  messages: readonly UserMessage[],
): string[] {
  const names: string[] = [];
  for (const message of messages) {
    if (message.source?.kind !== "user") continue;
    for (const block of message.content) {
      if (block.type !== "text") continue;
      for (const match of block.text.matchAll(SKILL_GESTURE)) {
        const name = match[2];
        if (name !== undefined && !names.includes(name)) {
          names.push(name);
        }
      }
    }
  }
  return names;
}

/**
 * Build a pre-step middleware over host-supplied registry and visibility.
 *
 * @param host - registry and skill-tool visibility predicate.
 * @param config - optional catalog rendering limits.
 * @returns a hook that publishes a changed catalog and injects `/name` bodies.
 */
export function createSkillPreStepMiddleware(
  host: SkillPreStepHost,
  config: SkillPreStepConfig = {},
): SkillPreStepHook {
  const maxLength =
    config.catalogDescriptionMaxLength ?? CATALOG_DESCRIPTION_MAX_LENGTH;
  return async function skillPreStepMiddleware({
    claimed,
    session,
    signal,
  }: SkillPreStepInput): Promise<SkillPreStepResult> {
    signal?.throwIfAborted();

    const scope = session.header?.agentPreset;
    const catalog = await skillCatalogMessages({
      host,
      session,
      scope,
      signal,
      maxLength,
    });
    const invocations = await skillInvocationMessages({
      registry: host.registry,
      claimed,
      scope,
      signal,
    });

    return { messages: [...claimed, ...catalog, ...invocations] };
  };
}

let defaultMiddleware: SkillPreStepHook | undefined;

/**
 * Bind the application's registry and tool visibility once.
 *
 * @param host - registry and skill-tool visibility predicate, or undefined to unbind.
 */
export function configureSkillPreStep(host: SkillPreStepHost | undefined): void {
  defaultMiddleware = host === undefined
    ? undefined
    : createSkillPreStepMiddleware(host);
}

/**
 * Host-bound pre-step middleware. Throws when
 * {@link configureSkillPreStep} was not called during composition.
 */
export const skillPreStepMiddleware: SkillPreStepHook = async (input) => {
  if (defaultMiddleware === undefined) {
    throw new Error(
      "skillPreStepMiddleware has no host: call configureSkillPreStep() during host composition.",
    );
  }
  return defaultMiddleware(input);
};

async function skillCatalogMessages({
  host,
  session,
  scope,
  signal,
  maxLength,
}: {
  host: SkillPreStepHost;
  session: SkillSessionLog;
  scope: string | undefined;
  signal: AbortSignal | undefined;
  maxLength: number;
}): Promise<UserMessage[]> {
  if (!host.isSkillToolVisible(scope)) return [];

  const snapshot = await host.registry.snapshot({ signal, scope });
  signal?.throwIfAborted();
  if (!snapshot.complete) return [];

  const entries = catalogSourceEntries(
    snapshot.skills.filter(isModelInvocable),
    maxLength,
  );
  const digest = digestCatalogEntries(entries);
  const existing = lastCatalog(session);
  if (existing !== undefined && digestCatalogEntries(existing) === digest) {
    return [];
  }
  if (existing === undefined && entries.length === 0) return [];

  return [
    existing === undefined
      ? renderCatalogMessage(entries)
      : renderCatalogUpdate(entries),
  ];
}

async function skillInvocationMessages({
  registry,
  claimed,
  scope,
  signal,
}: {
  registry: SkillCatalogRegistry;
  claimed: readonly UserMessage[];
  scope: string | undefined;
  signal: AbortSignal | undefined;
}): Promise<UserMessage[]> {
  const names = extractInvokedSkillNames(claimed);
  const injections: UserMessage[] = [];
  for (const name of names) {
    signal?.throwIfAborted();
    const skill = await registry.get(name, { signal, scope });
    signal?.throwIfAborted();
    if (skill === undefined || !isUserInvocable(skill)) continue;
    injections.push(
      createUserMessage(renderSkillContent(skill), {
        kind: "skill-invocation",
        name,
        form: "instructions",
      }),
    );
  }
  return injections;
}

function createUserMessage(
  text: string,
  source: SkillInvocationSource | SkillCatalogSource,
): UserMessage {
  return {
    id: MessageId(randomUUID()),
    role: "user",
    content: [{ type: "text", text }],
    source,
  };
}

function renderCatalogMessage(entries: CatalogEntry[]): UserMessage {
  return createUserMessage(
    [
      "<system-reminder>",
      "A skill is a reusable set of task-specific instructions. The following skills are available in this session:",
      "",
      "<available_skills>",
      ...renderCatalogEntries(entries),
      "</available_skills>",
      "",
      "If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.",
      "A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.",
      "</system-reminder>",
    ].join("\n"),
    { kind: "skill-catalog", form: "catalog", entries },
  );
}

function renderCatalogUpdate(entries: CatalogEntry[]): UserMessage {
  const availability =
    entries.length === 0
      ? [
          "No skills are currently available through the `skill` tool. Do not use names from earlier skill catalogs.",
          "A user may still invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool for it.",
        ]
      : [
          "Use only names in this replacement catalog. If the user names a listed skill, or the task clearly matches its description, call the `skill` tool with the exact name before acting.",
          "A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.",
        ];
  return createUserMessage(
    [
      "<system-reminder>",
      "The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this session:",
      "",
      "<available_skills>",
      ...renderCatalogEntries(entries),
      "</available_skills>",
      "",
      ...availability,
      "</system-reminder>",
    ].join("\n"),
    { kind: "skill-catalog", form: "catalog", update: true, entries },
  );
}

/**
 * Model-facing catalog lines, projected from the same entries the source
 * records. Names are `isSkillName`-validated and carry no escapable character.
 */
function renderCatalogEntries(entries: readonly CatalogEntry[]): string[] {
  return entries.map(
    (entry) => `- \`${entry.name}\`: ${escapeText(entry.description)}`,
  );
}

/** Durable entry list mirroring the rendered catalog lines. */
function catalogSourceEntries(
  skills: readonly SkillSummary[],
  descriptionMaxLength: number,
): CatalogEntry[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: catalogDescription(skill.description, descriptionMaxLength),
  }));
}

/**
 * Catalog identity over the durable entry list rather than the rendered prose:
 * the entries are what changes, and the surrounding framing is for the model.
 */
function digestCatalogEntries(entries: readonly CatalogEntry[]): string {
  const canonical = entries
    .map((entry) => JSON.stringify([entry.name, entry.description]))
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

/** Entries of the last durable catalog message, if it is readable. */
function lastCatalog(session: SkillSessionLog): CatalogEntry[] | undefined {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index];
    if (event === undefined || event.type !== "user/message") continue;
    const data = isRecord(event.data) ? event.data : undefined;
    const source = data?.source;
    if (!isRecord(source) || source.kind !== "skill-catalog") continue;
    const entries = readCatalogEntries(source);
    if (entries !== undefined) return entries;
  }
  return undefined;
}

/**
 * Validate a durable catalog record. A resumed or externally written session
 * may carry a source object whose entries are unreadable; that record is
 * treated as absent rather than failing every later step.
 */
function readCatalogEntries(source: Record<string, unknown>): CatalogEntry[] | undefined {
  const entries = source.entries;
  if (!Array.isArray(entries)) return undefined;
  const readable: CatalogEntry[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) return undefined;
    const { name, description } = entry;
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      typeof description !== "string"
    ) {
      return undefined;
    }
    readable.push({ name, description });
  }
  return readable;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function catalogDescription(value: string, maxLength: number): string {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3)}...`;
}
