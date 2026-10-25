---
kind: upgrade-guide
description: "Coding Tools defaults to off and controls technical Tool results, skill instructions, and source previews in Chat."
---

# Coding Tools controls technical Chat details

English | [中文](guide.zh.md)

## Change

The `ui-settings.enabled` preference defaults to `false` when no saved setting or profile override exists. Previously it defaulted to `true`. A saved explicit value still applies.

With Coding Tools off, Chat shows Tool activity and status without raw arguments, result bodies, source-directory paths, or tool file-preview links. Skill loads show the skill name without instructions; skill references remain labels. Context and system-prompt renderers withhold technical bodies even if a custom Definition makes those nodes visible; the default Chat keeps ordinary context and system prompts hidden in every mode. Questions, to-dos, Auto review reasons, and presented deliverables remain available. Session recording and model inputs are unchanged.

Custom `tool.call.toolview` components receive the required `showDetails` owner prop. They must suppress technical bodies and source-preview actions when it is `false`.

## Migration

1. In Settings → General, turn **Show coding view** off for activity summaries, or on for technical inspection. A saved `ui-settings.enabled: true` remains enabled after upgrading; turn it off explicitly for normal Chat.
2. To set the inherited preference in a profile, set `config.enabled` on its `ui-settings` row to `false` or `true`. Saved settings take precedence over this default.
3. Update custom Tool views to read `showDetails` and withhold technical contents and file navigation when it is `false`.
4. Load a skill and read a file. With the switch off, neither row exposes its contents or an internal file-preview action. Turn it on to enable technical inspection.
