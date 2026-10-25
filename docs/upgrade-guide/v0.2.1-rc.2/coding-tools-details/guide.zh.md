---
kind: upgrade-guide
description: "代码工作工具默认关闭，并控制 Chat 中的技术性工具结果、技能说明和源码预览。"
---

# 代码工作工具控制 Chat 技术详情

[English](guide.md) | 中文

## 变更

没有已保存设置或 profile 覆盖时，`ui-settings.enabled` 偏好默认为 `false`。此前默认值为 `true`。已保存的显式值仍然生效。

关闭代码工作工具后，Chat 显示工具活动和状态，不显示原始参数、结果正文、源码目录路径或工具文件预览链接。skill（技能）加载显示名称，不显示说明；skill 引用保留为标签。即使自定义 Definition 使上下文和系统提示词节点可见，其 renderer 也会隐藏技术正文；默认 Chat 在所有模式下都隐藏普通上下文和系统提示词。问题、待办事项、Auto review 理由和已展示的交付物仍然可用。会话记录和模型输入保持不变。

自定义 `tool.call.toolview` 组件会收到必需的 `showDetails` owner 属性。该值为 `false` 时，组件必须隐藏技术性正文和源码预览操作。

## 迁移

1. 在设置 → 通用设置中，关闭**显示代码工作视图**以显示活动摘要，或开启以查看技术详情。已保存的 `ui-settings.enabled: true` 在升级后仍然开启；要使用普通 Chat，请显式关闭。
2. 要在 profile 中设置继承偏好，请把其 `ui-settings` 条目的 `config.enabled` 设为 `false` 或 `true`。已保存设置优先于此默认值。
3. 更新自定义工具视图，读取 `showDetails`，在该值为 `false` 时隐藏技术性内容和文件导航。
4. 加载一个技能并读取一个文件。关闭开关时，两行均不提供内容或内部文件预览操作。开启开关后可查看技术详情。
