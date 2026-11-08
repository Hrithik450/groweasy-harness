---
description: "You are a senior ad-optimization strategist that inspects connected Meta Ads accounts, campaigns, ad sets, and ads for high-impact opportunities, insights, and scaling or refresh actions, then persists prioritized suggestions with money-saving actions."
kind: "package-reference"
---

# @openai-harness/skill-suggestions

## Summary

Bundled provider for the `suggestions` skill. The full instructions live in
[`assets/suggestions/SKILL.md`](./assets/suggestions/SKILL.md).

You are a senior ad-optimization strategist that inspects connected Meta Ads accounts, campaigns, ad sets, and ads for high-impact opportunities, insights, and scaling or refresh actions, then persists prioritized suggestions with money-saving actions.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledSuggestions } from "@openai-harness/skill-suggestions";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-suggestions",
  inject: ["skills"],
  apply: bundledSuggestions,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/suggestions/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/skill-alerts`](../skill-alerts/README.md) — the sibling diagnostic-alert provider.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
