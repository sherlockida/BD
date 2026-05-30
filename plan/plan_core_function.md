# AgentHub 核心功能实现计划

> **文档定位**：基于现有 BD/agenthub-mvp 代码库，从 Mock 演示版到商业可落地产品的分阶段实施路线图。
>
> **前置阅读**：[AgentHub 多Agent协作平台设计.md](../AgentHub- 多Agent协作平台设计.md) | [SPEC.md](../agenthub-mvp/SPEC.md) | [RULES.md](../agenthub-mvp/RULES.md)

---

## 目录

- [0. 现状总览](#0-现状总览)
- [1. 目标架构](#1-目标架构)
- [2. Phase 1: 真实 Agent 引擎](#2-phase-1-真实-agent-引擎)
- [3. Phase 2: 智能编排器](#3-phase-2-智能编排器)
- [4. Phase 3: 持久化与多会话](#4-phase-3-持久化与多会话)
- [5. Phase 4: Agent 市场](#5-phase-4-agent-市场)
- [6. Phase 5: Skill 引擎](#6-phase-5-skill-引擎)
- [7. Phase 6: 企业级功能](#7-phase-6-企业级功能)
- [8. 优先级路线图](#8-优先级路线图)
- [9. 商业模型与竞争壁垒](#9-商业模型与竞争壁垒)
- [10. 风险与缓解](#10-风险与缓解)

---

## 0. 现状总览

### 0.1 已构建能力

| 模块 | 完成度 | 说明 |
|------|--------|------|
| IM 聊天 UI | 90% | 飞书风格三栏布局，对话列表/聊天窗口/产物面板，流式打字效果 |
| 消息类型 | 85% | 6 种消息渲染：text、code、plan、artifact、diff、deploy |
| 编排器管线 | 70% | Planner(关键词)→Scheduler(DAG并行)→Aggregator(周报)，含 fallback 机制 |
| Agent 适配器 | 60% | BaseAgent 抽象类 + 4 个 Mock Agent，AgentRegistry 单例，能力匹配 |
| 产物系统 | 75% | 追加式版本管理、自动 Diff 生成、4 选项卡面板(预览/代码/差异/历史) |
| Skill 系统 | 40% | 手动创建 UI 完成，自动沉淀/向量召回/注入 Agent prompt 均未实现 |
| Agent 市场 | 30% | 本地 Agent 列表展示，无发布/发现/订阅/计费 |
| 部署 | 20% | 纯模拟的 sleep() 进度动画，无实际部署能力 |

### 0.2 核心差距

1. **零 LLM 调用**：所有 Agent 的 `generate()` 返回硬编码模板，基于关键词正则匹配
2. **无后端**：纯前端 SPA，状态全在 Zustand 内存中，页面刷新即丢失
3. **无持久化**：对话历史、产物、Skill 全部跟随浏览器会话生命周期
4. **假流式**：BaseAgent.chat() 先拿到所有 chunks，再用 20-45ms sleep 模拟流式
5. **关键词规划**：Planner 只匹配 4 个硬编码场景 + 默认 fallback
6. **无多用户**：单用户本地体验，无认证、无团队、无权限

### 0.3 现有代码资产

```
agenthub-mvp/
├── src/
│   ├── agents/          # 4 个 Mock Agent + BaseAgent + Registry（~500 行）
│   ├── orchestrator/    # Planner + Scheduler + Aggregator（~350 行）
│   ├── store/           # Zustand 全局状态 + 路由分发（~900 行）
│   ├── components/      # 13 个 UI 组件（~1800 行）
│   ├── utils/           # ID 生成 + Diff 算法（~75 行）
│   └── types.ts         # 完整领域类型系统（~184 行）
├── .agenthub/skills/    # 5 份协作 Skill 文档
├── SPEC.md / RULES.md   # 产品/工程规范
└── package.json         # React18 + Zustand5 + Vite5 + Tailwind3
```

---

## 1. 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React SPA + PWA)                │
│  ConversationList  ChatWindow  ArtifactPanel  AgentMarket   │
│  SkillsDrawer  PlanCard  DeployCard  DiffViewer             │
│                   Zustand Store + React Query               │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/SSE/WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                  Node.js Backend (Fastify)                   │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Auth     │ │ Agent     │ │ Skill    │ │ Deploy       │ │
│  │ Service  │ │ Gateway   │ │ Engine   │ │ Service      │ │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌───────────┐ ┌──────────────────────────┐  │
│  │ Conv     │ │ Artifact  │ │ Orchestrator Service     │  │
│  │ Service  │ │ Service   │ │ (Planner/Scheduler)      │  │
│  └──────────┘ └───────────┘ └──────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  LLM Adapter Layer                                    │  │
│  │  AnthropicSDK │ OpenAISDK │ OpenCode │ CustomHTTP     │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────┬──────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│                   Persistence Layer                          │
│  SQLite (dev) / PostgreSQL (prod)  │  Redis (cache/session) │
│  MinIO / S3 (artifact storage)     │  Qdrant (vector)      │
└─────────────────────────────────────────────────────────────┘
```

**关键架构决策**：
- **前后端分离**：前端保持纯 SPA，后端用 Fastify（比 Express 快 2x，原生 TypeScript 支持）
- **Agent 接口不变**：`IAgent.chat(): AsyncIterable<AgentChunk>` 契约保持不变，只是实现从 Mock 变为远程调用
- **Zustand 保留**：前端状态管理不变，增加 React Query 做服务端状态缓存和乐观更新
- **适配器下移**：Agent 适配器从浏览器迁移到后端，API Key 不出浏览器

---

## 2. Phase 1: 真实 Agent 引擎

> **优先级**：🔴 最高 | **工期**：2-3 周 | **依赖**：无 | **评分锚点**：AI 协作能力(30%) + 生成效果质量(20%)

### 2.1 目标

将 4 个 Mock Agent 替换为真实 LLM API 调用，构建后端代理层管理 API Key 和流式传输，让平台从"演示品"升级为"可用工具"。

### 2.2 商业价值

这是产品从 0 到 1 的质变。没有真实 AI 能力的 AgentHub 只是 UI 原型。完成后：
- **可演示**：评委看到真实的 AI 代码生成、文档撰写、样式设计
- **可体验**：用户能感受多 Agent 协作的真实效果差异
- **可验证**：编排器管线的真实效果可以被测量和优化

### 2.3 技术方案

#### 2.3.1 后端项目搭建

```
server/
├── package.json              # fastify, @anthropic-ai/sdk, openai, drizzle-orm
├── tsconfig.json
├── drizzle.config.ts
└── src/
    ├── index.ts              # Fastify 入口，注册路由/中间件
    ├── config.ts             # 环境变量：API Keys, DB URL, CORS
    ├── db/
    │   └── schema.ts         # Drizzle ORM schema（Phase 3 启用）
    ├── middleware/
    │   ├── auth.ts           # API Key 认证中间件
    │   ├── rateLimit.ts      # 速率限制
    │   └── errorHandler.ts   # 统一错误处理
    ├── routes/
    │   ├── agents.ts         # Agent CRUD + 健康检查
    │   └── chat.ts           # 核心聊天端点（SSE 流式）
    ├── services/
    │   └── agentGateway.ts   # Agent 路由器：vendor → adapter → AgentChunk 流
    ├── adapters/
    │   ├── baseAdapter.ts    # 适配器抽象
    │   ├── anthropic.ts      # Claude API → AgentChunk
    │   ├── openai.ts         # GPT API → AgentChunk
    │   └── openCode.ts       # 开源模型 → AgentChunk（Ollama 等）
    └── types.ts              # 与前端共享的类型定义
```

**技术栈选择理由**：

| 选择 | 理由 |
|------|------|
| Fastify (非 Express) | 原生 TypeScript、快 2x、插件生态成熟、原生 SSE 支持 |
| Drizzle ORM | 类型安全、轻量、无代码生成、比 Prisma 冷启动快 |
| pnpm workspace | 前后端共享 types.ts，避免类型重复定义 |

#### 2.3.2 核心：Agent Gateway 与流式 SSE 映射

```typescript
// server/src/services/agentGateway.ts — 概念设计
interface ILLMAdapter {
  readonly vendor: AgentVendor;
  chat(input: AgentInput, signal?: AbortSignal): AsyncIterable<AgentChunk>;
}

class AgentGateway {
  private adapters = new Map<AgentVendor, ILLMAdapter>();

  constructor() {
    this.adapters.set('claude-code', new AnthropicAdapter());
    this.adapters.set('codex', new OpenAIAdapter());
    this.adapters.set('open-code', new OpenCodeAdapter());
  }

  async *chat(
    input: AgentInput,
    vendor: AgentVendor,
    signal?: AbortSignal
  ): AsyncIterable<AgentChunk> {
    const adapter = this.adapters.get(vendor);
    if (!adapter) throw new AgentNotFoundError(vendor);
    yield* adapter.chat(input, signal);
  }
}
```

```typescript
// server/src/adapters/anthropic.ts — Claude 流式 → AgentChunk 映射
import Anthropic from '@anthropic-ai/sdk';

class AnthropicAdapter implements ILLMAdapter {
  readonly vendor: AgentVendor = 'claude-code';
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async *chat(input: AgentInput, signal?: AbortSignal): AsyncIterable<AgentChunk> {
    // 1. 构造系统 Prompt：注入 Skill、Rules、历史上下文
    const systemPrompt = this.buildSystemPrompt(input);

    // 2. 调用 Anthropic Streaming API
    const stream = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.buildMessages(input),
      stream: true,
    }, { signal });

    // 3. SSE event → AgentChunk 映射
    let textBuffer = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        textBuffer += event.delta.text;
        yield { type: 'text', content: event.delta.text };
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        // 检测到代码生成工具调用 → 转换为 code chunk
        yield { type: 'tool-call', tool: event.content_block.name, args: {} };
      }
    }

    // 4. 后处理：从完整响应中提取 artifact-draft
    yield* this.extractArtifacts(textBuffer);
    yield { type: 'done' };
  }
}
```

#### 2.3.3 关键：SSE 端点设计

```typescript
// server/src/routes/chat.ts — 核心 SSE 端点
POST /api/chat/stream
Content-Type: application/json

{
  "agentId": "agent_claude_code",
  "conversationId": "conv_xxx",
  "userPrompt": "用 React 写一个登录表单",
  "task": { "id": "task_1", "description": "...", "capability": "code" },
  "history": [...],  // 最近 N 条消息
  "contextArtifacts": [...]
}

// 响应：SSE 流
// event: chunk
// data: {"type":"text","content":"我来"}

// event: chunk
// data: {"type":"text","content":"写一个"}

// event: chunk
// data: {"type":"code","language":"tsx","filename":"LoginForm.tsx","content":"import React..."}

// event: chunk
// data: {"type":"artifact-draft","artifactId":"art_xxx","version":2,"content":"...","commitMessage":"feat: 完成登录表单"}

// event: chunk
// data: {"type":"done"}
```

#### 2.3.4 前端改造

**`src/agents/base.ts` — 重写 `chat()` 方法**：

```typescript
// 改造前（Mock）：
abstract class BaseAgent implements IAgent {
  abstract generate(input: AgentInput): Promise<AgentChunk[]>;  // 一次性返回全部
  async *chat(input: AgentInput): AsyncIterable<AgentChunk> {
    const chunks = await this.generate(input);  // 先拿全
    for (const chunk of chunks) {
      await sleep(20 + Math.random() * 25);     // 假延迟
      yield chunk;
    }
    yield { type: 'done' };
  }
}

// 改造后（真实流式）：
abstract class BaseAgent implements IAgent {
  async *chat(input: AgentInput): AsyncIterable<AgentChunk> {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: this.meta.id,
        ...input,
      }),
      signal: input.signal,  // 支持取消
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const chunk = JSON.parse(line.slice(6)) as AgentChunk;
          yield chunk;
        }
      }
    }
  }
}
```

#### 2.3.5 降级策略：Mock Fallback

```typescript
// server/src/services/agentGateway.ts
class AgentGateway {
  async *chat(input, vendor, signal): AsyncIterable<AgentChunk> {
    // 如果 API Key 未配置，降级到 Mock 实现
    if (!this.hasApiKey(vendor)) {
      console.warn(`[AgentGateway] No API key for ${vendor}, using mock`);
      yield* this.mockAdapters.get(vendor)!.chat(input, signal);
      return;
    }
    // 否则走真实 LLM
    yield* this.adapters.get(vendor)!.chat(input, signal);
  }
}
```

这样做的好处：评委即使没有 API Key 也能看到完整 Demo，而有 Key 时可以体验真实效果。

#### 2.3.6 Vite 代理配置

```typescript
// vite.config.ts — 开发环境代理到后端
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

### 2.4 涉及的核心文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/` (全部) | 后端项目 |
| 重写 | `src/agents/base.ts` | chat() 改为 fetch SSE |
| 改造 | `src/agents/claudeCode.ts` | generate() → 移除，chat() 继承 base |
| 改造 | `src/agents/codex.ts` | 同上 |
| 改造 | `src/agents/openCode.ts` | 同上 |
| 改造 | `src/agents/custom.ts` | 同上 |
| 修改 | `src/store/appStore.ts` | runSingleAgent 支持 signal 传递 |
| 修改 | `src/types.ts` | 可能增加 tool-result chunk 类型 |
| 修改 | `vite.config.ts` | 添加 API 代理 |

### 2.5 成功指标

- [ ] 4 个 Agent 适配器均可通过真实 API 产生回复
- [ ] SSE 流式渲染延迟 < 500ms（首字出现）
- [ ] /api/agents/:id/health 健康检查全部通过
- [ ] API Key 未配置时自动降级到 Mock（演示安全）
- [ ] 一个完整的端到端流程：用户发消息 → 后端 → LLM → SSE → 前端流式渲染

---

## 3. Phase 2: 智能编排器

> **优先级**：🔴 最高 | **工期**：2-3 周 | **依赖**：Phase 1 | **评分锚点**：AI 协作能力(30%) + 代码理解度(15%)

### 3.1 目标

将 Planner 从关键词正则匹配升级为 LLM 结构化输出，让编排器能理解任意用户意图并自动拆解为带依赖的 DAG 子任务。同时增加超时、取消、计划验证能力。

### 3.2 商业价值

**这是最核心的商业差异化能力**。当前市面上没有任何产品能做到"把一个模糊需求自动拆成多 Agent 并行执行的 DAG 计划"。这是 AgentHub 与 GitHub Copilot、Cursor、Devin 等单 Agent 工具的根本区别。

### 3.3 技术方案

#### 3.3.1 LLM 驱动规划器

将 `src/orchestrator/planner.ts` 从纯前端关键词匹配，改为调用后端 LLM 结构化输出：

```typescript
// server/src/services/plannerService.ts — 概念设计

interface PlanRequest {
  intent: string;
  availableAgents: Array<{
    id: string;
    name: string;
    capabilities: AgentCapability[];
    tagline: string;
  }>;
  history?: string;          // 最近对话的摘要
  constraints?: {
    maxTasks?: number;        // 默认 6
    preferParallel?: boolean; // 默认 true
  };
}

interface PlanResponse {
  intent: string;
  summary: string;             // "拆解为 3 个子任务，其中 t1 和 t2 可并行执行"
  subTasks: Array<{
    id: string;
    title: string;
    description: string;
    assignedAgentId: string;
    capability: AgentCapability;
    dependsOn: string[];
    estimatedDuration: number; // 秒
    fallbackAgentId?: string;
  }>;
  riskNotes?: string;          // "注意：t3 依赖 t1 和 t2 的输出，可能存在冲突"
}

async function plan(request: PlanRequest): Promise<PlanResponse> {
  const llm = getLLMClient(); // 使用成本较低的 Haiku 模型
  const response = await llm.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: `你是一个资深技术 PM。将用户需求拆解为可并行的子任务 DAG。
遵守以下规则：
1. 每个子任务必须指派一个 availableAgents 中存在的 agentId
2. 依赖关系形成 DAG（无循环）
3. 优先并行：无数据依赖的子任务并行执行
4. 每个子任务有单一 capability
5. 为高风险子任务指定 fallbackAgentId
6. 输出严格 JSON，符合指定的 schema`,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        intent: request.intent,
        availableAgents: request.availableAgents.map(a => ({
          id: a.id, name: a.name, capabilities: a.capabilities, tagline: a.tagline
        })),
        constraints: request.constraints,
        history: request.history,
      }),
    }],
  });

  // 解析 + 验证
  const planResult = parseAndValidate(JSON.parse(response.content[0].text), request);
  return planResult;
}
```

#### 3.3.2 计划验证器

```typescript
// server/src/services/planValidator.ts
function validatePlan(plan: PlanResponse, agents: AvailableAgent[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 循环依赖检测（拓扑排序）
  if (hasCycle(plan.subTasks)) {
    errors.push('计划的依赖关系存在循环');
  }

  // 2. 孤岛任务检测
  const connected = reachableFrom(plan.subTasks.filter(t => t.dependsOn.length === 0));
  const orphans = plan.subTasks.filter(t => !connected.includes(t.id));
  if (orphans.length > 0) {
    warnings.push(`子任务 ${orphans.map(t=>t.id).join(', ')} 与主流程无依赖关系`);
  }

  // 3. Agent 存在性检查
  for (const task of plan.subTasks) {
    if (!agents.find(a => a.id === task.assignedAgentId)) {
      errors.push(`子任务 ${task.id} 指派的 Agent ${task.assignedAgentId} 不存在`);
    }
  }

  // 4. 能力匹配检查
  for (const task of plan.subTasks) {
    const agent = agents.find(a => a.id === task.assignedAgentId);
    if (agent && !agent.capabilities.includes(task.capability)) {
      warnings.push(`Agent ${agent.name} 不具备 ${task.capability} 能力，但被指派了此任务`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

#### 3.3.3 智能能力匹配

```typescript
// server/src/services/capabilityMatcher.ts
interface MatchRequest {
  capability: AgentCapability;
  context?: {
    language?: string;
    framework?: string;
    complexity?: 'low' | 'medium' | 'high';
  };
  excludeIds?: string[];
}

class CapabilityMatcher {
  /**
   * 基于多维评分匹配最佳 Agent：
   * - 能力匹配度 (40%)
   * - 历史成功率 (30%)
   * - 响应延迟 (15%)
   * - 负载均衡 (15%)
   */
  async matchBest(req: MatchRequest): Promise<Agent | null> {
    const candidates = agentRegistry
      .all()
      .filter(a => a.meta.capabilities.includes(req.capability))
      .filter(a => !req.excludeIds?.includes(a.meta.id))
      .filter(a => a.meta.online);  // Phase 1 健康检查结果

    if (candidates.length === 0) return null;

    const scored = await Promise.all(
      candidates.map(async (agent) => ({
        agent,
        score: await this.computeScore(agent, req),
      }))
    );

    scored.sort((a, b) => b.score - a.score);
    return scored[0].agent.meta;
  }
}
```

#### 3.3.4 超时与取消

```typescript
// server/src/services/scheduler.ts — 增强设计
async function schedule(
  plan: OrchestratorPlan,
  context: ScheduleContext,
  events: ScheduleEvents,
  options: {
    taskTimeout: number;      // 单任务超时（ms），默认 60s
    planTimeout: number;      // 总计划超时（ms），默认 300s
    signal: AbortSignal;      // 前端取消信号
  }
): Promise<void> {
  const planDeadline = Date.now() + options.planTimeout;

  for (const task of readyTasks) {
    const taskController = new AbortController();
    const taskTimeoutId = setTimeout(() => {
      taskController.abort();
      events.onTaskTimeout(task.id);
    }, options.taskTimeout);

    // 将 AbortSignal 链式连接到 Agent 调用
    const combinedSignal = anySignal(options.signal, taskController.signal);

    try {
      const agent = agentRegistry.get(task.assignedAgentId);
      for await (const chunk of agent.chat(taskInput, combinedSignal)) {
        events.onChunk(task.id, chunk);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // 超时或用户取消 → 触发 fallback
        await runFallback(task, context, events);
      }
    } finally {
      clearTimeout(taskTimeoutId);
    }
  }
}
```

#### 3.3.5 前端取消 UI

在 PlanCard 中添加：

```tsx
// 每个 SubTask 行增加取消按钮（执行中状态时显示）
// 整个 PlanCard 头部增加"取消全部"按钮
// 取消后状态变为 'cancelled'，消息中显示"⏹ 已取消"
```

### 3.4 涉及的核心文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/src/services/plannerService.ts` | LLM 驱动的规划器 |
| 新建 | `server/src/services/planValidator.ts` | 计划验证 |
| 新建 | `server/src/services/capabilityMatcher.ts` | 智能 Agent 匹配 |
| 改造 | `src/orchestrator/planner.ts` | 从前端关键词匹配改为调用后端 API |
| 增强 | `src/orchestrator/scheduler.ts` | 添加 AbortController + 超时 + 总计划超时 |
| 修改 | `src/orchestrator/index.ts` | 添加 validateAndRepair 步骤 |
| 修改 | `src/store/appStore.ts` | 传播 AbortSignal 到 runOrchestrated |
| 修改 | `src/components/PlanCard.tsx` | 添加取消按钮、超时状态、失败重试 |

### 3.5 成功指标

- [ ] 20 种不同意图的计划生成成功率 > 85%（人工评审）
- [ ] LLM 规划器延迟 < 2s（使用 Haiku 模型）
- [ ] 零循环依赖计划产出
- [ ] 单任务超时在 ±2s 精度内触发
- [ ] 用户点击"取消"后 < 1s 内所有 inflight 任务终止

---

## 4. Phase 3: 持久化与多会话

> **优先级**：🟡 高 | **工期**：3-4 周 | **依赖**：Phase 1 | **评分锚点**：功能完整度(25%) + 生成效果质量(20%)

### 4.1 目标

将纯内存状态迁移到数据库持久化，添加用户认证，支持跨设备多会话。页面刷新后对话历史完整恢复。

### 4.2 商业价值

**这是 SaaS 产品的必要基础**。企业客户需要：
- 项目历史可追溯（合规审计）
- 跨设备连续工作（桌面→移动→Web）
- 数据隔离和权限控制

### 4.3 技术方案

#### 4.3.1 数据库设计

```sql
-- Drizzle ORM Schema（server/src/db/schema.ts）

-- 用户表
CREATE TABLE users (
  id          TEXT PRIMARY KEY,        -- uid()
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  avatar_url  TEXT,
  provider    TEXT DEFAULT 'email',    -- email | google | github
  created_at  INTEGER NOT NULL        -- unix ms
);

-- 对话表
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,       -- 'single' | 'group'
  title           TEXT NOT NULL,
  owner_id        TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  last_active_at  INTEGER NOT NULL,
  archived        INTEGER DEFAULT 0
);

-- 对话成员（群聊中有哪些 Agent）
CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  agent_id        TEXT NOT NULL,
  joined_at       INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, agent_id)
);

-- 消息表
CREATE TABLE messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id),
  sender_type       TEXT NOT NULL,     -- 'user' | 'agent' | 'system'
  sender_id         TEXT NOT NULL,
  content           TEXT NOT NULL,     -- JSON: MessageContent 联合类型
  reply_to_msg_id   TEXT,
  pinned            INTEGER DEFAULT 0,
  streaming         INTEGER DEFAULT 0, -- 流式传输中标记
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (reply_to_msg_id) REFERENCES messages(id)
);

-- 产物表
CREATE TABLE artifacts (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  type            TEXT NOT NULL,       -- 'code' | 'webpage' | 'document' | 'ppt'
  name            TEXT NOT NULL,
  language        TEXT,
  created_by      TEXT NOT NULL,       -- agent_id
  created_at      INTEGER NOT NULL
);

-- 产物版本表（追加式，不删除）
CREATE TABLE artifact_versions (
  id            TEXT PRIMARY KEY,
  artifact_id   TEXT NOT NULL REFERENCES artifacts(id),
  version       INTEGER NOT NULL,
  content       TEXT NOT NULL,
  author_agent  TEXT NOT NULL,
  commit_msg    TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

-- Skill 表
CREATE TABLE skills (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  trigger         TEXT NOT NULL,        -- 触发条件描述
  description     TEXT NOT NULL,
  steps           TEXT NOT NULL,        -- JSON: string[]
  source          TEXT NOT NULL,        -- 'manual' | 'auto-distilled' | 'marketplace'
  conversation_id TEXT,
  owner_id        TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL
);

-- 部署记录表
CREATE TABLE deploy_records (
  id          TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  status      TEXT NOT NULL,           -- 'building' | 'deploying' | 'success' | 'failed'
  url         TEXT,
  provider    TEXT DEFAULT 'vercel',
  created_at  INTEGER NOT NULL,
  finished_at INTEGER
);
```

#### 4.3.2 前端状态层改造

当前 `appStore.ts`（899 行）直接修改 Zustand 状态。需要引入三层架构：

```
┌── UI Components ──┐
│  直接读取 Zustand   │  ← 不变，保持响应式
└────────────────────┘
         │
┌── Zustand Store ───┐
│  UI 状态（本地）     │  ← activeId, *Open flags 保留在 Zustand
│  缓存状态（远程）     │  ← 使用 React Query 管理
└────────────────────┘
         │
┌── React Query ─────┐
│  useConversations() │  ← SWR 风格：stale-while-revalidate
│  useMessages()      │  ← 分页 + 光标
│  useArtifacts()     │  ← 乐观更新
│  useSkills()        │
└────────────────────┘
         │
┌── API Client ──────┐
│  src/services/api.ts│  ← 统一 HTTP 客户端
└────────────────────┘
```

```typescript
// 示例：useConversations hook
function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations(),
    staleTime: 30_000,  // 30s 内不重新获取
  });
}

// 发送消息 — 乐观更新
function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: MessageContent) =>
      api.sendMessage(conversationId, content),

    // 乐观更新：消息立即显示在 UI 中
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
      const previous = queryClient.getQueryData(['messages', conversationId]);
      queryClient.setQueryData(['messages', conversationId], old =>
        [...old, { id: 'optimistic_' + Date.now(), content, streaming: true }]
      );
      return { previous };
    },

    // 失败时回滚
    onError: (err, content, context) => {
      queryClient.setQueryData(['messages', conversationId], context.previous);
    },
  });
}
```

#### 4.3.3 API 路由设计

```
# 对话
GET    /api/conversations                    # 列表（分页、搜索、排序）
POST   /api/conversations                    # 创建
GET    /api/conversations/:id                # 详情
DELETE /api/conversations/:id                # 软删除
PATCH  /api/conversations/:id                # 更新（标题、归档）

# 消息
GET    /api/conversations/:id/messages       # 消息列表（游标分页）
POST   /api/conversations/:id/messages       # 发送消息（触发 Agent 调用）

# 产物
GET    /api/artifacts?conversationId=        # 列表
POST   /api/artifacts/:id/versions           # 追加版本
POST   /api/artifacts/:id/rollback           # 回滚（创建新版本）
GET    /api/artifacts/:id/export?format=zip  # 下载

# Skill
GET    /api/skills                           # 列表
POST   /api/skills                           # 创建
DELETE /api/skills/:id                       # 删除
GET    /api/skills/search?q=                 # 搜索

# 导出
GET    /api/conversations/:id/export?format=json|md  # 对话导出
```

#### 4.3.4 认证系统

```typescript
// server/src/middleware/auth.ts
// 使用 better-auth 或纯 JWT

// 方案 1：匿名模式（演示/开发）
// - 前端 localStorage 存储本地 userId
// - 后端不做强制认证，以 userId header 识别用户

// 方案 2：正式认证（生产）
// - Email + 密码注册
// - OAuth：Google, GitHub
// - JWT access token (15min) + refresh token (7d)
```

### 4.4 涉及的核心文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/src/db/schema.ts` | Drizzle ORM 表定义 |
| 新建 | `server/src/db/migrate.ts` | 数据库迁移 |
| 新建 | `server/src/routes/conversations.ts` | 对话 CRUD |
| 新建 | `server/src/routes/artifacts.ts` | 产物 CRUD |
| 新建 | `server/src/routes/skills.ts` | Skill CRUD |
| 新建 | `server/src/middleware/auth.ts` | 认证中间件 |
| 新建 | `src/services/api.ts` | 前端 API 客户端 |
| 新建 | `src/hooks/useConversations.ts` | React Query hooks |
| 新建 | `src/hooks/useMessages.ts` | 同上 |
| 重构 | `src/store/appStore.ts` | 拆分：UI 状态留在 store，数据状态走 React Query |
| 修改 | `src/App.tsx` | 添加 AuthProvider |
| 修改 | `src/types.ts` | 添加 User 类型 |

### 4.5 成功指标

- [ ] 页面刷新后对话历史 100% 恢复
- [ ] 1000 条消息的对话加载时间 < 1s（游标分页）
- [ ] 对话导出为可读 Markdown（含产物链接）
- [ ] 用户 A 看不到用户 B 的对话

---

## 5. Phase 4: Agent 市场

> **优先级**：🟢 中 | **工期**：3-4 周 | **依赖**：Phase 1 | **评分锚点**：创新与产品感(10%)

### 5.1 目标

构建 Agent 市场生态：第三方开发者可以发布 Agent，用户可以浏览/订阅/评价，平台通过使用量计费。

### 5.2 商业价值

**这是货币化引擎**。类似于 Apple App Store / Shopify App Store：
- **平台佣金**：Agent 订阅收入的 30%
- **用量计费**：按 API 调用次数收费（对免费 Agent 也抽 5% 基础设施费）
- **企业定制**：企业私有 Agent 市场 + 专属 SLA

### 5.3 技术方案

#### 5.3.1 Agent 发布清单格式

```typescript
// Agent 市场发布清单（AgentManifest）
interface AgentManifest {
  // 基本信息
  name: string;                    // "电商文案专家"
  vendor: 'claude-code' | 'codex' | 'open-code' | 'custom';
  version: string;                 // semver: "1.2.0"
  tagline: string;                 // 一句话简介
  description: string;             // 详细描述（Markdown）

  // 能力
  capabilities: AgentCapability[]; // ['doc', 'code']
  specialties: string[];           // "电商详情页文案", "Google Ads 文案"

  // 技术配置
  model?: string;                  // 覆盖默认模型
  systemPrompt: string;            // 系统提示
  tools?: string[];                // 工具清单

  // 定价
  pricing: {
    type: 'free' | 'subscription' | 'usage';
    freeQuota?: number;            // 月免费调用次数
    subscriptionPrice?: number;    // 月费（USD）
    usagePrice?: number;            // 每千次调用价格
  };

  // 元数据
  avatarEmoji: string;
  category: 'engineering' | 'design' | 'marketing' | 'data' | 'general';
  tags: string[];
}
```

#### 5.3.2 市场 API

```
# 发布
POST   /api/marketplace/publish           # 发布新 Agent（需审核）
GET    /api/marketplace/my-agents         # 我发布的 Agent

# 发现
GET    /api/marketplace/agents            # 浏览（分类、搜索、排序）
GET    /api/marketplace/agents/:id        # 详情
GET    /api/marketplace/featured          # 精选推荐

# 订阅
POST   /api/marketplace/subscribe/:id     # 添加到我的 Agent 列表
DELETE /api/marketplace/subscribe/:id     # 取消订阅

# 评价
GET    /api/marketplace/agents/:id/reviews
POST   /api/marketplace/agents/:id/reviews

# 使用统计（发布者视角）
GET    /api/marketplace/agents/:id/stats  # 订阅数、调用量、收入
```

#### 5.3.3 第三方 Agent SDK

```
agent-sdk/
├── package.json              # npm: @agenthub/sdk
├── README.md
├── src/
│   ├── index.ts             # 导出 defineAgent()
│   ├── types.ts             # AgentManifest 类型
│   └── test-harness.ts      # 本地测试工具
└── templates/
    └── starter/              # Agent 模板项目
```

```typescript
// SDK 使用示例
import { defineAgent } from '@agenthub/sdk';

export default defineAgent({
  name: '电商文案专家',
  vendor: 'claude-code',
  capabilities: ['doc'],
  systemPrompt: `你是一个专业的电商文案撰写专家...`,
  pricing: {
    type: 'subscription',
    subscriptionPrice: 9.9,
  },
});
```

### 5.4 涉及的核心文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/src/routes/marketplace.ts` | 市场 API |
| 新建 | `server/src/services/billingService.ts` | 用量计费 |
| 新建 | `agent-sdk/` | 第三方开发 SDK |
| 扩展 | `src/components/AgentMarket.tsx` | 从本地列表扩展为动态市场 |
| 扩展 | `src/components/AgentPicker.tsx` | 支持从市场添加 |
| 修改 | `src/agents/registry.ts` | 支持远程注册 |
| 修改 | `src/types.ts` | 添加 AgentManifest、AgentReview 类型 |

---

## 6. Phase 5: Skill 引擎

> **优先级**：🟢 中 | **工期**：3-4 周 | **依赖**：Phase 1, Phase 3 | **评分锚点**：AI 协作能力(30%) + 创新与产品感(10%)

### 6.1 目标

构建 Skill 知识引擎：从协作模式中自动沉淀 Skill，通过向量搜索注入 Agent 上下文，使平台越用越聪明。这是 AgentHub 最深层的护城河。

### 6.2 商业价值

**这是竞争对手无法复制的壁垒**。随着使用量增长：
1. Skill 库积累 → Agent 产出质量提高 → 用户粘性增强 → 更多 Skill 沉淀（飞轮效应）
2. 行业 Skill 包可以溢价销售（如"电商 S 级大促作战包 $99/月"）
3. 企业私有 Skill 库成为核心资产，迁移成本极高

### 6.3 技术方案

#### 6.3.1 Skill 三种来源

```
┌─────────────────────────────────────────────────┐
│                  Skill 来源                      │
├─────────────────┬───────────────┬───────────────┤
│ 1. 自动沉淀     │ 2. 手动创建   │ 3. 市场安装   │
│ (PMO 分析协作   │ (用户在任意    │ (从 Skill      │
│  结束后自动      │  Agent 消息上  │  Marketplace   │
│  提取有效模式)   │  点 ✨ 蒸馏)   │  一键安装)     │
└─────────────────┴───────────────┴───────────────┘
```

#### 6.3.2 自动沉淀引擎

```typescript
// server/src/services/skillDistiller.ts
async function distillSkills(
  conversation: Conversation,
  messages: Message[],
  plan: OrchestratorPlan
): Promise<SkillDraft[]> {
  // 1. 从 Orchestrator 周报中提取协作模式
  const orchestratorInput = {
    planSummary: summarizePlan(plan),
    agentMessages: messages.filter(m => m.senderType === 'agent'),
    artifacts: getAllArtifacts(conversation.id),
  };

  // 2. 使用 LLM 分析模式（使用低成本模型）
  const llm = getLLMClient();
  const response = await llm.messages.create({
    model: 'claude-haiku-4-5',
    system: `分析以下多 Agent 协作记录，提取可复用的协作模式。
每个模式必须有：
- name: 简洁的名称
- trigger: 什么场景触发此模式（用户需求特征 + 上下文信号）
- why: 为什么这个模式有效
- steps: 具体执行步骤`,
    messages: [{ role: 'user', content: JSON.stringify(orchestratorInput) }],
  });

  // 3. 解析 → 创建草稿 Skill
  const patterns = parsePatterns(response.content[0].text);
  return patterns.map(p => ({
    ...p,
    status: 'draft',
    source: 'auto-distilled',
    conversationId: conversation.id,
  }));
}

// 触发时机：runOrchestrated() 完成后
// 频率控制：同一模式出现 3 次以上才自动发布
```

#### 6.3.3 向量化与召回

```typescript
// server/src/services/skillEmbedder.ts
import { QdrantClient } from '@qdrant/js-client-rest';

class SkillEmbedder {
  private qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
  private embedModel = 'text-embedding-3-small';  // 1536 dims

  // 创建 Skill 时生成嵌入
  async embed(skill: Skill): Promise<void> {
    const text = `${skill.name}\n${skill.trigger}\n${skill.description}\n${skill.steps.join('\n')}`;
    const embedding = await this.getEmbedding(text);

    await this.qdrant.upsert('skills', {
      points: [{
        id: skill.id,
        vector: embedding,
        payload: {
          name: skill.name,
          trigger: skill.trigger,
          capabilities: skill.capabilities,
        },
      }],
    });
  }

  // 上下文召回：在 Agent 调用前注入最相关的 Top-K Skill
  async recall(context: string, topK: number = 5): Promise<Skill[]> {
    const queryEmbedding = await this.getEmbedding(context);

    const results = await this.qdrant.search('skills', {
      vector: queryEmbedding,
      limit: topK,
      score_threshold: 0.65,  // 相似度阈值
    });

    return results
      .filter(r => r.score >= 0.65)
      .map(r => skillRegistry.get(r.id as string));
  }
}
```

#### 6.3.4 Skill 注入中间件

```typescript
// server/src/services/agentGateway.ts — 在 chat() 中注入 Skill
async *chat(input: AgentInput, vendor: AgentVendor): AsyncIterable<AgentChunk> {
  // 1. 从上下文召回相关 Skill
  const context = `${input.userPrompt ?? ''} ${input.task?.description ?? ''}`;
  const relevantSkills = await this.skillEmbedder.recall(context, 3);

  // 2. 注入到系统 Prompt
  const skillPrompt = relevantSkills.length > 0
    ? `\n\n## 相关协作经验 (Skills)\n${relevantSkills.map(s =>
        `### ${s.name}\n触发条件：${s.trigger}\n执行步骤：\n${s.steps.map((st,i) => `${i+1}. ${st}`).join('\n')}`
      ).join('\n\n')}\n`
    : '';

  // 3. 发送给 LLM
  const adapter = this.getAdapter(vendor);
  yield* adapter.chat({
    ...input,
    systemPrompt: (input.systemPrompt ?? '') + skillPrompt,
  });
}
```

### 6.4 涉及的核心文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `server/src/services/skillDistiller.ts` | 自动沉淀 |
| 新建 | `server/src/services/skillEmbedder.ts` | 向量嵌入 + 召回 |
| 新建 | `server/src/routes/skillMarketplace.ts` | Skill 市场 |
| 修改 | `server/src/services/agentGateway.ts` | 注入 Skill |
| 修改 | `src/components/SkillsDrawer.tsx` | 显示自动沉淀的草稿 Skill |
| 修改 | `src/types.ts` | 扩展 Skill 类型（向量、状态、评分） |

---

## 7. Phase 6: 企业级功能

> **优先级**：🔵 低 | **工期**：4-5 周 | **依赖**：Phase 3 | **评分锚点**：功能完整度(25%) + 创新与产品感(10%)

### 7.1 目标

添加企业级特性：团队工作空间、RBAC 权限控制、审计日志、SSO 单点登录、私有化部署能力。

### 7.2 商业价值

**这是企业销售的门票**。从免费/个人版 → 团队版（$29/seat/月）→ 企业版（$99/seat/月 + 私有部署）。

### 7.3 核心子功能

| 功能 | 说明 | 商业价值 |
|------|------|----------|
| 团队工作空间 | Workspace 隔离，成员邀请，角色管理 | 团队协作的基础设施 |
| RBAC | Admin / Member / Viewer 三级权限 | 合规要求，企业必问 |
| 审计日志 | 所有对话/产物/Skill 的操作记录 | 金融、医疗等强监管行业必备 |
| SSO | OIDC/OAuth：Okta, Azure AD, Google Workspace | 企业 IT 部门的硬要求 |
| 私有部署 | Docker Compose 一键部署，数据不出 VPC | 政企客户的核心诉求 |
| 用量仪表板 | 每团队/每 Agent 的调用统计和费用 | 成本透明，续费驱动 |

### 7.4 私有部署架构

```yaml
# docker-compose.prod.yml
services:
  agenthub-frontend:
    build: ./agenthub-mvp
    ports: ["80:80"]

  agenthub-backend:
    build: ./server
    ports: ["3001:3001"]
    environment:
      - DATABASE_URL=postgres://...
      - REDIS_URL=redis://...
    depends_on: [postgres, redis, qdrant]

  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

  qdrant:
    image: qdrant/qdrant:latest
    volumes: [qdrant_data:/qdrant/storage]
```

---

## 8. 优先级路线图

### 8.1 黑客松迭代（4 周冲刺）

```
Week 1-2:  Phase 1（真实 Agent 引擎）
           ├── Day 1-3:  搭建 server/ 项目 + Fastify 骨架
           ├── Day 4-6:  Anthropic + OpenAI 适配器实现
           ├── Day 7-8:  SSE 端点 + 前端 BaseAgent 重写
           ├── Day 9-10: Mock Fallback + 端到端联调
           └── Day 11-14: 测试 + 优化 + 文档

Week 2-3:  Phase 2（智能编排器）— 与 Phase 1 尾部重叠
           ├── Day 1-3:  LLM Planner + 结构化输出
           ├── Day 4-5:  PlanValidator + CapabilityMatcher
           ├── Day 6-7:  超时/取消机制
           └── Day 8-10: 前端 PlanCard 增强

Week 3-4:  Phase 3 核心（持久化）+ Phase 5 核心（Skill 引擎）
           ├── Day 1-3:  SQLite + Drizzle Schema + 对话/消息 API
           ├── Day 4-5:  React Query 集成 + 乐观更新
           ├── Day 6-7:  SkillDistiller 自动沉淀（最小可行版）
           └── Day 8-10: 整体联调 + Demo 录制准备
```

### 8.2 长期路线图（6 个月）

```
Month 1:  Phase 1 完成        → 平台可用（真实 AI）
Month 2:  Phase 2 完成        → 编排器智能
Month 3:  Phase 3 完成        → 持久化 + 多用户
Month 4:  Phase 5 核心完成    → Skill 引擎 MVP
Month 5:  Phase 4 核心完成    → Agent 市场 MVP
Month 6:  Phase 6 试点客户    → 企业功能 + 私有部署
```

### 8.3 评分锚点对照

| 维度 | 权重 | 贡献阶段 | 核心交付 |
|------|------|----------|----------|
| AI 协作能力 | 30% | P1, P2, P5 | 真实 LLM 流式 + 智能编排 + Skill 沉淀 |
| 功能完整度 | 25% | P1, P3, P4 | 多 Agent 协同 + 持久化 + 市场 |
| 生成效果质量 | 20% | P1, P2 | 真实流式渲染 + 计划可视化 |
| 代码理解度 | 15% | P1, P2 | 适配器模式 + DAG 调度 + 类型安全 |
| 创新与产品感 | 10% | P4, P5, P6 | Skill 引擎 + Agent 市场 + IM 范式 |

---

## 9. 商业模型与竞争壁垒

### 9.1 三层收入模型

```
┌─────────────────────────────────────────┐
│ L1: SaaS 订阅（基础收入）                │
│ - 免费版：单用户，5 个对话，2 个 Agent   │
│ - Pro：$19/月，无限对话，全部 Agent      │
│ - Team：$29/seat/月，工作空间 + 审计     │
│ - Enterprise：$99/seat/月，私有部署      │
├─────────────────────────────────────────┤
│ L2: Agent 市场佣金（增长引擎）            │
│ - 平台抽成 30% Agent 订阅收入            │
│ - 免费 Agent 收 5% 基础设施费            │
│ - 企业私有市场：年费 $50K+               │
├─────────────────────────────────────────┤
│ L3: Skill 包市场（高利润）               │
│ - 行业 Skill 包：$49-199/月              │
│ - 平台抽成 25%                           │
│ - 企业定制 Skill 库：一次性 $10K+        │
└─────────────────────────────────────────┘
```

### 9.2 竞争壁垒

| 壁垒 | 类型 | 说明 |
|------|------|------|
| 数据网络效应 | 🟢 强 | Skill 库随使用量自动增长，先发优势明显 |
| 平台双边网络效应 | 🟢 强 | Agent 越多 → 用户越多 → Agent 开发者越多 |
| 切换成本 | 🟡 中 | 企业 Skill 库/历史对话是核心资产，迁移困难 |
| 技术护城河 | 🟡 中 | 编排器 DAG 调度 + 多 Agent 冲突处理有技术深度 |
| 品牌与生态 | 🔴 弱 | 初期无品牌，需要快速建立开发者社区 |

### 9.3 目标市场切入

```
Phase 1-3 → 独立开发者 + 小团队
Phase 4-5 → 创业公司 + 中型技术团队
Phase 6   → 政企客户 + 金融/医疗合规市场
```

---

## 10. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| LLM API 成本失控 | 高 | 中 | 规划器使用 Haiku；实现 prompt caching；设置硬性用量上限 |
| SSE 流在大负载下断开 | 中 | 中 | 自动重连(最多 3 次)；降级为非流式响应 |
| LLM 规划器产生无效 DAG | 高 | 中 | JSON Schema 验证 + 回退到启发式方法 + 自动修复 |
| 嵌入向量质量差导致 Skill 召回不准 | 中 | 高 | 相似度阈值 ≥0.65；人工确认机制；A/B 测试 |
| 竞品快速跟进 | 中 | 中 | 聚焦 Skill 飞轮，加速数据积累；开源核心框架建立生态 |
| 黑客松评委不理解 Mock → 生产迁移 | 低 | 高 | 保留 Mock 降级模式用于演示；README 明确标注迁移路径 |

---

## 附录 A: 关键技术决策记录

| 决策 | 选择 | 替代方案 | 理由 |
|------|------|----------|------|
| 后端框架 | Fastify | Express, Hono | 原生 TS、性能、SSE 支持、插件生态 |
| ORM | Drizzle | Prisma, Knex | 类型安全、轻量、冷启动快 |
| 向量数据库 | Qdrant | pgvector, Pinecone | 自托管、高性能、过滤能力强 |
| 状态管理 | Zustand + React Query | Redux Toolkit | 简洁、现有代码兼容 |
| Agent 接口 | `AsyncIterable<AgentChunk>` (不变) | RxJS, EventEmitter | 保持现有契约，减少改动范围 |
| LLM 规划模型 | Haiku | Sonnet, GPT-4o-mini | 成本/速度优先，规划不需要强推理 |
| Agent 执行模型 | Sonnet/Opus | Haiku | 代码生成需要质量，不能用弱模型 |

## 附录 B: 现有代码复用清单

以下现有模块可以直接复用或仅需小改：

| 模块 | 复用方式 |
|------|----------|
| `src/types.ts` | 完整保留，仅追加 User/Workspace 等类型 |
| `src/utils/id.ts` | 保留，后端也使用相同 ID 方案 |
| `src/utils/diff.ts` | 保留，后续升级为 jsdiff 库 |
| `src/components/*` (13 个) | 全部保留，仅改数据源从 store 到 React Query |
| `src/agents/registry.ts` | 核心逻辑保留，增加远程 Agent 注册 |
| `src/orchestrator/scheduler.ts` | DAG 调度逻辑保留，增加超时/取消 |
| `src/orchestrator/aggregator.ts` | 保留，后续增加 LLM 聚合 |
| `.agenthub/skills/` (5 份) | 作为种子 Skill 导入数据库 |
| `SPEC.md` / `RULES.md` | 作为项目规范继续使用 |

---

> 📅 最后更新：2026-05-31
>
> 👤 维护者：AgentHub 开发团队
>
> 📄 许可：内部文档，随代码库一起维护
