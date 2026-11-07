/**
 * Skill contract types shared by the registry, providers, tool, and injections.
 *
 * `MessageSourceMap` is augmented here with the two durable context kinds the
 * skill subsystem publishes, so transcript consumers can present skill context
 * from metadata instead of re-parsing model-facing prose.
 *
 * @module @openai-harness/skill
 */

import type { MessageSourceMap } from "@openai-harness/llm";

export const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Rank of a runtime contribution; lower ranks win duplicate names. */
export const RUNTIME_RANK = 250;

/** Rank of packaged skill providers and local bundled roots. */
export const BUNDLED_SKILL_RANK = 600;

/** Origin bucket for a skill contribution. The value is metadata, not precedence. */
export type SkillSource =
  | "project-dsh"
  | "project-agents"
  | "runtime"
  | "user-dsh"
  | "user-agents"
  | "custom"
  | "bundled"
  | (string & {});

/** Provider-specific base used by loaded skill bodies to resolve relative resources. */
export type SkillResourceBase =
  | { readonly kind: "directory"; readonly path: string }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "opaque"; readonly description: string };

/** Invocation controls shared by skill discovery consumers. */
export interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean;
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean;
}

/** Invocation-neutral skill metadata returned by `SkillRegistry.list()`. */
export interface SkillSummary {
  /** Instruction file path when supplied by the provider; absent for virtual skills. */
  readonly path?: string;
  /** Kebab-case identifier used to address the skill. */
  readonly name: string;
  /** Short routing description shown by discovery consumers. */
  readonly description: string;
  /** Optional extra routing guidance. */
  readonly whenToUse?: string;
  /** Resolved model and user invocation controls. */
  readonly invocation: SkillInvocationPolicy;
  /** Discovery source that produced this winning skill. */
  readonly source: SkillSource;
  /** Provider that owns this skill body. */
  readonly provider: string;
  /** Provider-specific base for relative resources. */
  readonly resourceBase?: SkillResourceBase;
}

/** Provider catalog entry used by the registry to merge and later load skills. */
export interface SkillCandidate extends SkillSummary {
  /** Lower ranks win duplicate skill names before registration order is considered. */
  readonly rank: number;
  /** Parsed optional metadata object from provider-specific skill frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Complete parsed skill definition, including the body loaded by `SkillRegistry.get()`. */
export interface SkillDefinition extends SkillSummary {
  /** Markdown instruction body after any provider-specific metadata removal. */
  readonly content: string;
  /** Parsed optional metadata object from frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Runtime skill contribution accepted by `SkillRegistry.register()`. */
export type SkillRegistration = Omit<
  SkillDefinition,
  "invocation" | "provider" | "source"
> & {
  /** Invocation controls; omission permits both model and user surfaces. */
  readonly invocation?: Partial<SkillInvocationPolicy>;
  /** Provider label; omission uses the registry-owned runtime provider. */
  readonly provider?: string;
  /** Discovery bucket; omission records `runtime`. */
  readonly source?: SkillSource;
};

/** Caller context used for cwd-sensitive and abortable provider work. */
export interface SkillLookupOptions {
  /** Workspace selector for the current lookup. */
  readonly cwd?: string;
  /** Abort discovery or loading work for the current caller. */
  readonly signal?: AbortSignal;
}

/**
 * Registry read options: provider lookup context plus the viewing scope.
 * The registry consumes `scope` to select layers; providers receive the same
 * options object and read only their {@link SkillLookupOptions} contract.
 */
export interface SkillViewOptions extends SkillLookupOptions {
  /** Viewing scope (the calling agent); omitted reads the global layer alone. */
  readonly scope?: string;
}

/** One catalog observation plus whether discovery completed without a provider failure. */
export interface SkillCatalogSnapshot {
  /** Sorted invocation-neutral summaries collected in this observation. */
  readonly skills: SkillSummary[];
  /** Whether every registered provider completed successfully. */
  readonly complete: boolean;
}

/**
 * Provider interface for one source of skills, such as local directories or a
 * remote registry. Registrations are synchronous; remote initialization,
 * authentication, and discovery are awaited inside `list()`.
 */
export interface SkillProvider {
  /** Unique provider name within the registry. */
  readonly name: string;
  /**
   * List available skill candidates for the current lookup context.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   */
  list(options: SkillLookupOptions): Promise<SkillCandidate[]>;
  /**
   * Load a complete skill body for a previously listed name.
   * @param name - kebab-case skill name.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns the full skill body, or `undefined` if it is no longer loadable.
   */
  get(
    name: string,
    options: SkillLookupOptions,
  ): Promise<SkillDefinition | undefined>;
}

/** A user-explicit skill invocation injected by the host. */
export type SkillInvocationSource = MessageSourceMap["skill-invocation"];

/** Durable provider and item records for one published session skill catalog. */
export type SkillCatalogSource = MessageSourceMap["skill-catalog"];

declare module "@openai-harness/llm/src/message" {
  interface MessageSourceMap {
    "skill-invocation": {
      kind: "skill-invocation";
      /** Invoked skill name, validated user-invocable at the injecting boundary. */
      name: string;
      /** Injected skill bodies are instructions for the model to follow. */
      form: "instructions";
    };
    "skill-catalog": {
      kind: "skill-catalog";
      form: "catalog";
      /** Marks a replacement catalog rather than this session's first publication. */
      update?: true;
      /** Exactly the entries this message published, in catalog order. */
      entries: readonly { name: string; description: string }[];
    };
  }
}
