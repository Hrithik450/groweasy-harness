import type { PromptSection, PromptSectionContext } from "./types";

/**
 * Ordered collection of system-prompt sections.
 *
 * Sections register themselves at module load (`prompt.ts`), and `compile`
 * joins them in ascending order for a given session context.
 */
class SystemPromptRegistry {
  private readonly sections = new Map<string, PromptSection>();

  section(section: PromptSection): void {
    this.sections.set(section.name, section);
  }

  compile(ctx: PromptSectionContext = {}): string {
    return [...this.sections.values()]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.text(ctx).trim())
      .filter(Boolean)
      .join("\n\n");
  }
}

export const systemPromptRegistry = new SystemPromptRegistry();
