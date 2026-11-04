/**
 * Prompt assembly vocabulary: contexts, sections, orders, and the schema shape
 * the assembly reports for the tools the host exposes.
 *
 * @module @openai-harness/system-prompt
 */

/**
 * One model-facing function schema contributed to an assembly.
 *
 * Structurally compatible with the host registry's `ToolSchema`; the registry
 * stays in the application, this package only reports what it exposes.
 */
export interface ToolSchema {
  readonly type?: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  deferLoading?: boolean;
  timeoutMs?: number;
  prerequisiteSkill?: string | string[];
}

export interface AssembleContext {
  scope?: string;
  signal?: AbortSignal;
  sessionTitle?: string;
  brandUrl?: string;
  date?: string;
  variables?: Record<string, string | undefined>;
}

export interface PromptSection {
  readonly name: string;
  readonly order: number;
  readonly text: string | ((context: AssembleContext) => string);
  readonly interpolate?: boolean;
  readonly complete?: boolean;
}

export interface PromptContext {
  readonly name: string;
  readonly order: number;
  readonly text: string | ((context: AssembleContext) => string);
  readonly interpolate?: boolean;
  readonly required?: boolean;
}

export interface AssembledSection {
  name: string;
  text: string;
  interpolate?: boolean;
}

export interface AssembledContext {
  name: string;
  text: string;
  interpolate?: boolean;
}

export interface PromptAssembly {
  sections: AssembledSection[];
  contexts: AssembledContext[];
  tools: ToolSchema[];
  variables: Record<string, string | undefined>;
}

export const SECTION_ORDERS = {
  HARNESS_IDENTITY: -1000,
  DEPLOYMENT_PERSONA_PREFIX: 0,
  GUARDRAILS: 100,
  GOLDEN_RULES: 200,
  RULES: 300,
  PLAN_POLICY: 500,
  AVAILABLE_SKILLS: 700,
  TIPS: 800,
  UI_BLOCKS: 900,
  LEGO_COMPONENTS: 950,
  PERSONA_SUFFIX: 10200,
} as const;

export type PromptSectionOrderName = keyof typeof SECTION_ORDERS;

export const CONTEXT_ORDERS = {
  WORKING_DIRECTORY: 100,
  SANDBOX_POLICY: 110,
  APPROVAL_POLICY: 115,
} as const;

export type PromptContextOrderName = keyof typeof CONTEXT_ORDERS;
