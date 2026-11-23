/** Ordering slots for the composed system prompt. Lower runs earlier. */
export const SECTION_ORDERS = {
  SKILL_UPDATES: 0,
  HARNESS_IDENTITY: 10,
  GOLDEN_RULES: 20,
  RULES: 30,
  GUARDRAILS: 40,
  TIPS: 50,
  AVAILABLE_SKILLS: 60,
  UI_BLOCKS: 70,
  LEGO_COMPONENTS: 80,
  // Last on purpose: a seconds-resolution clock must not invalidate the cached
  // prompt prefix above it on every model step.
  CLOCK: 90,
} as const;

export type SectionOrder = (typeof SECTION_ORDERS)[keyof typeof SECTION_ORDERS];

export interface PromptSectionContext {
  sessionTitle?: string;
  [key: string]: unknown;
}

export interface PromptSection {
  name: string;
  order: number;
  text: (ctx: PromptSectionContext) => string;
}
