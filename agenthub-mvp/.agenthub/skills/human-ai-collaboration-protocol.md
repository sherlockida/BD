---
name: human-ai-collaboration-protocol
description: 与 AI 协作开发本平台时遵守的"PMO 视角"工程化流程
metadata:
  type: skill
  source: hand-crafted
  created_at: 2026-05-20
---

# When to use
当一个团队（人 + 多 Agent）要交付一个有规模的项目，而非"问一个简单代码题"。

# How to do

## 阶段 1 · Spec
- 用户口述需求 → AI 生成 `SPEC.md` 草案
- Review 后才进入下一阶段
- 关键字段：背景 / 目标 / 用户故事 / 验收标准 / 非目标 / 风险

## 阶段 2 · Rules
- 项目级 `RULES.md` 注入每个 Agent 的 system prompt
- 包括：通信约定 / 代码规范 / 失败处理 / 安全 / 沉淀

## 阶段 3 · Skills
- `.agenthub/skills/*.md` 沉淀可复用经验
- 每次新对话按 trigger 匹配召回（RAG）

## 阶段 4 · TaskList
- 把 Spec 拆成 N 个原子 TaskList 项
- 每完成一项立刻标 completed（不要批量）
- 进入下一项前的 5 秒：人或 PMO 自检"上一项的产物是否符合 Rules"

## 阶段 5 · AB 互检
- 让一个 agent 写、另一个 agent review
- 真实场景：Claude Code 写实现 + Codex 写测试
- review 输出"通过 / 不通过 + 理由"，不通过自动打回

## 阶段 6 · 复盘
- 整个 task 完成后由 PMO 复盘
- 提取候选 Skill → 用户一键沉淀
- 这一步是"持续进化"的关键

# Example
我们用这 6 个阶段从 0 到 MVP 交付了 AgentHub：
1. Spec：`SPEC.md`
2. Rules：`RULES.md`
3. Skills：本目录所有 .md
4. TaskList：8 个任务（见根 README）
5. AB 互检：手工执行（未自动化）
6. 复盘：本 skill 文件就是复盘产出之一

# Pitfalls
- ❌ 跳过 Spec 直接 Code → 后期返工
- ❌ 沉淀 Skill 时只写 What 不写 When/Why → 召回失败
- ✅ Skill 文件必带 `When to use / How to do / Pitfalls` 三段
