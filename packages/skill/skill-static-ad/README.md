---
description: "Senior Meta static ad creative director that architects high-converting static concepts, selects image and overlay archetypes, and renders pixel-perfect composites via fetchImageTypes, fetchOverlayTypes, and renderElement."
kind: "package-reference"
---

# @openai-harness/skill-static-ad

## Summary

Bundled provider for the `static-ad` skill. The full instructions live in
[`assets/static-ad/SKILL.md`](./assets/static-ad/SKILL.md).

Senior Meta static ad creative director that architects high-converting static concepts, selects image and overlay archetypes, and renders pixel-perfect composites via fetchImageTypes, fetchOverlayTypes, and renderElement.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledStaticAd } from "@openai-harness/skill-static-ad";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-static-ad",
  inject: ["skills"],
  apply: bundledStaticAd,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/static-ad/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
