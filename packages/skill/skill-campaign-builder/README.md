---
description: "Senior Meta campaign architect that creates and safely edits app-install and website-sales campaigns using the business profile, brief, competitor research, winning creatives, and telemetry."
kind: "package-reference"
---

# @openai-harness/skill-campaign-builder

## Summary

Bundled provider for the `campaign-builder` skill. The full instructions live in
[`assets/campaign-builder/SKILL.md`](./assets/campaign-builder/SKILL.md).

Senior Meta campaign architect that creates and safely edits app-install and website-sales campaigns using the business profile, brief, competitor research, winning creatives, and telemetry.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledCampaignBuilder } from "@openai-harness/skill-campaign-builder";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-campaign-builder",
  inject: ["skills"],
  apply: bundledCampaignBuilder,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/campaign-builder/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
