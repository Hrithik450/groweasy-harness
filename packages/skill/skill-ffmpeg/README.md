---
description: "Cross-platform FFmpeg reference for video stitching, audio mixing, transitions, speed changes, and caption burning, with the exact filters and flags available in this build."
kind: "package-reference"
---

# @openai-harness/skill-ffmpeg

## Summary

Bundled provider for the `ffmpeg` skill. The full instructions live in
[`assets/ffmpeg/SKILL.md`](./assets/ffmpeg/SKILL.md).

Cross-platform FFmpeg reference for video stitching, audio mixing, transitions, speed changes, and caption burning, with the exact filters and flags available in this build.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledFfmpeg } from "@openai-harness/skill-ffmpeg";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-ffmpeg",
  inject: ["skills"],
  apply: bundledFfmpeg,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/ffmpeg/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
