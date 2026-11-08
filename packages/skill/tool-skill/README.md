---
description: "Model-facing skill loader tool and durable pre-step session catalog injection."
kind: "package-reference"
---

# @openai-harness/tool-skill

## Summary

Provides the model-facing `skill` tool and the pre-step middleware that
publishes a durable `<available_skills>` catalog, republishing only when the
catalog entry digest changes, and injects `<skill_content>` bodies for
user-explicit `/name` gestures. The tool and middleware are host-bound: the host
supplies its skill registry, a scope-aware skill-tool visibility predicate, and
(optionally) a fetch-recorded callback.

## Use this package

```ts
import {
  configureSkillPreStep,
  createSkillTool,
} from "@openai-harness/tool-skill";

const skillTool = createSkillTool({
  registry,
  onFetched: (context, name) => recordSkillFetched(context, name),
});

configureSkillPreStep({
  registry,
  isSkillToolVisible: (scope) => toolRegistry.get("skill", scope) === skillTool,
});
```

Register `skillTool` in the host tool registry, then pass
`skillPreStepMiddleware` to the agent loop's `preStep` hook.

For isolated use, call
`createSkillPreStepMiddleware({ registry, isSkillToolVisible })` directly.

## Implementation

- `src/tool.ts` — `createSkillTool`: schema, model-invocation enforcement,
  provider/resource-base passthrough, canonical `<skill_content>` rendering.
- `src/injections.ts` — `extractInvokedSkillNames`,
  `createSkillPreStepMiddleware`, `configureSkillPreStep`, the session catalog
  renderer/update, SHA-256 entry digest, and defensive durable-record reading.
- `src/index.ts` — public barrel (`createSkillTool`, `skillPreStepMiddleware`,
  and associated types).

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, contracts, tracker, rendering.
- [`@openai-harness/skill-filesystem`](../skill-filesystem/README.md) — filesystem provider.
- Bundled skill packages: `skill-ffmpeg`, `skill-video-captions`, and siblings.
