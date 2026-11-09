# @openai-harness/agent-preset

Declarative agent presets: the tool, prompt-section, and detail-bar
composition one session slug runs with.

Ported from `packages/preset/agent-preset` and
`packages/preset/agent-preset-registry` of the reference deepseek-harness
repository. In the reference, each preset is a Cordis plugin that submits a
`PresetDefinition` to an `agentPresets` registry service from `[Service.init]`.
**This application has no preset-registry service yet**, so inventing a loader,
profile store, or mount system would not be faithful. The minimal portable
shape is the data plus the pure lookup helpers below.

## What it owns

- `AgentPreset` — the preset record: name, description, tool names, prompt
  sections, and detail-bar key;
- `agentPresets` — the seed presets for every session slug plus `default`;
- `getAgentPreset` / `resolveAgentPreset` — slug lookup with the `default`
  fallback;
- `resolvePresetTools` — name expansion through a host-supplied registry,
  warning loudly and skipping unregistered names.

## What stays with the host

The canonical `ToolRegistry` and the product tool catalog do not live here.
`resolvePresetTools` takes a structural `ToolLookup<T>` so the application can
pass its process-wide registry without this package importing an application
alias:

```ts
import { resolvePresetTools as expand } from "@openai-harness/agent-preset";
import { toolRegistry } from "@/lib/tools";

export function resolvePresetTools(slug: string | null | undefined) {
  return expand(slug, toolRegistry);
}
```

That binding lives in `apps/gateway/src/lib/agent/presets.ts`, which keeps the
existing application import path resolving unchanged.

When a preset-registry service is introduced, this package is the natural home
for the registration helper; until then the preset set is static data.
