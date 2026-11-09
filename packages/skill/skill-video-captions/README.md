---
description: "Video post-production subtitle specialist that transcribes dialogue, normalizes lowercase ASS cues, and burns captions into video ads via createSubtitles, saveAsset, and ffmpeg."
kind: "package-reference"
---

# @openai-harness/skill-video-captions

## Summary

Bundled provider for the `video-captions` skill. The full instructions live in
[`assets/video-captions/SKILL.md`](./assets/video-captions/SKILL.md).

Video post-production subtitle specialist that transcribes dialogue, normalizes lowercase ASS cues, and burns captions into video ads via createSubtitles, saveAsset, and ffmpeg.

## Use this package

Mount the package beside the skills service:

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as bundledVideoCaptions } from "@openai-harness/skill-video-captions";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({
  name: "skill-video-captions",
  inject: ["skills"],
  apply: bundledVideoCaptions,
});
```

## Implementation

- `src/index.ts` — `provider`, `name`, `inject`, and `apply`. The candidate
  carries `source: "bundled"`, `rank: BUNDLED_SKILL_RANK`, and a directory
  resource base pointing at the packaged assets.
- `assets/video-captions/SKILL.md` — the instruction body served by `get()`.

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, service, and contracts.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — catalog and loader tool.
