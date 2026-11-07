---
description: "Agent skill provider registry, session tracking, Cordis service, and bundled filesystem provider."
kind: "package-reference"
---

# @openai-harness/skill

## Summary

Owns the skill capability seam: the layered provider registry, the public skill
vocabulary (names, invocation policy, resource bases), frontmatter parsing and
rendering, per-session fetch tracking and prerequisite evaluation, the Cordis
`skills` service, and the reusable bundled `SKILL.md` filesystem provider.

Concrete providers live in their own packages and register either on
`ctx.skills.registerProvider(...)` (Cordis) or on a local `SkillRegistry`
instance.

## Use this package

```ts
import { SkillRegistry } from "@openai-harness/skill";

const registry = new SkillRegistry();
registry.registerProvider(myProvider);
const summary = (await registry.list()).find((s) => s.name === "ffmpeg");
const skill = await registry.get("ffmpeg", { scope: "my-agent" });
```

Cordis composition:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.skills.registerProvider(myProvider);
```

## Implementation

- `src/registry.ts` — `SkillRegistry`, layered global/scoped resolution, ranked
  duplicate handling, snapshot completeness, abort propagation.
- `src/types.ts` — `SkillCandidate`, `SkillDefinition`, `SkillProvider`,
  `SkillSummary`, `BUNDLED_SKILL_RANK`, `RUNTIME_RANK`, and the
  `MessageSourceMap` augmentation for skill context.
- `src/utils.ts` — grammar, normalization, frontmatter, invocation policy,
  resource hints, `<skill_content>` rendering.
- `src/tracker.ts` — in-memory per-user/session fetched-skill registry and
  `evaluatePrerequisite`.
- `src/service.ts` — `SkillService` mounted as `ctx.skills`.
- `src/filesystem.ts` — `BundledFileSystemSkillProvider`, the provider class
  mounted by `@openai-harness/skill-filesystem`.

## Related packages

- [`@openai-harness/tool-skill`](../tool-skill/README.md) — model-facing loader and catalog.
- [`@openai-harness/skill-filesystem`](../skill-filesystem/README.md) — filesystem provider plugin.
- Bundled skill packages: `skill-ffmpeg`, `skill-video-captions`, and siblings.
