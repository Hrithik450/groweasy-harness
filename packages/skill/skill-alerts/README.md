---
description: "You are a senior ad-account alert auditor that inspects connected Meta Ads accounts, campaigns, ad sets, and ads for delivery blockers, policy rejections, billing failures, and campaign health anomalies, then persists prioritized diagnostic alerts."
kind: "package-reference"
---

# @openai-harness/skill-alerts

## Summary

Bundled provider for the `alerts` skill. The full instructions live in
[`assets/alerts/SKILL.md`](./assets/alerts/SKILL.md).

You are a senior ad-account alert auditor that inspects connected Meta Ads accounts, campaigns, ad sets, and ads for delivery blockers, policy rejections, billing failures, and campaign health anomalies, then persists prioritized diagnostic alerts.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledAlerts } from "@openai-harness/skill-alerts";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-alerts",
  inject: ["skills"],
  apply: bundledAlerts,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/alerts/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/skill-suggestions`](../skill-suggestions/README.md) — the sibling opportunities provider.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
