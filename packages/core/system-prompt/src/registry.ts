/**
 * Ordered registry for prompt sections and dynamic contexts.
 *
 * The tool schemas reported with each assembly come from the host's tool
 * registry, bound once with {@link configureSystemPromptTools}. That keeps this
 * package free of application aliases and framework imports; the host's
 * `src/lib/core/system-prompt/registry.ts` shim performs the binding.
 *
 * @module @openai-harness/system-prompt
 */

import type {
  AssembleContext,
  AssembledContext,
  AssembledSection,
  PromptAssembly,
  PromptContext,
  PromptSection,
  ToolSchema,
} from "./types";
import { renderPrompt } from "./render";

/** Host-owned source of the tool schemas visible in one assembly. */
export interface SystemPromptToolProvider {
  schemas(): ToolSchema[];
}

/** Tool provider bound by {@link configureSystemPromptTools}, if any. */
let defaultTools: SystemPromptToolProvider | undefined;

/**
 * Bind the host application's tool registry as the default schema source.
 *
 * @param provider - the host registry exposing `schemas()`.
 */
export function configureSystemPromptTools(
  provider: SystemPromptToolProvider,
): void {
  defaultTools = provider;
}

/** Resolves the configured tool provider or explains why there is none. */
function requireTools(): SystemPromptToolProvider {
  if (!defaultTools) {
    throw new Error(
      "SystemPromptRegistry has no tool provider: call configureSystemPromptTools() during host composition.",
    );
  }
  return defaultTools;
}

export class SystemPromptRegistry {
  private readonly sections = new Map<string, PromptSection>();
  private readonly contexts = new Map<string, PromptContext>();
  private readonly variables: Record<string, string | undefined> = {};

  section(section: PromptSection): () => void {
    this.sections.set(section.name, section);
    return () => {
      this.sections.delete(section.name);
    };
  }

  context(context: PromptContext): () => void {
    this.contexts.set(context.name, context);
    return () => {
      this.contexts.delete(context.name);
    };
  }

  variable(name: string, value: string | undefined): void {
    this.variables[name] = value;
  }

  assemble(ctx: AssembleContext = {}): PromptAssembly {
    const vars: Record<string, string | undefined> = {
      ...this.variables,
      ...(ctx.variables || {}),
    };
    if (ctx.sessionTitle) vars.sessionTitle = ctx.sessionTitle;
    if (ctx.brandUrl) vars.brandUrl = ctx.brandUrl;
    if (ctx.date) vars.date = ctx.date;

    const completeSection = Array.from(this.sections.values()).find(
      (s) => s.complete === true,
    );

    let assembledSections: AssembledSection[];
    if (completeSection) {
      const text =
        typeof completeSection.text === "function"
          ? completeSection.text(ctx)
          : completeSection.text;
      assembledSections = [
        {
          name: completeSection.name,
          text,
          interpolate: completeSection.interpolate,
        },
      ];
    } else {
      const sorted = Array.from(this.sections.values()).sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name),
      );
      assembledSections = sorted.map((s) => ({
        name: s.name,
        text: typeof s.text === "function" ? s.text(ctx) : s.text,
        interpolate: s.interpolate,
      }));
    }

    const sortedContexts = Array.from(this.contexts.values()).sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );
    const assembledContexts: AssembledContext[] = sortedContexts.map((c) => ({
      name: c.name,
      text: typeof c.text === "function" ? c.text(ctx) : c.text,
      interpolate: c.interpolate,
    }));

    return {
      sections: assembledSections,
      contexts: assembledContexts,
      tools: requireTools().schemas(),
      variables: vars,
    };
  }

  compile(ctx: AssembleContext = {}): string {
    const assembly = this.assemble(ctx);
    return renderPrompt(assembly);
  }
}

export const systemPromptRegistry = new SystemPromptRegistry();
