# AgentHub Orchestrator 2.1 — 多Agent协作通信与上下文流转改进计划

> **版本**: v2.1 | **日期**: 2026-06-10 | **状态**: 待确认
> **基于**: Orchestrator 2.0 实现 + 本次诊断发现的 DAG死锁 / 无交互暂停 / Agent隔离 三大根因

---

## 一、当前问题完整诊断

### R1: DAG 死锁 — 上游失败导致下游永久阻塞

**位置**: `scheduler.ts:282`

```typescript
t.dependsOn.every(d => finished.has(d))  // 只认 finished，不认 failed
```

当一个上游任务失败（进入 `failed` 集合），所有依赖它的下游任务永远无法变为就绪。最终调度循环因 `ready.length === 0 && inflight.size === 0` 退出，留下大量 `pending` 任务。

**现象**: PMO 报告 0/6 成功、2 个失败、4 个从未启动。

### R2: 无用户交互暂停 — Agent 问问题但流程不等待

**位置**: `appStore.ts:runOrchestrated` → `scheduler.ts:runOne`

Agent 生成 `ChoiceCards` UI 组件向用户提问（如"选哪种风格？"），但调度器视其为普通 text chunk。任务标记为"完成"后，下游任务带着空上下文继续执行。用户的选择永远不会传回给等待中的 Agent。

### R3: Agent 完全隔离 — 各干各的，无法在前人产出上迭代

**位置**: `scheduler.ts:128-134`

```typescript
const input: AgentInput = {
    conversation: context.conversation,
    history: context.history,
    userPrompt: plan.intent,  // ← 所有 Agent 收到相同的原始意图
    task,                       // ← task 里没有上游产出
};
```

Agent A 生成的 HTML 骨架不会传给 Agent B（做样式）。每个 Agent 都从零开始理解 `plan.intent`，无法协作迭代。

### R4: 产物绑定缺失 — producedArtifactId 从未填充

**位置**: `scheduler.ts:163` vs `appStore.ts:onTaskDone`

`scheduler.ts` 在 `artifact-draft` chunk 时调用 `addArtifactRef`（写入 Blackboard），但**从未设置 `task.producedArtifactId`**。导致 PMO 报告中的"产物"部分始终为空。

### R5: 上下文注入未生效 — Blackboard 摘要从未注入 Agent System Prompt

**位置**: `supervisor.ts:getAgentContextInjection` 已实现但 `remoteAgent.ts` / `agents.ts` 从未调用

Agent 不知道 Blackboard 上有其他 Agent 共享的 facts/decisions/artifacts，等于 Blackboard 模块白写了。

---

## 二、目标业务流程

```
用户输入
  │
  ▼
┌─────────────────────────────────────────────┐
│ 1. 意图分类 + 任务拆解 (IntentClassifier)      │
│    · 关键词快路径 / LLM 智路径                 │
│    · 输出: DAG plan (≤6 tasks, depth≤3)       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 2. Agent 委派 (AgentSelector)                │
│    · 6因子加权: 能力35% + 专业10% + 负载20%   │
│    · 多样性奖励: 避免同一Agent被重复分配        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 3. 并行执行 (DAG Scheduler)                   │
│    · Phase 1: 无依赖任务并行启动               │
│    · Phase 2+: 上游完成后下游自动触发          │
│    · 每任务注入: Blackboard上下文 + 上游产物    │
└──────────────────┬──────────────────────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
   Agent A     Agent B     Agent C
      │            │            │
      ├─ 产出代码 ─┤─ 产出样式 ─┤─ 审查      │
      │  或        │  或        │  或        │
      ├─ ChoiceCards (暂停等用户)              │
      │            │            │
      └────────────┼────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ 4. 用户交互暂停 (Human-in-the-Loop)           │
│    · Agent 发出 ChoiceCards → 任务挂起        │
│    · 用户选择 → 回调注入 → 任务恢复            │
│    · 超时保护: 30分钟无响应自动回退            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 5. 产物合并 + 冲突解决 (PMO Synthesizer)       │
│    · HTML/CSS/JS 多路合并                     │
│    · 样式冲突检测 → CSS变量统一                │
│    · 引用完整性校验 (JS引用的DOM是否存在)       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 6. 质量审查 (Critic Agent)                   │
│    · 4维度评分: 完整性/代码质量/安全性/可用性   │
│    · 策略选择: LLM-as-Judge (代码)            │
│    · 低于阈值 → 退回修订 (最多2轮)             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 7. PMO 报告 + 产物展示                        │
│    · 结构化报告 (成功/降级/失败 + 产物清单)     │
│    · 产物自动在右侧面板打开预览                 │
└─────────────────────────────────────────────┘
```

---

## 三、改进方案

### Phase 1: 修复致命缺陷（1天）

#### 1.1 修复 DAG 死锁

**改动**: `scheduler.ts` — 主循环的就绪检查

```typescript
// 旧: 依赖必须在 finished 中 → 失败的上游导致死锁
t.dependsOn.every(d => finished.has(d))

// 新: 依赖在 finished 或 failed 中都算"已解决"
// failed 的依赖 → 下游仍可执行（带降级标记）
t.dependsOn.every(d => finished.has(d) || failed.has(d))
```

同时，当任务因上游失败而启动时，注入警告上下文：
```
⚠️ 上游任务 "XXX" 失败。请在能力范围内尽量覆盖其产出。
```

#### 1.2 修复产物绑定

**改动**: `scheduler.ts:runOne` — 在 `artifact-draft` chunk 时填充 `task.producedArtifactId`

```typescript
if (chunk.type === 'artifact-draft') {
    if (!task.producedArtifactId) {
        task.producedArtifactId = chunk.name; // 绑定首个产物
    }
    // ...
}
```

#### 1.3 修复 `onTaskDone` 中 `task` 引用问题

**改动**: `appStore.ts:onTaskDone` — 确保使用 `plan.subTasks` 中实际的任务对象状态

当前使用的是闭包捕获的 `task` 参数引用，但 `task.status` 被调度器在 `runOne` 内直接修改（`task.status = 'fallback'` 等）。需要确保 plan card 的更新读取到最新状态。

---

### Phase 2: 上下文流转与 Agent 通信（2天）

#### 2.1 上游产物注入

**改动**: `scheduler.ts` — 构建 AgentInput 时注入上游产出

```typescript
// 收集已完成的上游任务产物
const upstreamOutputs: string[] = [];
for (const depId of task.dependsOn) {
    const depTask = plan.subTasks.find(t => t.id === depId);
    if (depTask?.output) {
        upstreamOutputs.push(`[${depTask.title}]: ${depTask.output}`);
    }
}

const input: AgentInput = {
    conversation: context.conversation,
    history: context.history,
    userPrompt: plan.intent,
    task,
    // 新增: 上游上下文
    upstreamContext: upstreamOutputs.length > 0
        ? `以下是你依赖的上游任务产出，请基于这些产出继续工作:\n${upstreamOutputs.join('\n')}`
        : undefined,
};
```

#### 2.2 Blackboard 上下文注入

**改动**: `remoteAgent.ts` + `server/agents.ts` — 注入 Blackboard 摘要到 System Prompt

```
当前 Blackboard 状态:
  📋 已确认事实:
    · 项目名: AI招聘管家
    · 主色调: 绿色 #10B981
    · 风格: 现代科技风
  ✅ 已做决策:
    · 布局: Hero + Features + CTA 三栏
  📦 已有产物:
    · index.html (agent_claude_code) — 页面骨架
    · style.css (agent_codex) — 基础样式变量
```

**实施**: `getAgentContextInjection(planId, agentId)` 已实现，只需在 `POST /api/agents/chat` 中调用并拼入 system prompt。

#### 2.3 前端架构: 从 stateless scheduler 到 stateful orchestrator

将 `runOrchestrated` 从一个函数升级为一个有状态的 OrchestratorSession：

```typescript
interface OrchestratorSession {
    planId: string;
    state: 'planning' | 'executing' | 'waiting_user' | 'merging' | 'done';
    blackboard: BlackboardData;
    pendingUserInput?: {
        taskId: string;
        agentId: string;
        componentType: string;  // 'ChoiceCards' | 'GenUI' | ...
        prompt: string;
        resolve: (userInput: unknown) => void;
    };
}
```

---

### Phase 3: 用户交互暂停与恢复（2天）

#### 3.1 GenUI 组件检测

**改动**: `fenceExtractor.ts` — 识别 ` ```ui { "component": "ChoiceCards", ... } ``` ` 围栏

当 LLM 输出 GenUI 组件（`ChoiceCards`、`FormField` 等），提取其 JSON 并作为 `ui-component` chunk 类型发出：

```typescript
// 新增 chunk 类型
{ type: 'ui-component', component: 'ChoiceCards', props: {...} }
```

#### 3.2 暂停与恢复机制

**流程**:

```
Agent A 生成 → ```ui ChoiceCards { "title": "选择风格", options: [...] } ```
    │
    ▼
Scheduler 检测到 ui-component chunk
    │
    ▼
Scheduler 暂停该任务流 (不标记为 done)
    │
    ▼
前端渲染 ChoiceCards 组件 → 展示给用户
    │
    ▼
用户点击选择 "现代科技风"
    │
    ▼
前端回调: POST /api/agents/ui-input { conversationId, componentId, value }
    │  (此端点已存在! agents.ts:242)
    ▼
后端将用户选择作为 system message 写入 conversation
    │
    ▼
Scheduler 检测到 user input → 重新调用 Agent 继续
    │  (携带之前的上下文 + 用户选择)
    ▼
Agent 基于用户选择继续生成代码
```

**关键实现**:
- `scheduler.ts` 中新增 `ui-component` chunk 处理 → 不标记失败，设置 `pendingUserInput`
- `runOrchestrated` 中监听 Zustand store 的消息变更 → 检测到用户回复后恢复任务

#### 3.3 超时保护

如果用户 30 分钟内无响应 → 自动选择默认选项继续，或标记任务为降级完成。

---

### Phase 4: 产物合并与质量保证（2天）

#### 4.1 多 Agent 产物合并 (PMO Synthesizer)

**场景**: Agent A 生成 `index.html`，Agent B 生成 `style.css`，Agent C 生成 `script.js`

**实施**:
- `pmoSynthesizer.ts` 已实现 `detectConflicts()` — 检测同 artifact 多路修改
- 新增 `merge()` 方法：收集所有 artifact → 检查引用完整性 → 生成合并报告

```
合并检查项:
  ✓ index.html 引用了 style.css (link标签存在)
  ✓ index.html 引用了 script.js (script标签存在)  
  ✓ style.css 变量命名一致 (--primary-green)
  ✗ script.js 引用的 DOM id "hero-section" 在 index.html 中不存在 → 标记冲突
```

#### 4.2 Critic Agent 集成

**流程**: 所有 Agent 产出 → Critic 审查 → accepted / revised / rejected

**策略选择**（已实现 `selectReviewStrategy`）:
- 代码生成 → `llm-as-judge`
- 文案/创意 → `majority-vote`
- 关键决策 → 暂停等用户确认

**实施**: 在 `schedule()` 完成后、`summarize()` 之前插入 Critic 评审步骤。

---

### Phase 5: 可观测性与韧性（1天）

#### 5.1 前端执行面板

在 PMO Plan Card 旁边新增实时进度面板：

```
📊 执行进度
  ✅ 品牌文案 — DocAgent — 850字
  ✅ 页面骨架 — ClaudeCode — index.html (2.4KB)
  🔄 样式打磨 — Codex — 进行中 (3200 chars, 15s)
  ⏳ 交互逻辑 — 等待 样式打磨 完成
  ⏸️ 部署上线 — 等待用户确认风格选择
```

**实施**: 利用 `BlackboardCard.tsx`（已新建但未接入）展示实时 Blackboard 状态。

#### 5.2 前端降级策略

- 后端不可用 → 本地关键词 fallback（保留现有 `planner.ts` 作为兜底）
- Agent 连续失败 3 次 → 跳过该任务，标记降级
- 总超时 → 已产出的内容保留，未开始的标记失败

---

## 四、实施路线图

| Phase | 内容 | 预计 | 依赖 |
|-------|------|------|------|
| **Phase 1** | 修复 DAG 死锁 + 产物绑定 + 引用修复 | 1天 | 无 |
| **Phase 2** | 上游产物注入 + Blackboard 上下文 + OrchestratorSession | 2天 | Phase 1 |
| **Phase 3** | GenUI 检测 + 暂停/恢复 + 超时保护 | 2天 | Phase 2 |
| **Phase 4** | 产物合并 + Critic 集成 | 2天 | Phase 3 |
| **Phase 5** | 前端进度面板 + 降级策略 | 1天 | Phase 4 |

**总预计**: 8天 | **核心交付**: Phase 1-3（5天）即可让多 Agent 协作跑通

---

## 五、关键设计决策

### 5.1 为什么不在 Agent 之间建直接通信通道？

bMAS (2025) 和 Anthropic 的研究一致表明：**中心化 Blackboard 优于全连接 Agent 通信**。

- 全连接 = O(n²) 消息复杂度，token 消耗爆炸
- Blackboard = 所有 Agent 读写同一共享空间，Supervisor 仲裁
- AgentHub 的 IM 聊天 UI 天然就是 Blackboard 的可视化形式

### 5.2 为什么用暂停恢复而不是把 ChoiceCards 当"正常输出"？

当前实现把 ChoiceCards 当 text chunk 处理，任务"完成"但产出是空的。正确做法：

- ChoiceCards 是 **交互请求**，不是产出
- 任务应挂起等待用户输入，然后恢复继续
- 这符合 Anthropic "Human-in-the-Loop" 模式

### 5.3 上下文注入的粒度

每个 Agent 看到的上下文包括：
1. **全局**: 用户原始意图 + Blackboard 公共区摘要（facts, decisions, constraints）
2. **上游**: 直接依赖任务的产出摘要（最多 500 字）
3. **私有**: 自己的 drafts 和 concern 记录

不注入全部上游产出的完整内容（太长，token 浪费），而是注入结构化摘要。

---

## 六、风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| GenUI 检测误判（普通 ```json 被当成 ChoiceCards） | 低 | 白名单校验：`component` 字段必须在已知组件列表中 |
| 暂停恢复导致会话过长 | 中 | 上下文窗口管理：超过 80% 时自动摘要压缩 |
| Critic 误判导致循环修订 | 中 | 最大 revision 2轮，超限人工介入 |
| 上下文注入增加 token 消耗 | 低 | Blackboard 摘要 ≤ 500 字，上游摘要 ≤ 500 字 |

---

## 七、成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 多任务计划成功率 | ~0% (DAG死锁) | >80% |
| Agent 间上下文感知 | 0% | 100% (Blackboard注入) |
| 用户交互暂停正确性 | 0% (无此机制) | >90% (正确识别+恢复) |
| 产物合并正确性 | 无合并 | >80% (自动合并无冲突) |
| 单次编排端到端耗时 | N/A (从不完成) | <5min (3 Agent × 60s avg) |
