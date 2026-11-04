# @openai-harness/system-prompt

Ordered assembly of the system prompt: `SystemPromptRegistry` keeps named
sections and dynamic contexts, resolves their text against one assembly
context, interpolates `{{variable}}` references, and reports the tool schemas
the host exposes.

What it owns:
- the section/context contracts and their order constants (`SECTION_ORDERS`,
  `CONTEXT_ORDERS`);
- assembly ordering, complete-section replacement, variable precedence, and
  rendering (`renderPrompt`, `renderContext`, `interpolateText`);
- the tool-schema shape reported with each assembly.

What it does not own:
- the concrete tool registry — the host binds it with
  `configureSystemPromptTools()`; the application's
  `src/lib/core/system-prompt/registry.ts` shim binds `toolRegistry`;
- prompt content — the harness identity, guardrails, rules, and UI-block
  sections are product composition and stay in the application's
  `src/lib/core/system-prompt/prompt.ts`, which registers them on this registry;
- the compaction, session, or model layers.

Source reference: `packages/core/system-prompt` in the reference
deepseek-harness repository, reduced to its registry/render core. The
reference's Cordis-scoped assembly is rendered here as the
`SystemPromptToolProvider` seam, matching how this repository's other packages
bind host storage.
