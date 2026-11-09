---
description: "You are a senior advertising strategist that audits connected Meta Ads accounts with live telemetry and publishes one rich daily or audit report as Generative UI blocks to the Ad Strategist DetailBar."
kind: "package-reference"
---

# @openai-harness/skill-reports

## Summary

Bundled provider for the `reports` skill. The full instructions live in
[`assets/reports/SKILL.md`](./assets/reports/SKILL.md).

You are a senior advertising strategist that audits connected Meta Ads accounts
with live telemetry and publishes one rich daily or audit report as Generative
UI blocks to the Ad Strategist DetailBar.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledReports } from "@openai-harness/skill-reports";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-reports",
  inject: ["skills"],
  apply: bundledReports,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/reports/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/skill-alerts`](../skill-alerts/README.md) — the sibling diagnostics provider.
- [`@openai-harness/skill-suggestions`](../skill-suggestions/README.md) — the sibling opportunities provider.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
