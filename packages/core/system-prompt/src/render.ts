/**
 * Variable interpolation and prompt rendering.
 *
 * @module @openai-harness/system-prompt
 */

import type { AssembledContext, AssembledSection, PromptAssembly } from "./types";

const VARIABLE_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function interpolateText(
  text: string,
  variables: Record<string, string | undefined>,
): string {
  return text.replace(VARIABLE_REGEX, (match, varName) => {
    if (Object.hasOwn(variables, varName)) {
      const val = variables[varName];
      return val !== undefined ? val : "";
    }
    return match;
  });
}

export function renderPrompt(assembly: PromptAssembly): string {
  return assembly.sections
    .map((section) =>
      section.interpolate === false
        ? section.text
        : interpolateText(section.text, assembly.variables),
    )
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

export function renderContext(assembly: PromptAssembly): string {
  return assembly.contexts
    .map((ctx) =>
      ctx.interpolate === false
        ? ctx.text
        : interpolateText(ctx.text, assembly.variables),
    )
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}
