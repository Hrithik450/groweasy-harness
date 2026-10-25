---
description: "Bundled FFmpeg filter, encoder, and composition skill provider for video editing workflows."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-ffmpeg

English | [中文](README.zh.md)

## Summary

This package provides a bundled `ffmpeg` skill that acts as an authoritative reference for FFmpeg filters, encoders, and composition syntax. It prevents models from hallucinating unsupported options or guessing complex filter graph arguments when generating video clips, slideshows, transitions, or composite Reels.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the skill provider beside the skill registry and `dsh-tool-skill`.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-ffmpeg'
- name: '@deepseek-ai/dsh-tool-skill'
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin mounts a bundled `SkillProvider` that exposes the `ffmpeg` candidate in the skill registry. When the agent loads the skill, it reads `assets/ffmpeg/SKILL.md` directly.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill Registry](../skill/README.md) — registration and lifecycle contracts.
- [Tool Skill](../tool-skill/README.md) — session catalog presentation and loader tool.

-----

<a id="model-experience"></a>
## Model Experience

### ffmpeg skill

#### What the model sees

The model sees `ffmpeg` listed in the session skill catalog with its description, and receives the complete filter and encoder reference when the skill is loaded on demand.

#### Token effect

The catalog summary consumes fixed tokens per request, while the full reference is only loaded into history when explicitly invoked.

#### KV Cache effect

Skill instructions append to the end of conversation history without modifying existing tool declarations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Requires a host or sandboxed `ffmpeg` binary to execute commands.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
