---
description: "Senior brand & business intelligence strategist that inspects a brand website to build its complete Business Profile: design tokens, brand overview, up to 10 broad + 10 product/service keywords, operating countries and languages, and 8–10 profiled direct competitors with recent ads."
kind: "package-reference"
---

# @openai-harness/skill-business-profile

## Summary

Bundled provider for the `business-profile` skill. The full instructions live in
[`assets/business-profile/SKILL.md`](./assets/business-profile/SKILL.md).

Senior brand & business intelligence strategist that inspects a brand website to build its complete Business Profile: design tokens, brand overview, up to 10 broad + 10 product/service keywords, operating countries and languages, and 8–10 profiled direct competitors with recent ads.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledBusinessProfile } from "@openai-harness/skill-business-profile";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-business-profile",
  inject: ["skills"],
  apply: bundledBusinessProfile,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/business-profile/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
