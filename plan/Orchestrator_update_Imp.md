# AgentHub Orchestrator 2.0 — 智能多 Agent 编排升级方案

> **版本**: v2.1 | **日期**: 2026-06-09 | **状态**: 待确认
> **基于**: 当前 Orchestrator 19 项弱点分析 + LangGraph / CrewAI / AutoGen / Swarm / Anthropic / bMAS 6 个框架调研

---

## 一、当前问题总结

经过对 `orchestrator/planner.ts`、`scheduler.ts`、`aggregator.ts` 和后端 `plannerService.ts` 的完整审查，共识别 **19 个缺陷**，归纳为 5 类：

### 架构性缺陷

| # | 问题 | 严重度 |
|---|------|--------|
| 1 | **双规划器分歧** — 前端 planner.ts 和后端 plannerService.ts 各自维护不同的关键词模式，无统一真相源 | 高 |
| 2 | **计划无持久化** — OrchestratorPlan 仅存于 Zustand 内存，刷新即丢失 | 高 |
| 3 | **无并发保护** — 同一 session 多次调用 runOrchestrated 会损坏共享状态 | 高 |
| 4 | **无超时/取消** — 任务挂起时整个调度器永久阻塞 | 高 |

### 规划器缺陷

| # | 问题 | 严重度 |
|---|------|--------|
| 5 | **纯关键词匹配** — 无法区分"做一个网站"和"检查网站 SSL 证书"，前者应拆 4 子任务后者只需 1 个 | 高 |
| 6 | **LLM 依赖映射错误** — tryLlmPlan 中 dependsOn 映射使用位置推断而非 LLM 返回的实际 ID | 高 |
| 7 | **LLM 输出无 Schema 验证** — JSON 解析失败静默降级为单任务计划 | 中 |
| 8 | **Agent 选择逻辑脆弱** — findByCapability 全局搜索可能选出会话外的 Agent | 中 |
| 9 | **默认兜底无回退** — 前端默认单任务路径未设置 fallbackAgentId | 低 |

### 调度器缺陷

| # | 问题 | 严重度 |
|---|------|--------|
| 10 | **无进度监控** — 无法感知任务是否"卡住"还是正常执行 | 高 |
| 11 | **无重试退避** — 瞬时错误（网络抖动、限流）直接触发回退或失败 | 中 |
| 12 | **集合并发写入隐患** — finished/failed 集合在并发 runOne 中无同步机制 | 低 |

### 聚合器缺陷

| # | 问题 | 严重度 |
|---|------|--------|
| 13 | **producedArtifactId 从未填充** — PMO 报告中的"产物"部分永远是空列表 | 高 |
| 14 | **状态跟踪不一致** — onTaskDone 中的状态可能与计划卡片状态竞态 | 中 |

### 体验缺陷

| # | 问题 | 严重度 |
|---|------|--------|
| 15 | **无进度可视化** — 计划卡片只显示 pending/running 状态，无百分比或阶段性展示 | 中 |
| 16 | **计划卡片未持久化** — planMsg 从未调 apiPostMessage，刷新后消失 | 高 |
| 17 | **文本缓冲区跨会话共享** — textBuffer 是模块级全局变量，多会话并发会污染 | 中 |
| 18 | **Agent 间无直接通信** — 子任务 Agent 完全隔离，无法在运行中交换信息或协作决策 | 高 |
| 19 | **无产物质量检查** — Agent 输出直接使用，无验证/评审环节 | 中 |

---

## 二、业界方案精华提炼

### 从每个框架汲取的关键设计

| 框架 | 核心洞察 | 对 AgentHub 的适配价值 |
|------|----------|----------------------|
| **LangGraph** | 类型化状态图 + Checkpointer 持久化 + 条件路由 | 计划状态持久化到 DB，支持时间旅行调试 |
| **CrewAI** | Role-based Agent + Hierarchical Manager 动态委派 | Agent 角色定义 + Manager 动态决策替代静态关键词匹配 |
| **AutoGen/MagenticOne** | Task Ledger + Progress Ledger + Stall Detection | 进度跟踪 + 停滞检测 → 自动重规划 |
| **OpenAI Swarm** | 显式 Handoff + 无状态设计 + 全步骤可追踪 | Agent 间清晰的交接协议，上下文不污染 |
| **Anthropic** | Orchestrator-Workers + Evaluator-Optimizer + 两阶段并行 | **核心架构参考** — 中心编排者动态分配 + 评估者质量把关 |
| **bMAS (2025)** | 黑板架构 + 公共/私有空间 + 控制单元按轮选择 | **通信机制参考** — 共享内存降低 token 成本，私有空间支持辩论 |
| **SagaLLM (2025)** | Saga 事务 + 补偿操作 + 独立验证 | 多步工作流的部分失败回滚机制 |

### 五大设计原则（横跨所有框架）

1. **从简单开始** — Anthropic 核心哲学：先用直接 API 调用，复杂到需要时才加框架层
2. **状态可见即智能** — LangGraph 的类型化状态、AutoGen 的消息线程都让 Agent 推理过程透明化
3. **并行是图原语，不是 LLM 的活** — 并行调度应由编排层处理，Agent prompt 中不应包含并行逻辑
4. **两层决策** — 先用廉价/快速的检查（规则、启发式），必要时再升级到昂贵的 LLM 推理
5. **可调试性是隐藏要素** — 所有框架都强调多 Agent 系统极难调试，必须在设计阶段就考虑可观测性

---

## 三、Orchestrator 2.0 设计方案

### 3.1 总体架构

```
                          ┌─────────────────────────────┐
    用户输入 ─────────────▶│    IntentClassifier          │
                          │    (意图分类 + 复杂度评估)      │
                          └──────────┬──────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
            简单任务          中等任务           复杂任务
          (Keyword快路径)   (LLM单Agent)    (Supervisor-Worker)
                    │                │                │
                    └────────────────┼────────────────┘
                                     ▼
                          ┌─────────────────────────────┐
                          │    Orchestrator Supervisor    │◀──── 人工介入
                          │  · 动态任务分解 (LLM)          │      (when needed)
                          │  · Agent 选择 & 委派            │
                          │  · 进度监控 & 停滞检测          │
                          │  · 动态重规划                   │
                          └──────────┬──────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
               Worker A         Worker B         Worker C
              (Code Agent)    (Design Agent)   (Doc Agent)
                    │                │                │
                    └────────────────┼────────────────┘
                                     ▼
                          ┌─────────────────────────────┐
                          │    Shared Blackboard          │
                          │  · Facts (事实库)              │
                          │  · Decisions (决策记录)        │
                          │  · Artifacts (产物引用)         │
                          │  · Private spaces (辩论空间)    │
                          └──────────┬──────────────────┘
                                     │
                          ┌──────────▼──────────────────┐
                          │    Critic / Evaluator        │
                          │  · 产物质量检查                │
                          │  · 投票/共识 (按任务类型)       │
                          │  · 信任度评分                  │
                          └──────────┬──────────────────┘
                                     │
                          ┌──────────▼──────────────────┐
                          │    PMO Synthesizer           │
                          │  · 多路结果合并                │
                          │  · 冲突解决                    │
                          │  · 最终报告生成                │
                          └─────────────────────────────┘
```

### 3.2 核心组件设计

#### 3.2.1 IntentClassifier — 意图分类器

**替代当前的纯关键词匹配，升级为三阶段分类：**

```
Stage 1: 关键词快速分类 (确定性, <10ms)
  ├─ 匹配已知的高频模式 → direct dispatch
  └─ 不能确定 → Stage 2

Stage 2: 复杂度评估 (规则引擎, <50ms)
  ├─ 计算复杂度分数: query_length + keyword_count + has_multi_domain + has_constraint
  ├─ 简单 (score<3) → 单 Agent 直接执行
  ├─ 中等 (3≤score<6) → LLM 单次分解
  └─ 复杂 (score≥6) → Supervisor-Worker 模式

Stage 3: LLM 意图理解 (需要时, ~1-2s)
  ├─ 深度意图分析 (不是关键词匹配，是语义理解)
  ├─ 领域识别 (前端/后端/数据/运维/设计)
  └─ 输出: 分类标签 + 复杂度 + 建议策略
```

**关键改进**：语义理解替代关键词匹配。LLM 能区分"做一个网站"（创建任务）和"检查网站 SSL"（诊断任务）。

#### 3.2.2 Orchestrator Supervisor — 智能编排主管

**核心角色**：LLM-powered 动态编排者，不是静态调度器。

```
Supervisor 职责:
├─ Plan: 根据 LLM 理解动态分解任务（非模板）
├─ Assign: 基于 Agent 当前负载 + 能力 + 历史表现 选择最优 Agent
├─ Monitor: 实时跟踪每个 Worker 的进度
├─ Intervene: 检测到停滞/低质量时触发 replan
├─ Coordinate: 管理 Agent 间通信（通过 Blackboard）
└─ Decide: 投票平局时做最终决策
```

**与当前 scheduler.ts 的关键区别**：

| 维度 | 当前 Scheduler | Supervisor 2.0 |
|------|--------------|----------------|
| 任务分解 | 静态关键词模板 | LLM 动态理解 + 迭代细化 |
| Agent 选择 | 硬编码优先级表 | 负载感知 + 能力匹配 + 历史成功率 |
| 进度感知 | 无（只等 Promise 完成） | 实时 token 计数 + artifact 生成率 + 停滞检测 |
| 动态调整 | 无 | 可中途添加/取消/重分配任务 |
| Agent 通信 | 无（完全隔离） | Blackboard 共享 + 可按需私聊 |
| 质量保证 | 无 | Critic 评审 + 投票/共识 |

**Supervisor System Prompt 设计**（核心提示词）：

```markdown
你是一个多 Agent 团队的编排主管（Orchestrator Supervisor）。

## 你的能力
- 分解用户需求为可并行的子任务
- 根据 Agent 专长分配任务
- 监控执行进度，必要时调整计划
- 汇总多路结果，解决冲突

## 你的约束
- 子任务数 ≤ 6（防止过度分解）
- 依赖链深度 ≤ 3 层
- 优先并行执行无依赖的子任务
- 每个子任务必须有明确的验收标准（Acceptance Criteria）

## 输出格式
{ "plan": [...], "parallelism": [...], "estimatedComplexity": "medium" }

## 你可以使用的 Agent
{availableAgents 列表，含角色描述和能力标签}
```

#### 3.2.3 Shared Blackboard — 黑板通信系统

**核心概念**：中心化知识库，所有 Agent 可读可写，替代当前的"完全隔离"模式。

```
Blackboard 数据结构:
{
  planId: string,
  
  // 公共区 — 所有 Agent 可见
  public: {
    facts: Fact[],           // 已确认的事实，如 "项目名：茶饮品牌"
    decisions: Decision[],   // 已做出的决策，如 "色调：抹茶绿 #6B8E23"
    artifacts: ArtRef[],     // 已产出的产物引用
    constraints: string[],   // 约束条件，如 "必须在移动端可用"
    progress: {              // 整体进度快照
      totalTasks: number,
      completed: number,
      currentPhase: string,  // "planning" | "building" | "styling" | "reviewing"
    }
  },
  
  // 私有区 — 仅特定 Agent 和 Supervisor 可见
  private: {
    [agentId]: {
      drafts: any[],         // 草稿（防止其他 Agent 看到半成品）
      concerns: string[],    // Agent 的疑虑或需要澄清的问题
      proposedChanges: any[],// 对其他 Agent 产物的修改建议
    }
  }
}
```

**为什么选 Blackboard 模式**：

- bMAS (2025) 实验证明：Blackboard 比全连接 Agent 通信 **token 消耗更低**且 **效果更好**（+4.33% vs CoT, +5.02% vs 静态 MAS）
- 公共/私有分离支持 **协作 + 辩论** 两种模式
- IM 聊天范式本身就是一种隐式的 Blackboard — AgentHub 只需将其结构化

**与 IM 聊天 UI 的融合**：
- Blackboard 的 `facts` 显示为聊天中的 "📋 事实卡片"
- `decisions` 显示为 "✅ 决策记录"
- `progress` 显示为 "📊 进度条"
- `concerns` 显示为 Agent 的 @Supervisor 私聊消息

#### 3.2.4 Critic / Evaluator — 质量评审 Agent

**新增专用 Agent**：`agent_critic`，能力标签 `review`。

```
Critic 工作流:
1. 接收 Worker 输出 → 按验收标准检查
2. 评分维度:
   ├─ 完整性 (是否满足 AC)
   ├─ 代码质量 (lintable? standards-compliant?)
   ├─ 安全性 (无 XSS/注入/密钥泄露)
   └─ 可用性 (移动端? 无障碍?)
3. 决策:
   ├─ 通过 (score ≥ 0.8) → 标记为 accepted
   ├─ 需要修订 (0.5 ≤ score < 0.8) → 退回 Worker + 修改建议
   └─ 拒绝 (score < 0.5) → 触发 replan / 更换 Agent
```

**按任务类型选择评审策略**（基于 ACL 2025 研究）：

| 任务类型 | 策略 | 原因 |
|---------|------|------|
| 推理/创意任务 | 多数投票 | 保留多样性，投票提高 +13.2% |
| 事实/知识任务 | 共识 | 减少幻觉，共识提高 +2.8% |
| 代码生成 | LLM-as-Judge | Anthropic 验证最可靠的评估方式 |
| 关键决策 | 人工确认 | 高风险操作需要最终人类确认 |

#### 3.2.5 Dynamic Replanner — 动态重规划

**替代当前的"失败即终止"模式**：

```
Stall Detection (借鉴 MagenticOne):
├─ track: 每个 Worker 的 token 输出速率
├─ stall: 连续 3 轮 (每轮 ~10s) 无 artifact 产出 → 标记停滞
├─ diagnose: Supervisor 分析停滞原因（方向错了? 能力不足? 依赖未满足?）
└─ replan: 调整策略 — 重新分配 / 拆分任务 / 简化要求 / 人工介入

Saga Compensation (借鉴 SagaLLM):
├─ 每个子任务定义 compensate() 操作
├─ 如果后续任务失败且前置任务已产生副作用: 执行补偿链
└─ 例如: Task A 创建了文件 → Task B 失败 → compensate(A): 回滚文件

Checkpoint Recovery:
├─ 每完成一个子任务 → 持久化 plan 状态到 DB
├─ 中断恢复时 → 从最后一个 checkpoint 继续
└─ 支持"时间旅行"：回退到任意历史状态重试
```

#### 3.2.6 PMO Synthesizer — 结果合成器

**升级当前的 aggregator.ts（仅统计成功/失败数量）为智能合成器**：

```
Synthesizer 职责:
├─ Merge: 合并多个 Agent 的并行产出 → 统一产物
├─ Resolve: 解决冲突（两个 Agent 修改同一文件 → 3-way merge）
├─ Polish: 统一风格（CSS 变量命名 / 代码格式 / 文案语调）
├─ Verify: 最终端到端验证（产物可用性检查）
└─ Report: 生成结构化 PMO 报告（非简单计数）

PMO 报告升级:
  旧: "📋 任务执行完成：3/4 成功 · 1 个降级"
  新: 
    📊 **项目交付报告**
    
    ✅ 已完成 (3/4)
    · 品牌文案 v2 — DocAgent — 850 字
    · 页面骨架 — ClaudeCode — index.html (2.4KB)
    · 样式主题 — Codex — theme.css (1.1KB)
    
    ⚠️ 降级完成 (1/4)
    · 部署上线 — OpenCode (原 Codex 失败) — https://xxx.vercel.app
    
    📝 Critic 评审
    · 代码质量: 8.2/10 — CSS 变量命名建议统一
    · 安全性: 通过 — 无 CSP/XSS 问题
    
    ⏱️ 总耗时: 18.3s | Token: 12,450
```

### 3.3 数据流

```
用户: "做一个茶饮品牌官网，带产品列表和下单功能"
                    │
                    ▼
IntentClassifier: complexity=high, domains=[frontend, ecommerce]
                    │
                    ▼
Supervisor.plan() ── LLM 调用 ──▶ {
  plan: [
    { id: t1, title: "品牌调研与文案撰写", agent: doc, deps: [] },
    { id: t2, title: "页面结构设计 (HTML骨架)", agent: claude, deps: [] },
    { id: t3, title: "可视化样式设计 (CSS)", agent: codex, deps: [t2] },
    { id: t4, title: "产品列表与购物车交互 (JS)", agent: claude, deps: [t2] },
    { id: t5, title: "移动端适配与无障碍", agent: codex, deps: [t3] },
    { id: t6, title: "代码审查与安全扫描", agent: critic, deps: [t3,t4] },
  ],
  parallelism: [[t1,t2], [t3,t4], [t5,t6]],
}
                    │
                    ▼
Supervisor.execute() ── Round 1: [t1, t2] 并行
                    │     Round 2: [t3, t4] 并行 (t2 完成后)
                    │     Round 3: [t5, t6] 并行 (t3,t4 完成后)
                    │
                    ▼
Blackboard: Agent 之间共享 facts/decisions/artifacts
                    │
                    ▼
Critic: 评审 t3,t4 产物 → 发现 t3 CSS 变量命名不统一
                    │     → 退回 t3 + 修改建议
                    │     → t3 修订 → Critic 再次评审 → 通过
                    │
                    ▼
Supervisor.monitor(): 所有任务完成 / Critic 通过
                    │
                    ▼
PMO Synthesizer.merge(): 合并 t1(文案) + t2+t3+t4(代码) + t5(适配)
                    │
                    ▼
Chat UI: PMO 结构化报告 + 产物自动打开预览
```

---

## 四、实施路线图

### Phase 1: 基础设施（1-2 天）

**目标**：为智能编排奠定基础，不改变现有行为

| 步骤 | 内容 | 改动文件 |
|------|------|---------|
| 1.1 | 统一规划器：删除前端 `planner.ts`，后端 `plannerService.ts` 成为唯一真相源 | planner.ts, plannerService.ts, appStore.ts |
| 1.2 | Plan 持久化：新增 `orchestrator_plans` 表，所有计划状态变更写入 DB | schema.ts, plannerService.ts |
| 1.3 | 修复 LLM 依赖映射：`tryLlmPlan` 使用 LLM 返回的实际 ID 映射依赖 | plannerService.ts |
| 1.4 | 增加 Zod schema 验证：LLM 输出的 JSON 在解析后做 schema 校验 | plannerService.ts |
| 1.5 | 生产 artifact 绑定：在 `onTaskDone` 中填充 `producedArtifactId` | scheduler.ts, appStore.ts |
| 1.6 | 增加超时机制：每个子任务 120s 超时，计划总超时 600s | scheduler.ts |

### Phase 2: 智能规划（2-3 天）

**目标**：引入 LLM 驱动的动态规划，替代关键词模板

| 步骤 | 内容 | 改动文件 |
|------|------|---------|
| 2.1 | IntentClassifier 实现：三阶段分类（关键词 → 规则 → LLM） | 新建 `classifier.ts` |
| 2.2 | Supervisor System Prompt 设计 + 实现 | plannerService.ts |
| 2.3 | 动态 Agent 选择：基于负载 + 能力 + 历史成功率的加权选择 | 新建 `agentSelector.ts` |
| 2.4 | 迭代分解：Supervisor 可中途细化子任务（复杂任务先粗拆再细拆） | plannerService.ts, scheduler.ts |

### Phase 3: 协作与通信（2-3 天）

**目标**：Agent 间能感知彼此、交换信息、避免冲突

| 步骤 | 内容 | 改动文件 |
|------|------|---------|
| 3.1 | Blackboard 数据结构实现（内存版，后续升级到 Redis） | 新建 `blackboard.ts` |
| 3.2 | Agent 上下文增强：每个 Agent 的 system prompt 注入 Blackboard 摘要 | llmGateway.ts |
| 3.3 | Blackboard ↔ IM Chat UI 映射：facts → 事实卡片，concerns → 私聊气泡 | appStore.ts, MessageBubble.tsx |
| 3.4 | Worker 间直接通信：Agent 可在 Blackboard 上对其他 Agent 的产出提修改建议 | blackboard.ts |

### Phase 4: 质量保证（1-2 天）

**目标**：引入 Critic Agent 和评审流程

| 步骤 | 内容 | 改动文件 |
|------|------|---------|
| 4.1 | Critic Agent 定义（角色、System Prompt、工具） | 新建 `criticAgent.ts` |
| 4.2 | 评审工作流：产出 → Critic → accepted/revised/rejected | scheduler.ts |
| 4.3 | 投票/共识选择器：按任务类型自动选择评审策略 | blackboard.ts |
| 4.4 | PMO Synthesizer：升级 aggregator 为智能合成器 | aggregator.ts |

### Phase 5: 可观测性与韧性（1-2 天）

**目标**：可调试、可恢复、可信任

| 步骤 | 内容 | 改动文件 |
|------|------|---------|
| 5.1 | Stall Detection：基于 token 产出速率检测停滞 → 自动 replan | scheduler.ts |
| 5.2 | Checkpoint Recovery：中断恢复（从最后一个持久化状态继续） | plannerService.ts |
| 5.3 | 执行追踪日志：每个步骤的输入/输出/耗时写入结构化日志 | 新建 `trace.ts` |
| 5.4 | Plan 进度可视化：新版 PlanCard 组件（进度条 + 阶段 + Agent 头像） | PlanCard.tsx（新建） |
| 5.5 | Saga 补偿：为关键操作定义 compensate() — Phase 4+ 可选 | scheduler.ts |

---

## 五、关键设计决策

### 5.1 为什么不直接引入 LangGraph / CrewAI？

| 考量 | 结论 |
|------|------|
| 学习成本 | AgentHub 已有 IM 范式 + Agent 注册中心 + DAG 调度器，引入全新框架需重写全部 Agent 接口 |
| 范式冲突 | LangGraph 是 Graph 范式，CrewAI 是 Role 范式，AgentHub 是 IM 范式 — 强绑框架会丢失 IM 的优势 |
| 定制深度 | 自研编排器可深度集成 Blackboard ↔ IM UI 映射，这是任何外部框架做不到的 |
| Token 效率 | Anthropic 明确建议 "start simple" — 直接 API 调用比框架层更可控，token 消耗更低 |

**策略**：汲取所有框架的设计思想，自研实现。保持 AgentHub 的 IM 交互特色。

### 5.2 Blackboard 为什么不直接用 Redis Pub/Sub？

Redis Pub/Sub 是 fire-and-forget 模式 — 消息不持久化，后来者收不到历史消息。
Blackboard 需要**持久化 + 可查询 + 结构化的共享状态**，更适合：
- 短期：内存 Map + JSON 序列化持久化到 PostgreSQL
- 长期：Redis Hash（公共区）+ Redis Streams（事件流）

### 5.3 为什么 Orchestrator 是一个 Agent 而不是 Graph？

在 IM 范式下，Orchestrator 作为一个"Agent"出现在群聊中更自然：
- 用户 @PMO 时，它是一个对话参与者
- 它的"思考过程"可以流式展示在聊天中
- 它的决策记录成为聊天历史的一部分
- 用户可以用自然语言纠正它的判断

这比一个"看不见的图执行引擎"更符合 IM 协作的体验。

### 5.4 复杂度分级不是硬规则

IntentClassifier 的复杂度评估结果不是硬约束 — Supervisor 有权推翻：
- "你评估这是简单任务，但我觉得需要拆成 3 步，因为你遗漏了 XX 约束"
- 用户也可以直接说 "用完整流程做这个"

---

## 六、风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| LLM 计划不可靠（幻觉/格式错误） | 中 | Schema 验证 + 关键词兜底 + 人工确认高风险计划 |
| Blackboard 成为性能瓶颈 | 低 | 初期规模小，内存足够；Phase 3+ 迁移到 Redis |
| Critic 误判导致循环修订 | 中 | 最大 Revision 轮次 = 2，超限则人工介入 |
| 企业级复杂度导致过度工程化 | 高 | 严格按 Phase 顺序交付，每个 Phase 独立可用 |
| LLM 成本显著增加 | 中 | 两层决策（廉价优先）+ 复杂度阈值控制 LLM 调用频率 |

---

## 七、成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 任务分解准确率 | ~60%（关键词误匹配多） | >90%（LLM 语义理解） |
| 首轮计划采纳率 | ~40%（常需手动调整） | >80%（计划质量高） |
| Agent 间协作感知 | 0%（完全隔离） | 100%（Blackboard 可见） |
| 产物第一次通过 Critic | 无此环节 | >70%（降低返工） |
| 计划可恢复性 | 0%（刷新即丢） | 100%（Checkpoint） |
| 编排过程用户理解度 | 低（只有计划卡片） | 高（Blackboard 映射到聊天） |
| 停滞自动恢复率 | 0%（无检测） | >80%（Stall Detection） |

---

## 八、与现有系统的兼容性

所有改动采用 **Strangler Fig 模式**（逐步替换，非大爆炸）：

- Phase 1 完成后，现有功能完全不受影响，但后端成为唯一真相源
- Phase 2 完成后，LLM 路径成为默认，但关键词路径作为 fallback 保留
- Phase 3 完成后，所有 Agent 能感知 Blackboard，但无 Blackboard 时降级为现有行为
- Phase 4 完成后，Critic 默认启用，但可在 Plan 中声明 `skipReview: true` 跳过
- Phase 5 完成后，所有新功能集成完毕，旧 planner.ts 标记为 deprecated 并在下一版本移除

---

## 九、参考资料

1. Anthropic. "Building Effective Agents" (2024-12)
2. Anthropic. "How we built our multi-agent research system" (2025-06)
3. LangGraph Documentation. Stateful Agent Graphs (2026)
4. CrewAI Documentation. Processes & Hierarchical Manager (2025)
5. Microsoft AutoGen. MagenticOne Group Chat & Task Ledger (2025)
6. OpenAI Swarm. Handoff Pattern & Lightweight Orchestration (2025)
7. bMAS. "Blackboard LLM Multi-Agent System" — arXiv 2507.01701 (2025)
8. ACL 2025. "Voting or Consensus? Decision-Making in Multi-Agent Debate" — arXiv 2502.19130
9. MAKER. "Multi-Agent K-consensus Error Correction" — arXiv 2511.09030 (2025)
10. SagaLLM. "Context Management, Validation, and Transaction Guarantees" — VLDB 2025
