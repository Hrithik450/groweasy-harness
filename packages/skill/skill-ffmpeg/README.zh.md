---
description: "用于视频编辑工作流的随包 FFmpeg 滤镜、编码器与合成技能提供方。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-ffmpeg

[English](README.md) | 中文

## 概述

本软件包提供内置的 `ffmpeg` 技能，作为 FFmpeg 滤镜、编码器和合成语法的权威参考。它可防止模型在生成视频片段、幻灯片、转场或合成 Reels 时虚构不受支持的选项或猜测复杂的滤镜图参数。

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
- name: '@deepseek-ai/dsh-skill-ffmpeg'
- name: '@deepseek-ai/dsh-tool-skill'
```

-----

<a id="understand-the-implementation"></a>
## 了解实现

该插件挂载随包 `SkillProvider`，向技能注册表暴露 `ffmpeg` 候选条目。Agent 加载该技能时，将直接读取 `assets/ffmpeg/SKILL.md`。

-----

<a id="further-exploration"></a>
## 延伸探索

- [技能注册表](../skill/README.zh.md) — 注册与生命周期约定。
- [技能工具](../tool-skill/README.zh.md) — 会话目录展示与加载工具。

-----

<a id="model-experience"></a>
## 模型体验

### ffmpeg skill

#### What the model sees

模型会在会话技能目录中看到带有描述的 `ffmpeg`，并在按需加载该技能时获取完整的滤镜与编码器参考手册。

#### Token effect

目录条目在每次请求中消耗固定数量的 Token，而完整参考手册仅在显式调用时才加载到历史记录中。

#### KV Cache effect

技能指令追加到对话历史记录的末尾，不会修改既有的工具声明。

## 已知局限与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 需要宿主或沙盒内提供 `ffmpeg` 二进制程序以执行命令。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
