---
description: "Senior competitive-intelligence strategist that researches tracked rivals and category/product phrases in Meta Ad Library and delivers a deterministic, evidence-backed competitor snapshot."
kind: "package-reference"
---

# @openai-harness/skill-competitor-research

## Summary

Bundled provider for the `competitor-research` skill. The full instructions live in
[`assets/competitor-research/SKILL.md`](./assets/competitor-research/SKILL.md).

Senior competitive-intelligence strategist that researches tracked rivals and category/product phrases in Meta Ad Library and delivers a deterministic, evidence-backed competitor snapshot.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledCompetitorResearch } from "@openai-harness/skill-competitor-research";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-competitor-research",
  inject: ["skills"],
  apply: bundledCompetitorResearch,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/competitor-research/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
