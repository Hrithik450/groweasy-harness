---
description: "Standardized SVG presets for video hook overlays and branded end cards, rasterized with renderElement and composited with ffmpeg."
kind: "package-reference"
---

# @openai-harness/skill-render-template

## Summary

Bundled provider for the `render-template` skill. The full instructions live in
[`assets/render-template/SKILL.md`](./assets/render-template/SKILL.md).

Standardized SVG presets for video hook overlays and branded end cards, rasterized with renderElement and composited with ffmpeg.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledRenderTemplate } from "@openai-harness/skill-render-template";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-render-template",
  inject: ["skills"],
  apply: bundledRenderTemplate,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/render-template/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
