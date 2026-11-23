/**
 * Hidden prompt a user sends when they accept a suggestion's action.
 *
 * Client-safe: UI components import this without the server prompt compiler.
 *
 * @module @/lib/prompts/suggestion
 */

import type { Suggestion } from "@/lib/detail.bar/types";
import type { PromptDraft } from "@/lib/session/prompt";

/** A suggestion row; older rows may carry a ready-made prompt. */
export type SuggestionPromptTarget = Suggestion & {
  prompt?: string;
  value?: string;
};

/** Prompt instructing the agent to apply one suggestion. */
export function buildSuggestionPrompt(
  suggestion: SuggestionPromptTarget,
): PromptDraft {
  const display = {
    title: `Apply “${suggestion.title}”`,
    ...(suggestion.value ? { detail: suggestion.value } : {}),
  };
  if (suggestion.prompt) {
    return { content: suggestion.prompt, display };
  }

  const lines = [
    `Apply the recommended action for suggestion "${suggestion.title}".`,
    `Why it matters: ${suggestion.description}`,
    `Action: ${suggestion.action.fix}`,
  ];
  if (suggestion.action.before !== undefined) {
    lines.push(`Current value: ${suggestion.action.before}`);
  }
  if (suggestion.action.after !== undefined) {
    lines.push(`Target value: ${suggestion.action.after}`);
  }
  if (suggestion.value) lines.push(`Expected gain: ${suggestion.value}`);
  lines.push(
    "Verify the current state before changing anything, apply the change with the matching Meta tool, then mark the suggestion completed with updateSuggestions.",
  );
  return { content: lines.join("\n"), display };
}
