---
description: "Bundled digital marketing, performance creative, SEO, and ad generation skills for DeepSeek Harness."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-marketing

English | [中文](README.zh.md)

## Summary

This package provides bundled marketing, performance creative, video ad creation, and SEO skills for DeepSeek Harness. It includes tools for generating 9:16 vertical talking-head video ads with single-character consistency, rapid fast-cut pacing, user approval gates, BytePlus SeaDance motion synthesis, ElevenLabs narration, and standalone FFmpeg assembly.

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
- name: '@deepseek-ai/dsh-skill-marketing'
- name: '@deepseek-ai/dsh-tool-skill'
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin mounts a bundled `SkillProvider` that exposes marketing skill candidates (`video-generation`, `marketing-poster`, `creative-brief-generator`, `competitor-research`, `marketing-strategist`, `facebook-audience-builder`, `lead-cost-calculator`, `keyword-suggestions`, `ad-copywriter`) into `ctx.skills`. When the agent loads a skill, it loads the corresponding instructions from `assets/<skill>/SKILL.md`.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill Registry](../skill/README.md) — registration and lifecycle contracts.
- [FFmpeg Skill](../skill-ffmpeg/README.md) — standalone FFmpeg filter and assembly reference.
- [Tool Skill](../tool-skill/README.md) — session catalog presentation and loader tool.

-----

<a id="model-experience"></a>
## Model Experience

### marketing skill

#### What the model sees

The model sees `video-generation` and marketing skills listed in the session skill catalog, and receives targeted playbooks, timeline pacing rules, and local generation commands when loaded.

#### Token effect

The catalog summary consumes fixed tokens per request, while the full marketing skill bodies are loaded only upon on-demand invocation.

#### KV Cache effect

Skill instructions append to the end of conversation history without modifying existing tool declarations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Video generation requires `BYTEPLUS_API_KEY` for SeaDance image-to-video motion synthesis.
- Voiceover synthesis requires `ELEVENLABS_API_KEY`.
- Stills generation requires `GEMINI_API_KEY` or `OPENAI_API_KEY`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
