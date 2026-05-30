---
name: agent-adapter-pattern
description: 多 Agent 统一接口的适配器层设计
metadata:
  type: skill
  source: hand-crafted
  created_at: 2026-05-20
---

# When to use
- 要在一个产品里同时接入 ≥ 2 个 LLM/Agent 厂商
- 厂商 API 有差异（消息格式、流式协议、tool calling 格式）

# How to do

## 1. 统一接口 `IAgent`
```ts
interface IAgent {
  meta: Agent;                                // 元数据（名称/能力/头像）
  chat(input: AgentInput): AsyncIterable<AgentChunk>;
  healthCheck(): Promise<boolean>;
}
```

## 2. BaseAgent 抽出公共逻辑
- 流式吐字模拟（仅 mock 阶段需要）
- 错误捕获 → yield `error` chunk
- done 收尾

## 3. 每个厂商一个 Adapter
- ClaudeCodeAgent 调 Anthropic API
- CodexAgent 调 OpenAI Codex / Responses API
- OpenCodeAgent 调本地 / 自托管 LLM
- CustomAgent 把用户 systemPrompt 注入任意底层 LLM

## 4. Registry 集中管理
- 注册中心维护 id → instance 映射
- 提供 `findByCapability(cap)` 给 Orchestrator 智能派单
- 用户自建 agent 走 `createCustom(opts)` 即可注册

# Example

`src/agents/` 整体就是这套模式：
- `base.ts` BaseAgent
- `claudeCode.ts` / `codex.ts` / `openCode.ts` / `custom.ts` 4 个适配器
- `registry.ts` 单例注册中心

# Pitfalls

- ❌ 把"重试 / 限流 / 计费"塞进 Agent 自身 → 每个 adapter 都要写一遍
- ✅ 把这些"横切关注点"放在 Registry / Scheduler 层，adapter 只关心"调用 + 转换格式"
- ❌ AgentChunk 类型过宽（如 `any`），下游 UI 没法穷举处理
- ✅ AgentChunk 是 discriminated union，让下游 switch 时编译期就能查全
