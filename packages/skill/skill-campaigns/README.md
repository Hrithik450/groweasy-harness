---
description: "You are a senior ad-account campaign manager that inspects connected Meta Ads accounts, classifies every ad as winner, scaler, potential, loser, or untested against its ad set, and fills the Ad Manager Campaigns tab with campaign metrics, per-ad diagnoses, and one-tap actions."
kind: "package-reference"
---

# @openai-harness/skill-campaigns

## Summary

Bundled provider for the `campaigns` skill. The full instructions live in
[`assets/campaigns/SKILL.md`](./assets/campaigns/SKILL.md).

You are a senior ad-account campaign manager that inspects connected Meta Ads
accounts, classifies every ad as winner, scaler, potential, loser, or untested
against its ad set, and fills the Ad Manager Campaigns tab with campaign
metrics, per-ad diagnoses, and one-tap actions.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledCampaigns } from "@openai-harness/skill-campaigns";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-campaigns",
  inject: ["skills"],
  apply: bundledCampaigns,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/campaigns/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/skill-alerts`](../skill-alerts/README.md) — the sibling diagnostics provider.
- [`@openai-harness/skill-suggestions`](../skill-suggestions/README.md) — the sibling opportunities provider.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
