---
description: "用于 DeepSeek Harness 的随包数字营销、效果广告创意、SEO 与广告生成技能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-marketing

[English](README.md) | 中文

## 概述

本软件包为 DeepSeek Harness 提供内置的营销、效果广告创意、视频广告制作和 SEO 技能。它包含用于制作 9:16 竖版口播营销广告的工具，支持单人物一致性、快速切换快节奏剪辑、用户确认门禁、BytePlus SeaDance 动作合成、ElevenLabs 配音及独立 FFmpeg 本地合成。

## 目录

- [使用此软件包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸探索](#further-exploration)
- [模型体验](#model-experience)
- [已知局限与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此软件包

与技能注册表和 `dsh-tool-skill` 一同挂载技能提供方。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-marketing'
- name: '@deepseek-ai/dsh-tool-skill'
```

-----

<a id="understand-the-implementation"></a>
## 了解实现

该插件挂载随包 `SkillProvider`，将营销技能候选条目（`video-generation`、`marketing-poster`、`creative-brief-generator`、`competitor-research`、`marketing-strategist`、`facebook-audience-builder`、`lead-cost-calculator`、`keyword-suggestions`、`ad-copywriter`）注入 `ctx.skills`。Agent 加载技能时，将直接从 `assets/<skill>/SKILL.md` 读取对应指令。

-----

<a id="further-exploration"></a>
## 延伸探索

- [技能注册表](../skill/README.zh.md) — 注册与生命周期约定。
- [FFmpeg 技能](../skill-ffmpeg/README.zh.md) — 独立 FFmpeg 滤镜与合成参考手册。
- [技能工具](../tool-skill/README.zh.md) — 会话目录展示与加载工具。

-----

<a id="model-experience"></a>
## 模型体验

### marketing skill

#### What the model sees

模型会在会话技能目录中看到 `video-generation` 与营销技能列表，并在加载时获取精准的操作手册、时间轴节奏规则与本地生成指令。

#### Token effect

目录条目在每次请求中消耗固定数量的 Token，而完整的营销技能正文仅在按需调用时才会加载。

#### KV Cache effect

技能指令追加到对话历史记录的末尾，不会修改既有的工具声明。

## 已知局限与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 视频生成需要 `BYTEPLUS_API_KEY` 以进行 SeaDance 图生视频动作合成。
- 旁白配音合成需要 `ELEVENLABS_API_KEY`。
- 静态图像生成需要 `GEMINI_API_KEY` 或 `OPENAI_API_KEY`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
