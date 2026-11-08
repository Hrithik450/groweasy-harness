---
description: "Local filesystem SKILL.md provider plugin for the Cordis skills service."
kind: "package-reference"
---

# @openai-harness/skill-filesystem

## Summary

Mounts a skill provider that discovers bundled `SKILL.md` files from a local
directory tree. This is the reference harness's `skill-filesystem` package
adapted to this repository: discovery and loading live in
`@openai-harness/skill`, and this package is the Cordis plugin that registers a
provider instance on `ctx.skills`.

## Use this package

```ts
import { Context } from "@deepseek-ai/cordis";
import { SkillService } from "@openai-harness/skill";
import { apply as skillFilesystem, name } from "@openai-harness/skill-filesystem";

const ctx = new Context();
await ctx.plugin(SkillService);
ctx.plugin({ name, inject: ["skills"], apply: (ctx) => skillFilesystem(ctx, { rootDir: "/path/to/skills" }) });
```

`rootDir` is scanned recursively; dot entries and `node_modules` are skipped.
Each `SKILL.md` frontmatter supplies the skill name, description, `whenToUse`,
and invocation policy. The provider id is `bundled`, and candidates carry
`source: "bundled"` and `rank: BUNDLED_SKILL_RANK`.

## Implementation

- `src/index.ts` — `name`, `inject`, `apply`, and `Config`.
- `@openai-harness/skill` — `BundledFileSystemSkillProvider` (discovery,
  frontmatter parsing, and body loading).

## Related packages

- [`@openai-harness/skill`](../skill/README.md) — registry, tracker, service, rendering.
- [`@openai-harness/tool-skill`](../tool-skill/README.md) — model-facing loader and session catalog.
