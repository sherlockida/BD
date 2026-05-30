---
name: orchestrator-task-planning
description: PMO 主 Agent 拆任务 + 并行调度的工程化做法
metadata:
  type: skill
  source: hand-crafted
  created_at: 2026-05-20
---

# When to use
- 多 Agent 协作场景，用户输入是"一句话需求"（如"做个落地页"）
- 需要把模糊意图转成可执行的子任务列表

# How to do

## 1. Planner：用 LLM 输出 DAG（JSON Schema 约束）
- 给 LLM 一个 "你是 PMO" 的 system prompt
- 让它输出符合 JSON Schema 的 `{ subTasks: SubTask[] }`
- MVP 阶段先用关键词启发式（参见 `src/orchestrator/planner.ts`），后续可平滑替换

## 2. Scheduler：拓扑排序 + Promise.race 循环
```
while (not all done):
  ready = subTasks 中"依赖已完成 + 自己未派发"
  for each ready: 派发并放入 inflight Map
  await Promise.race(inflight)   // 任意一个完成就继续
```
**关键点**：
- 用 `Promise.race` 而非 `Promise.all`，否则慢任务会卡住后续派发
- 用 finally 清理 inflight，防止内存泄露

## 3. 失败降级：包在调度层
- 每个任务带 `fallbackAgentId`
- try 主 agent → catch → try fallback → 都失败标记 task.failed
- 在群里发一条 system message 让用户知情

## 4. Aggregator：写"周报"收尾
- 统计 done/failed/fallback 数
- 列出产物清单
- 这一步是"用户感知 PMO 在工作"的最强信号

# Example

`src/orchestrator/` 三个文件就是这套范式的最小实现：
- `planner.ts` 拆任务
- `scheduler.ts` 调度
- `aggregator.ts` 汇报

# Pitfalls

- ❌ 让每个 Agent 自己 retry → 重试逻辑分散难维护
- ❌ 同步阻塞等所有任务完成才更新 UI → 用户以为系统挂了
- ✅ 每个 task 一条独立流式消息 + plan card 状态同步更新
