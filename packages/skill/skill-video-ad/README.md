---
description: "Senior generative video director that architects high-converting Meta Talking Head and B-Roll video ads, character generation blueprints, motion prompt orchestration, voice persona selection, and composite post-production assembly."
kind: "package-reference"
---

# @openai-harness/skill-video-ad

## Summary

Bundled provider for the `video-ad` skill. The full instructions live in
[`assets/video-ad/SKILL.md`](./assets/video-ad/SKILL.md).

Senior generative video director that architects high-converting Meta Talking Head and B-Roll video ads, character generation blueprints, motion prompt orchestration, voice persona selection, and composite post-production assembly.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledVideoAd } from "@openai-harness/skill-video-ad";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-video-ad",
  inject: ["skills"],
  apply: bundledVideoAd,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/video-ad/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
