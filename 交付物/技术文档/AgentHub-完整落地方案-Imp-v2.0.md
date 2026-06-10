# AgentHub — 多 Agent 协作平台 · 完整落地方案

> **状态**: v2.0 实施方案  
> **基于**: [AgentHub 设计要求](../AgentHub-%20多Agent协作平台设计要求.md) + [agenthub-mvp](../agenthub-mvp/) v1.0 现状  
> **日期**: 2026-06-03  
> **作者**: AgentHub 架构组

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [MVP 现状审计](#2-mvp-现状审计)
3. [行业调研与对标](#3-行业调研与对标)
4. [总体架构设计](#4-总体架构设计)
5. [核心模块深化设计](#5-核心模块深化设计)
6. [创新亮点](#6-创新亮点)
7. [分阶段实施路线图](#7-分阶段实施路线图)
8. [技术选型与决策记录](#8-技术选型与决策记录)
9. [AI 协作开发规范](#9-ai-协作开发规范)
10. [风险与对策](#10-风险与对策)
11. [附录](#11-附录)

---

## 1. 背景与目标

### 1.1 课题背景

当前 AI Agent 生态存在三大痛点：

1. **单 Agent 能力边界有限**：单个 LLM 无法独立完成"设计→编码→部署"全链路交付
2. **工具碎片化**：开发者需在 Claude Code / Codex / Cursor / IDE 之间频繁切换
3. **协作范式缺失**：缺少"人 + 多 Agent 团队"的工程化协作模型

AgentHub 的命题是：**把 IM 聊天范式（飞书/微信）复用到"人与 Agent 团队"的协作中**，让每个 Agent 就是一个"聊天对象"，用户在群聊中一句话驱动多 Agent 协作完成项目交付。

### 1.2 v2.0 目标

| 层级 | 目标 | 衡量标准 |
|------|------|----------|
| **P0 (必须)** | IM 核心体验流畅、多 Agent 调度跑通 | 单聊/群聊/PMO 编排/DAG 可视化/流式消息 |
| **P0 (必须)** | 至少接入 2+ 真实 Agent API | Claude API + OpenAI/Codex API 真实调用 |
| **P0 (必须)** | 产物内联预览与迭代 | iframe 沙箱预览/代码编辑器/版本历史/一键回滚 |
| **P1 (重点)** | 部署发布链路 | 一键部署 → 预览 URL → 部署状态卡片 |
| **P1 (重点)** | 后端服务化 | Node.js + Express + WebSocket + PostgreSQL |
| **P2 (增强)** | 多端支持 | Web 全功能 / 桌面端本地文件 / 移动端轻量 IM |
| **P2 (增强)** | Agent 市场 + 技能生态 | 模板化 Agent、Skills 市场、社区沉淀 |

---

## 2. MVP 现状审计

### 2.1 已有资产

| 模块 | 文件 | 完成度 | 说明 |
|------|------|--------|------|
| 类型系统 | `src/types.ts` | 100% | `IAgent`/`AgentChunk`/`OrchestratorPlan`/`Artifact` 等核心类型完备 |
| Agent 适配器 | `src/agents/` | 100% (Mock) | BaseAgent + 4 个 Adapter（Claude Code/Codex/OpenCode/自建），接口真实 |
| 注册中心 | `src/agents/registry.ts` | 100% | 实例注册/能力匹配/降级路由/自建 Agent |
| Orchestrator | `src/orchestrator/` | 100% (启发式) | Planner（关键词 DAG）+ Scheduler（拓扑+Promise.race）+ Aggregator |
| 全局状态 | `src/store/appStore.ts` | 100% | Zustand 单 store：会话/消息/产物/Skills/UI |
| UI 组件 | `src/components/` | 100% | 飞书风格三栏布局，含 12 个组件 |
| 规范文档 | SPEC/RULES/Skills | 100% | 5 条 Skill + 完整 SPEC + RULES |
| 产物管理 | `handleChunkInto()` | 100% | artifact-draft → upsert → diff card → 回滚 |

### 2.2 MVP 技术债务

| 问题 | 严重程度 | 影响 |
|------|----------|------|
| **全部 Mock 无真实 API 调用** | 高 | 无法展示真实 AI 能力 |
| **Planner 基于关键词匹配**（非 LLM） | 高 | 任务拆解僵化，无法处理复杂意图 |
| **纯前端无后端** | 高 | 无持久化、无多端同步、无安全隔离 |
| **appStore 单一巨型 store**（~900 行） | 中 | 维护困难，流式高频更新性能瓶颈 |
| **无虚拟列表** | 中 | 长对话（>500 条消息）滚动卡顿 |
| **iframe 沙箱无 CSP 防护** | 中 | 产物预览存在 XSS 风险 |
| **无 WebSocket 实时通信** | 中 | 多端/多人无法实时同步 |
| **Agent 配置硬编码** | 低 | 无动态注册/发现机制 |

### 2.3 MVP 架构评价

**优点**：
- 接口契约设计优秀（`IAgent` + discriminated `AgentChunk`），真实接入替换成本极低
- PMO 编排模型（Plan → Schedule → Aggregate）结构清晰，可平滑从关键词升级为 LLM 驱动
- 产物 append-only 版本模型天然支持审计、回滚、Diff
- 三件套 SPEC/RULES/Skills 体现了工程化思维

**待改进**：
- Planner 需从关键词启发式升级为 LLM 驱动（JSON Schema 约束输出）
- 需引入后端服务层分离关注点
- 状态管理需分层（Zustand UI 态 + TanStack Query 服务态）
- 需引入真实 Agent API 调用（Anthropic / OpenAI）

---

## 3. 行业调研与对标

### 3.1 多 Agent 框架对比

| 框架 | GitHub Stars | 核心模式 | 优势 | 劣势 |
|------|-------------|----------|------|------|
| **CrewAI** | ~51k | Role-based Crew + Task + Process | 角色化设计直观，快速搭建 | 复杂分支流程支持弱 |
| **LangGraph** | ~32k | StateGraph + Checkpoint | 显式状态机，时间旅行调试 | 学习曲线陡，模板代码多 |
| **AutoGen (Legacy)** | ~58k | GroupChat + Event-driven | 群聊范式成熟 | 2025 年底进入维护模式 |
| **Microsoft Agent Framework** | ~10.2k | AutoGen 继任者 | 企业级，Azure 原生 | 生态较新 |
| **OpenAI Agents SDK** | 增长中 | Agent Handoff + Guardrails | OpenAI 原生，轻量 | 厂商锁定 |

**AgentHub 的定位**：不绑定单一框架，而是构建**平台层**，IM 范式 + 统一适配器 + PMO 编排 = 差异化竞争力。

### 3.2 对标产品分析

| 产品 | 交互范式 | 多 Agent | 产物预览 | AgentHub 差异化 |
|------|----------|----------|----------|----------------|
| ChatGPT | 1v1 对话 | ❌ 无 | ❌ 无 | IM 群聊 + 多 Agent 协作 |
| Claude Code | 终端/IDE | ❌ 无 | ❌ 无 | 可视化 UI + 群聊 |
| Cursor | IDE 内联 | ❌ 无 | ✅ 代码 Diff | IM 范式降低使用门槛 |
| Copilot | IDE 补全 | ❌ 无 | ❌ 无 | 项目级多 Agent 调度 |
| Devin | Web IDE | ✅ 单 Agent 多步 | ✅ Web 预览 | 多 Agent 群聊 + 人机协作 |

**核心差异化**：AgentHub 是唯一采用 **IM 群聊作为多 Agent 协作交互范式** 的平台。

### 3.3 关键技术引用

| 技术点 | 参考来源 | 落地方式 |
|--------|----------|----------|
| DAG 任务调度 | LLMCompiler (arXiv 2312.04511)、Gradientsys | Planner 输出 JSON Schema 约束的 DAG |
| 流式消息渲染 | AWS GenAI Chat、Vercel AI SDK | 分片 store patch + useDeferredValue |
| iframe 沙箱隔离 | CodePen/JSFiddle 架构 | sandbox + CSP + postMessage 协议 |
| MCP 工具集成 | Anthropic MCP Spec (Linux Foundation) | v1.2 引入 MCP Server 作为 Agent 工具层 |
| Agent 适配器 | Adapter Pattern (GoF) | IAgent 统一接口 + 厂商实现 |
| 状态分层 | Zustand + TanStack Query | UI 态 / 服务态 / 持久态 三层分离 |

---

## 4. 总体架构设计

### 4.1 系统分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer (UI)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 对话列表  │  │ 聊天窗口  │  │ 产物面板  │  │ Agent市场 │   │
│  │(虚拟列表) │  │(流式渲染) │  │(沙箱预览) │  │(模板商店) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Application Layer (状态 + 编排)           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Zustand  │  │ TanStack  │  │Orchestr- │  │ WebSocket│   │
│  │ UI State │  │  Query    │  │  ator    │  │  Client  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer (后端)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Express  │  │ WebSocket│  │  LLM     │  │  Sandbox │   │
│  │ REST API │  │  Server  │  │  Gateway │  │  Service │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Agent Adapter Layer                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Claude   │  │ OpenAI   │  │ OpenCode │  │ Custom   │   │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Infrastructure Layer                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │PostgreSQL│  │  Redis   │  │  MinIO   │  │  Docker  │   │
│  │(持久化)  │  │(缓存/队列)│  │(产物存储)│  │(编排部署)│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 核心数据流

```
用户输入 → Router(快/慢分类)
              │
    ┌─────────┴──────────┐
    ▼                    ▼
 单 Agent 直答        PMO 编排
    │                    │
    │              ┌─────┴─────┐
    │              ▼           ▼
    │          Planner     Scheduler
    │         (LLM DAG)   (拓扑+并行)
    │              │           │
    │              └─────┬─────┘
    │                    ▼
    └───────────→ Agent Adapter(s)
                      │
              ┌───────┴───────┐
              ▼               ▼
         文本/代码流      产物卡片流
              │               │
              └───────┬───────┘
                      ▼
              消息总线 → UI
                      │
              ┌───────┴───────┐
              ▼               ▼
         Zustand Store   持久化 (DB)
```

### 4.3 数据模型扩展（v1.1）

在 MVP 已有类型基础上新增：

```typescript
// ── 用户与权限 ──
interface User {
  id: ID;
  name: string;
  avatar: string;
  apiKeys: Record<string, string>;  // 加密存储
  preferences: UserPreferences;
}

// ── Agent 模板（Agent 市场） ──
interface AgentTemplate {
  id: ID;
  name: string;
  vendor: AgentVendor;
  systemPrompt: string;
  capabilities: AgentCapability[];
  tools: MCPToolRef[];              // v1.2 MCP 工具引用
  rating: number;
  downloads: number;
  authorId: ID;
}

// ── Project（多对话归属） ──
interface Project {
  id: ID;
  name: string;
  conversations: ID[];
  specId?: ID;
  rulesId?: ID;
  createdAt: number;
}

// ── MCP 工具绑定（v1.2） ──
interface MCPToolRef {
  serverName: string;
  toolName: string;
  params: Record<string, unknown>;
}

// ── 上下文窗口管理 ──
interface ContextWindow {
  maxTokens: number;
  usedTokens: number;
  pinnedMessages: Message[];
  summary?: string;               // 超限时自动摘要
  truncatedHistory: Message[];    // 实际传给 LLM 的历史
}
```

---

## 5. 核心模块深化设计

### 5.1 IM 聊天引擎

#### 5.1.1 流式消息渲染

**当前问题**：MVP 的 `BaseAgent.chat()` 按 6~9 字符步进模拟流式，`handleChunkInto()` 每次 `text` chunk 触发一次 `patchMsg` → Zustand setState。在真实 API 场景下，每秒可能触发 30~60 次状态更新。

**优化方案**（三层缓冲）：

```
LLM SSE ──→ Chunk Buffer (累积 ≥10 字符) ──→ Zustand patch (节流 ≤50ms)
                                                  │
                                            ┌─────┴─────┐
                                            ▼           ▼
                                      MessageStore  TypingIndicator
                                      (细粒度订阅)   (独立订阅)
```

```typescript
// 流式缓冲器
class StreamBuffer {
  private buffer = '';
  private lastFlush = 0;
  private readonly MIN_CHARS = 10;
  private readonly MIN_INTERVAL = 50; // ms

  push(delta: string): string | null {
    this.buffer += delta;
    const now = Date.now();
    if (this.buffer.length >= this.MIN_CHARS || (now - this.lastFlush) >= this.MIN_INTERVAL) {
      const out = this.buffer;
      this.buffer = '';
      this.lastFlush = now;
      return out;
    }
    return null;
  }

  flush(): string {
    const out = this.buffer;
    this.buffer = '';
    return out;
  }
}
```

**Zustand 优化**：
- 每条消息独立 `MessageStore`（用 `createSelectors` 模式），避免全量消息数组重建
- `streaming` 消息用 `useRef` 持有最新内容，仅在 flush 时更新 store
- 消息列表用 `React.memo` + 虚拟列表（`@tanstack/react-virtual`）

#### 5.1.2 虚拟列表

当单会话消息 > 200 条时，全量渲染会导致滚动卡顿。引入 `@tanstack/react-virtual`：

```typescript
// 虚拟消息列表
function MessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,          // 预估每条消息 80px
    overscan: 5,                      // 预渲染 5 条
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={messages[virtualItem.index].id}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageBubble message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 5.1.3 群聊 @ 与派单逻辑

```typescript
// 派单决策树（升级版）
function dispatchStrategy(
  conv: Conversation,
  mentions: ID[],
  text: string,
): DispatchResult {
  const nonPmoMentions = mentions.filter(id => id !== ORCHESTRATOR_ID);

  // 1. 单聊 → 直发给该 Agent
  if (conv.type === 'single') {
    return { mode: 'direct', targetAgentId: conv.memberAgentIds[0] };
  }

  // 2. 群聊 @ 单个非 PMO Agent → 直发
  if (nonPmoMentions.length === 1 && !mentions.includes(ORCHESTRATOR_ID)) {
    return { mode: 'direct', targetAgentId: nonPmoMentions[0] };
  }

  // 3. @ PMO 或多 @ → PMO 编排
  // 4. 无 @ → PMO 智能判断是否需编排
  return { mode: 'orchestrated' };
}
```

### 5.2 PMO 编排器（Orchestrator）

#### 5.2.1 从关键词升级为 LLM 驱动

**MVP 方案**（已实现）：`planner.ts` 基于正则关键词匹配 5 种剧本。

**v1.1 方案**：LLM 驱动，JSON Schema 约束输出。

```typescript
// LLM 驱动的 Planner
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '一句话总结任务拆解思路' },
    subTasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          capability: {
            type: 'string',
            enum: ['code', 'design', 'doc', 'data', 'deploy'],
          },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: '依赖的 subTask title 列表',
          },
          estimatedComplexity: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
          },
        },
        required: ['title', 'description', 'capability'],
      },
    },
  },
  required: ['summary', 'subTasks'],
};

async function planWithLLM(
  intent: string,
  availableAgents: Agent[],
): Promise<OrchestratorPlan> {
  const agentsContext = availableAgents.map(a =>
    `- ${a.name} (${a.capabilities.join(', ')}): ${a.tagline}`
  ).join('\n');

  const systemPrompt = `你是 PMO，负责将用户需求拆解为可并行执行的子任务 DAG。
可用 Agent：
${agentsContext}

规则：
1. 能并行的任务不要串行（依赖项留空）
2. 每个任务指定一个 capability，由 Scheduler 自动匹配 Agent
3. 最多拆 6 个子任务，DAG 深度 ≤ 3
4. 输出严格符合 JSON Schema`;

  const response = await llm.chat({
    system: systemPrompt,
    messages: [{ role: 'user', content: intent }],
    response_format: { type: 'json_schema', schema: PLAN_SCHEMA },
  });

  return parsePlanResponse(response, availableAgents);
}
```

**渐进升级策略**：
- 保留关键词剧本作为 **fast path**（延迟 < 100ms），覆盖 80% 常见场景
- LLM 路径作为 **smart path**（延迟 ~2s），处理复杂/未见过的意图
- Router 自动选择：先用关键词匹配，不命中则走 LLM

#### 5.2.2 Scheduler 增强

**当前**：`Promise.race` 循环 + 简单 try/catch fallback。

**增强**：
- 单任务超时控制（默认 120s）
- 并行度限制（最多 3 个 Agent 同时执行，避免 API rate limit）
- 失败重试策略（指数退避，最多 1 次 fallback + 1 次 retry）
- 任务取消（用户发送新消息时可中断当前编排）

```typescript
interface SchedulerOptions {
  maxParallel: number;        // 最大并行数
  taskTimeout: number;        // 单任务超时 (ms)
  retryConfig: {
    maxRetries: number;
    backoffMs: number;
  };
  signal?: AbortSignal;       // 用户取消信号
}

async function scheduleEnhanced(
  plan: OrchestratorPlan,
  context: AgentInput,
  events: ScheduleEvents,
  opts: SchedulerOptions,
): Promise<void> {
  // 用信号量控制并行度
  const semaphore = new Semaphore(opts.maxParallel);

  const runOne = async (task: SubTask) => {
    await semaphore.acquire();
    try {
      await runWithTimeout(
        runWithRetry(task, opts.retryConfig),
        opts.taskTimeout,
      );
    } finally {
      semaphore.release();
    }
  };

  // ... 拓扑排序 + Promise.race 循环（同 MVP）
}
```

#### 5.2.3 Plan Card 交互增强

- **实时状态可视化**：DAG 节点用不同颜色标识 pending/running/success/failed/fallback
- **点击节点查看详情**：展开该子任务的完整 Agent 输出
- **手动干预**：用户可拖拽调整任务依赖、手动 cancel/retry 单个任务
- **DAG 回放**：任务结束后可动画回放执行过程

### 5.3 Agent 适配器层

#### 5.3.1 真实 API 接入

**Claude Code Adapter（真实接入）**：

```typescript
// src/agents/claudeCode.ts (v1.1 真实版)
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeCodeAgent extends BaseAgent {
  private client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  meta: Agent = {
    id: 'agent_claude_code',
    name: 'Claude Code',
    avatarEmoji: '🧠',
    avatarColor: 'bg-orange-500',
    vendor: 'claude-code',
    capabilities: ['code', 'plan', 'doc', 'design'],
    tagline: '严谨的全栈工程师，擅长 React/TS 组件设计与可维护代码',
    online: true,
  };

  protected async *chatReal(input: AgentInput): AsyncIterable<AgentChunk> {
    const stream = await this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: this.buildSystemPrompt(input),
      messages: this.buildMessages(input),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', delta: event.delta.text };
      } else if (event.type === 'content_block_start') {
        // 处理 tool_use 等
        if (event.content_block.type === 'tool_use') {
          yield {
            type: 'tool-call',
            tool: event.content_block.name,
            args: event.content_block.input,
          };
        }
      }
    }
    yield { type: 'done' };
  }
}
```

**迁移成本**：把 Mock 的 `generate()` 替换为 `chatReal()`，约 50 行/Adapter。

#### 5.3.2 Codex / OpenAI Adapter

```typescript
// src/agents/codex.ts (v1.1 真实版)
import OpenAI from 'openai';

export class CodexAgent extends BaseAgent {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  meta: Agent = {
    id: 'agent_codex',
    name: 'Codex',
    avatarEmoji: '🎨',
    avatarColor: 'bg-purple-500',
    vendor: 'codex',
    capabilities: ['code', 'design'],
    tagline: 'CSS 与动效高手，擅长样式打磨与视觉设计',
    online: true,
  };

  protected async *chatReal(input: AgentInput): AsyncIterable<AgentChunk> {
    const stream = await this.client.responses.create({
      model: 'gpt-5',
      input: this.buildMessages(input),
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield { type: 'text', delta: event.delta };
      }
    }
    yield { type: 'done' };
  }
}
```

#### 5.3.3 适配器层的横切关注点

在 Registry 层统一处理（而非每个 Adapter 重复）：

- **重试与降级**：Registry 层统一 try/catch + fallback 路由
- **速率限制**：基于 token bucket 算法，每个 vendor 独立限流
- **计费统计**：记录每次调用的 token 消耗与成本
- **健康检查**：定时 ping 各 Agent API 的 health endpoint

### 5.4 产物系统

#### 5.4.1 产物类型扩展

| 产物类型 | v1.0 (MVP) | v1.1 | v1.2 |
|----------|------------|------|------|
| `code` | ✅ | ✅ + 语言高亮/类型推断 | ✅ + LSP 诊断 |
| `webpage` | ✅ iframe 预览 | ✅ + CSP 沙箱 + postMessage | ✅ + 热更新 |
| `doc` | ✅ Markdown 渲染 | ✅ + 富文本编辑器 | ✅ + 协同编辑 |
| `ppt` | ❌ | ✅ 基础幻灯片预览 | ✅ + 演讲者模式 |
| `image` | ❌ | ✅ AI 生成图片预览 | ✅ + 编辑迭代 |
| `data` | ❌ | ❌ | ✅ 表格/图表交互 |

#### 5.4.2 iframe 沙箱安全方案

```
┌─────────────────────────────────────────────┐
│              Parent Window                   │
│  ┌───────────────────────────────────────┐  │
│  │        ArtifactPanel.tsx              │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  <iframe                        │  │  │
│  │  │    sandbox="allow-scripts       │  │  │
│  │  │             allow-same-origin"  │  │  │
│  │  │    src={blobUrl}                │  │  │
│  │  │    csp="default-src 'self';     │  │  │
│  │  │         script-src 'self'"      │  │  │
│  │  │  />                            │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│          ↕ postMessage (origin-validated)    │
└─────────────────────────────────────────────┘
```

**安全层级**：
1. **iframe `sandbox` 属性**：最小权限（仅 allow-scripts，禁用 allow-same-origin 除非必要时）
2. **CSP 头注入**：`default-src 'self'; style-src 'unsafe-inline'`（预览场景需内联样式）
3. **全局对象净化**：重写 `window.fetch`/`XMLHttpRequest` 为空操作，冻结 `Object.prototype`
4. **来源校验**：postMessage 通信时验证 `event.origin`
5. **资源监控**：`requestIdleCallback` 检测 CPU 异常占用，超阈值自动终止

#### 5.4.3 代码编辑器集成

引入 **Monaco Editor**（VS Code 内核）：

- 产物代码 Tab 使用 Monaco Editor 展示，带语法高亮和基础诊断
- 选中代码片段 → 右键 → "@Agent 修改此处" → 自动附带选区上下文发消息
- Diff Tab 使用 Monaco 的 `diffEditor` 模式，side-by-side 展示版本差异

### 5.5 后端服务设计

#### 5.5.1 API 设计

```
POST   /api/conversations              # 创建对话
GET    /api/conversations              # 获取对话列表
GET    /api/conversations/:id          # 获取对话详情
PATCH  /api/conversations/:id          # 更新对话（归档/置顶）
DELETE /api/conversations/:id          # 删除对话

GET    /api/conversations/:id/messages # 获取消息（分页 + 游标）
POST   /api/conversations/:id/messages # 发送消息（触发 Agent 响应）

POST   /api/agents/chat                # Agent 聊天（SSE 流式）
GET    /api/agents                     # Agent 列表
POST   /api/agents/custom              # 创建自建 Agent

GET    /api/artifacts/:id              # 获取产物
GET    /api/artifacts/:id/versions     # 获取版本历史
POST   /api/artifacts/:id/rollback     # 回滚

POST   /api/deploy                     # 触发部署
GET    /api/deploy/:id/status          # 部署状态（SSE）

GET    /api/skills                     # Skills 列表
POST   /api/skills                     # 创建 Skill

WS     /ws                             # WebSocket 实时通信
```

#### 5.5.2 数据库 Schema

```sql
-- 用户
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  avatar_url TEXT,
  api_keys JSONB DEFAULT '{}',     -- 加密存储
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 对话
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('single', 'group')),
  title VARCHAR(200) NOT NULL,
  member_agent_ids TEXT[] NOT NULL,
  pinned_message_ids TEXT[] DEFAULT '{}',
  archived BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 消息
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'agent', 'system')),
  sender_id VARCHAR(100) NOT NULL,
  content JSONB NOT NULL,             -- MessageContent
  mentions TEXT[] DEFAULT '{}',
  reply_to_message_id UUID REFERENCES messages(id),
  streaming BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- 产物
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  type VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  language VARCHAR(50),
  latest_version_id UUID,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE artifact_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  author_agent_id VARCHAR(100) NOT NULL,
  commit_message VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(artifact_id, version)
);

-- Skills
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  trigger_condition TEXT NOT NULL,
  description TEXT,
  steps JSONB DEFAULT '[]',
  source VARCHAR(20) DEFAULT 'manual',
  conversation_id UUID REFERENCES conversations(id),
  embedding VECTOR(1536),             -- pgvector，语义检索
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 5.5.3 WebSocket 实时通信

```typescript
// 服务端
// 事件类型
type WSEvent =
  | { type: 'message.new'; conversationId: ID; message: Message }
  | { type: 'message.streaming'; conversationId: ID; messageId: ID; delta: string }
  | { type: 'task.status_change'; planId: ID; taskId: ID; status: SubTaskStatus }
  | { type: 'artifact.new_version'; artifactId: ID; version: ArtifactVersion }
  | { type: 'deploy.progress'; deployId: ID; progress: number; step: string }
  | { type: 'typing.indicator'; conversationId: ID; agentId: ID; active: boolean };

// 客户端
const ws = useWebSocket('/ws');
ws.on('message.streaming', ({ conversationId, messageId, delta }) => {
  useChatStore.getState().appendDelta(conversationId, messageId, delta);
});
```

### 5.6 部署发布系统

#### 5.6.1 部署流程

```
用户发 /deploy
    │
    ▼
选中产物 (webpage/code)
    │
    ▼
┌─────────────────────────────┐
│  Step 1: 构建 (Building)    │  → 打包静态资源/容器镜像
│  Step 2: 上传 (Uploading)   │  → Vercel API / MinIO
│  Step 3: 发布 (Publishing)  │  → CDN 分发
│  Step 4: 上线 (Live)        │  → 返回预览 URL
└─────────────────────────────┘
    │
    ▼
部署状态卡片 (实时进度条)
    │
    ▼
PMO 建议沉淀 Skill
```

#### 5.6.2 部署目标

| 产物类型 | 部署方式 | 技术方案 |
|----------|----------|----------|
| `webpage` | 静态站点 | Vercel CLI / Netlify API |
| `code` (组件) | NPM 发布（模拟） | 生成 package.json + 版本号 |
| `doc` | 文档站点 | 推送到 docs 分支 + GitHub Pages |

**MVP 策略**：`webpage` 类型产物用 **Blob URL + iframe** 实现本地即时预览（零部署延迟），真实的 Vercel 部署作为 v1.1 的 `/deploy` 命令。

### 5.7 状态管理重构

#### 5.7.1 从单 store 到分层架构

| 层 | 方案 | 职责 |
|----|------|------|
| **UI State** | Zustand | 选中会话、面板开关、输入框内容、滚动位置 |
| **Domain State** | Zustand (分片) | 会话列表、消息、产物、Skills |
| **Server State** | TanStack Query | API 缓存、分页、重取、乐观更新 |
| **Stream State** | useRef + flush | 流式 chunk 缓冲，避免高频渲染 |
| **Persist State** | Zustand persist | 用户偏好、草稿、最近会话 |

```typescript
// 分片 store 示例
// stores/conversationStore.ts
export const useConversationStore = create<ConversationSlice>((set) => ({
  conversations: [],
  activeId: null,
  setActive: (id) => set({ activeId: id }),
  // ...
}));

// stores/messageStore.ts
export const useMessageStore = create<MessageSlice>((set) => ({
  messagesByConv: {},
  appendDelta: (convId, msgId, delta) => {
    set(state => ({
      messagesByConv: {
        ...state.messagesByConv,
        [convId]: state.messagesByConv[convId]?.map(m =>
          m.id === msgId && m.content.kind === 'text'
            ? { ...m, content: { ...m.content, text: m.content.text + delta } }
            : m
        ),
      },
    }));
  },
  // ...
}));

// hooks/useConversation.ts — 聚合查询
export function useConversation(id: ID) {
  const conv = useConversationStore(s => s.conversations.find(c => c.id === id));
  const messages = useMessageStore(s => s.messagesByConv[id] ?? []);
  const { data: serverMessages, isLoading } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => fetchMessages(id),
    enabled: !!id,
  });
  return { conv, messages: serverMessages ?? messages, isLoading };
}
```

---

## 6. 创新亮点

### 6.1 "Agent 在群里上班"范式

与传统 AI 产品的 1v1 对话不同，AgentHub 首创 IM 群聊协作范式：

- **Agent 即同事**：每个 Agent 有头像、名称、能力标签、在线状态，像真实同事一样出现在会话列表
- **群聊分工**：PMO 自动拆任务并在群里 @ 对应 Agent，所有人（包括用户）都能看到完整协作过程
- **围观学习**：其他 Agent 的输出对同群其他 Agent 可见，形成隐式知识传递和交叉验证

### 6.2 AI 协作三件套产品化

不仅是开发团队的内部方法论，而是作为平台功能开放给所有用户：

- **SPEC.md**：用户在群里输入 `/spec` 即可为任何需求生成 Spec 模板
- **RULES.md**：对话级/项目级行为约束，注入到每个 Agent 的 System Prompt
- **Skills/**：从协作中自动蒸馏可复用经验，新对话按语义相似度自动召回

### 6.3 PMO 拟人化设计

- PMO 不只是调度器，而是一个有"人格"的 Agent
- 输出 Plan Card 时带解释性文字（"我先拆成 4 个子任务，3 个并行的先跑"）
- 任务全部完成后输出"PMO 周报"，统计成功/降级/失败
- 主动观察协作流，提出"是否沉淀为 Skill"的建议

### 6.4 产物迭代闭环

不同于"AI 生成 → 用户复制 → 手动修改"的断裂体验：

1. AI 产出 artifact card（内联预览）
2. 用户点击展开全屏预览
3. 选中代码片段 → 右键 → "@Agent 修改此处" → 自动带选区上下文
4. Agent 产出 diff card → 一键 apply
5. 版本历史完整可追溯 → 任意版本一键回滚
6. 满意后 `/deploy` 一键上线

### 6.5 渐进式真实接入

- MVP 用 Mock 适配器验证交互范式，接口形状与真实 API 对齐
- v1.1 替换 2+ Adapter 的 `generate()` 为真实 API 调用，其余代码零改动
- v1.2 引入 MCP 协议，Agent 可动态发现和调用工具

### 6.6 上下文工程化

- **Pinned 消息**：手动 pin 关键消息作为长期上下文，总是注入 prompt 最前面
- **自动摘要**：超 token 上限时自动生成对话摘要替代早期历史
- **引用上下文**：reply_to 消息自动展开原文片段，而非仅传 ID
- **Skill 召回**：RAG 检索相关 Skill，自动注入 System Prompt

### 6.7 Agent 市场 + 技能生态

- **Agent 模板商店**：社区可发布 Agent 模板（System Prompt + 工具集 + 能力标签）
- **Skills 市场**：协作经验社区沉淀，按 trigger 自动匹配召回
- **一键复刻**：看到别人群聊的效果好，一键"复刻这个 Agent 配置到我自己的对话"

---

## 7. 分阶段实施路线图

### v1.0 — MVP 完成（4 周）✅ 已完成

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1 | 类型系统 + Agent 适配器骨架 | `types.ts` + `base.ts` + 4 Adapters (Mock) |
| W2 | Orchestrator (Planner + Scheduler + Aggregator) | DAG 拆解 + 并行调度 + 失败降级 |
| W3 | UI 三栏布局 + 流式消息 + 产物面板 | 12 个 React 组件 |
| W4 | 集成 + 调试 + SPEC/RULES/Skills | 可运行 Demo + 文档 |

### v1.1 — 真实接入 + 后端（4 周）🔴 当前阶段

| 周次 | 模块 | 具体任务 | 交付物 |
|------|------|----------|--------|
| **W1** | 后端基础 | Express + WebSocket + PostgreSQL + Redis | 后端骨架可运行 |
| | 数据迁移 | 前端 Mock 数据 → DB 持久化 | REST API 可 CRUD 对话/消息 |
| **W2** | Agent 真实接入 | Claude API Adapter (+ Anthropic SDK) | 真实流式回复可展示 |
| | | OpenAI/Codex API Adapter | 2+ 厂商真实接入 |
| | LLM Planner | 关键词→LLM DAG 升级 | Planner 可处理未见过的意图 |
| **W3** | 产物增强 | Monaco Editor 集成 | 代码 Tab / Diff Tab 可用 |
| | | iframe 沙箱 + CSP + postMessage | 安全预览方案就绪 |
| | | Skill RAG 召回 (pgvector) | 新对话按语义召回相关 Skill |
| **W4** | 部署系统 | Vercel 部署集成 | `/deploy` 真实部署 + URL 返回 |
| | 集成测试 | E2E 测试 + 性能优化 | 完整 Demo 可用 |

### v1.2 — 生态 + 多端（4 周）

| 周次 | 模块 | 具体任务 | 交付物 |
|------|------|----------|--------|
| **W1** | MCP 集成 | MCP Server 框架 + 工具注册 | Agent 可动态发现工具 |
| **W2** | Agent 市场 | 模板发布/浏览/搜索/下载 | Agent Market 可运营 |
| | Skills 市场 | 社区 Skills 沉淀 + 评分 | Skills 生态可用 |
| **W3** | 桌面端 (Electron) | 本地文件访问 + 系统通知 + Agent 进程管理 | 桌面端可运行 |
| | 移动端 (PWA) | 轻量 IM 体验：对话/审批/预览 | 移动端可访问 |
| **W4** | 多人协作 | 多用户会话 + 共享对话 + 权限 | 多人 Demo |
| | 性能 + 安全 | 审计日志 + 速率限制 + 安全加固 | 可演示 |

### v1.3 — 商业化（未来）

- 多租户 + SSO + RBAC
- API Key 管理 + 用量计费
- Agent 付费模板市场
- 企业私有化部署方案

---

## 8. 技术选型与决策记录

### 8.1 前端技术栈

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| React | 18.3 | 生态最成熟，社区组件丰富 |
| TypeScript | 5.6 | 严格类型检查，`IAgent` 契约的类型安全 |
| Vite | 5.4 | 开发体验优于 webpack，HMR 极快 |
| Zustand | 5.0 | 轻量（~8KB），API 简洁，支持细粒度订阅 |
| TanStack Query | 5.x | 服务端状态缓存/分页/乐观更新 |
| TanStack Virtual | 3.x | 虚拟列表性能优化 |
| TailwindCSS | 3.4 | 原子化 CSS，飞书风格 Design Token 可配置 |
| Monaco Editor | 0.50+ | VS Code 内核，代码编辑/DIff 无需自研 |
| Lucide React | 0.469 | 图标库，与飞书风格对齐 |

### 8.2 后端技术栈

| 技术 | 选型理由 |
|------|----------|
| **Node.js + Express** | 与前端同语言，降低全栈开发门槛 |
| **WebSocket (ws)** | 实时流式消息推送，比 SSE 更灵活（双向通信） |
| **PostgreSQL** | 成熟的关系型数据库，JSONB 支持半结构化数据 |
| **pgvector** | PostgreSQL 原生向量扩展，Skill RAG 语义召回无需额外服务 |
| **Redis** | 会话缓存 + 速率限制 + 消息队列 |
| **Docker Compose** | 本地开发一键启动所有服务 |

### 8.3 决策记录

| 决策 | 选项 A | 选项 B | 选择 | 理由 |
|------|--------|--------|------|------|
| 状态管理 | Zustand | Redux Toolkit | **Zustand** | MVP 已用，API 更简洁，性能相当 |
| 虚拟列表 | react-virtualized | @tanstack/react-virtual | **TanStack** | 更新活跃，API 更现代，Tree-shaking 更好 |
| 后端语言 | Node.js | Python (FastAPI) | **Node.js** | 前后端同语言，团队学习成本低 |
| ORM | Prisma | Drizzle | **Drizzle** | 更轻量，SQL-like API，TypeScript 类型推断更好 |
| Agent 编排 | 自研 | CrewAI / LangGraph | **自研** | 差异化的 IM 群聊范式需要定制调度逻辑 |
| 实时通信 | SSE | WebSocket | **WebSocket** | 需要双向通信（用户中断、状态同步） |
| 向量数据库 | Pinecone | pgvector | **pgvector** | 免运维，PostgreSQL 内聚，数据量可控 |

---

## 9. AI 协作开发规范

### 9.1 开发流程

```
需求输入 → /spec 生成 Spec → Review → /plan 拆 TaskList
                                              │
                              ┌───────────────┤
                              ▼               ▼
                          AI 实现         AI Code Review
                              │               │
                              └───────┬───────┘
                                      ▼
                                 集成测试
                                      │
                                      ▼
                               /deploy 部署
                                      │
                                      ▼
                            PMO 复盘 → 沉淀 Skill
```

### 9.2 Spec 模板（每个 Feature 必填）

```markdown
## 背景
## 目标
- [ ] P0: ...
- [ ] P1: ...
## 用户故事
作为 ___，我希望 ___，以便 ___。
## 验收标准
- [ ] 标准 1
- [ ] 标准 2
## 非目标
## 风险
```

### 9.3 Commit 规范

遵循 RULES.md R2：`<type>: <description>`

- `feat:` 新功能
- `fix:` 修复
- `style:` 样式
- `docs:` 文档
- `refactor:` 重构
- `chore:` 杂项

### 9.4 单文件行数上限

- 组件 / 工具函数：≤ 300 行
- Store 文件：≤ 500 行（聚合多个 slice）
- 超出则拆分，拆分原则：单一职责 + 高内聚

### 9.5 AI 协作记录

每次与 AI 协作完成的功能，记录到 `.agenthub/collab-log/`：

```markdown
---
feature: LLM 驱动 Planner
date: 2026-06-05
ai_agent: Claude Code
human: 架构设计 + Schema 定义 + Code Review
ai: Planner 实现 + 单元测试 + JSON Schema
skill_distilled: llm-planner-schema-design.md
---
```

---

## 10. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| Agent API 调用延迟 > 5s | 中 | 用户体验差 | 流式渲染掩盖延迟；fast path（关键词）兜底 |
| LLM Planner 输出非预期结构 | 中 | 调度失败 | JSON Schema 强制约束 + 解析失败降级为单 Agent |
| 多 Agent 并发改同一产物 | 中 | 产物状态错乱 | append-only 版本模型 + 冲突检测弹 Modal |
| API Key 泄露 | 低 | 安全隐患 | 前端加密存储 + 后端代理转发（不暴露给浏览器） |
| 流式消息高频渲染卡顿 | 中 | UI 卡顿 | 缓冲 + 节流 + 虚拟列表 + useDeferredValue |
| 评委认为 Mock 是"假演示" | 中 | 答辩质疑 | README 明确标注 Mock 边界 + 真实 API 接入演示 |
| pgvector 性能不足 | 低 | Skill 召回延迟 > 1s | 小数据量（< 1 万条）pgvector 够用；按需升级 Pinecone |
| 后端增加部署复杂度 | 低 | Demo 演示失败 | v1.0 纯前端永远可独立运行；后端是 v1.1 的渐进增强 |

---

## 11. 附录

### A. 项目结构（v1.1 目标）

```
agenthub/
├── client/                     # 前端 (React + Vite)
│   ├── src/
│   │   ├── agents/             # Agent 适配器（同 MVP）
│   │   │   ├── base.ts
│   │   │   ├── claudeCode.ts   # 真实 Anthropic API
│   │   │   ├── codex.ts        # 真实 OpenAI API
│   │   │   ├── openCode.ts
│   │   │   ├── custom.ts
│   │   │   └── registry.ts
│   │   ├── orchestrator/       # PMO 编排器
│   │   │   ├── index.ts
│   │   │   ├── planner.ts      # LLM 驱动（v1.1）
│   │   │   ├── scheduler.ts    # 增强版（超时/取消/限流）
│   │   │   └── aggregator.ts
│   │   ├── stores/             # 分层状态管理
│   │   │   ├── conversationStore.ts
│   │   │   ├── messageStore.ts
│   │   │   ├── artifactStore.ts
│   │   │   ├── uiStore.ts
│   │   │   └── skillStore.ts
│   │   ├── hooks/              # 自定义 Hooks
│   │   │   ├── useConversation.ts
│   │   │   ├── useChatStream.ts
│   │   │   ├── useVirtualList.ts
│   │   │   └── useWebSocket.ts
│   │   ├── components/         # UI 组件
│   │   │   ├── conversation/
│   │   │   │   ├── ConversationList.tsx
│   │   │   │   ├── ConversationItem.tsx
│   │   │   │   └── NewChatModal.tsx
│   │   │   ├── chat/
│   │   │   │   ├── ChatWindow.tsx
│   │   │   │   ├── MessageList.tsx     # 虚拟列表版
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── PlanCard.tsx
│   │   │   │   ├── DeployCard.tsx
│   │   │   │   └── TypingIndicator.tsx
│   │   │   ├── artifact/
│   │   │   │   ├── ArtifactPanel.tsx
│   │   │   │   ├── PreviewTab.tsx      # iframe 沙箱
│   │   │   │   ├── CodeTab.tsx         # Monaco Editor
│   │   │   │   ├── DiffTab.tsx
│   │   │   │   └── HistoryTab.tsx
│   │   │   ├── agent/
│   │   │   │   ├── AgentPicker.tsx
│   │   │   │   ├── AgentMarket.tsx
│   │   │   │   └── AgentCard.tsx
│   │   │   └── skill/
│   │   │       └── SkillsDrawer.tsx
│   │   ├── utils/
│   │   │   ├── id.ts
│   │   │   ├── diff.ts
│   │   │   ├── streamBuffer.ts
│   │   │   └── sandbox.ts      # iframe 沙箱工具
│   │   ├── types.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── ...
│
├── server/                     # 后端 (Node.js + Express)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── conversations.ts
│   │   │   ├── messages.ts
│   │   │   ├── agents.ts
│   │   │   ├── artifacts.ts
│   │   │   ├── deploy.ts
│   │   │   └── skills.ts
│   │   ├── services/
│   │   │   ├── llmGateway.ts   # LLM 调用网关
│   │   │   ├── deployService.ts
│   │   │   └── skillSearch.ts  # pgvector 语义检索
│   │   ├── db/
│   │   │   ├── schema.ts       # Drizzle ORM Schema
│   │   │   └── migrations/
│   │   ├── ws/
│   │   │   └── wsServer.ts     # WebSocket 服务
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── rateLimit.ts
│   │   └── index.ts
│   ├── Dockerfile
│   └── ...
│
├── .agenthub/                  # AI 协作沉淀
│   ├── skills/                 # 可复用 Skill 文件
│   ├── collab-log/             # 协作记录
│   └── templates/              # Spec/Rules 模板
│
├── docker-compose.yml          # PostgreSQL + Redis + App
├── SPEC.md                     # 平台 Spec
├── RULES.md                    # Agent 行为约束
└── README.md
```

### B. 关键接口契约（不变部分）

> 以下接口从 MVP 继承，v1.1 保持不变——这正是 Adapter Pattern 的价值。

```typescript
interface IAgent {
  meta: Agent;
  chat(input: AgentInput): AsyncIterable<AgentChunk>;
  healthCheck(): Promise<boolean>;
}

type AgentChunk =
  | { type: 'text'; delta: string }
  | { type: 'code'; language: string; filename?: string; code: string }
  | { type: 'artifact-draft'; artifactType: ArtifactType; name: string; language?: string; content: string; commitMessage: string }
  | { type: 'tool-call'; tool: string; args: any }
  | { type: 'done' }
  | { type: 'error'; error: string };
```

### C. 评分对齐自检

| 维度 | 权重 | v2.0 对应策略 |
|------|------|--------------|
| **AI 协作能力** | 30% | SPEC + RULES + Skills 生态 + 协作开发记录 + Skill 自动蒸馏 |
| **功能完整度** | 25% | IM 单/群聊 + PMO 编排 + 2+ 真实 Agent API + 产物预览/Diff/回滚 + 部署 |
| **生成效果质量** | 20% | 飞书 UI + 流式 typing + Monaco Editor + iframe 沙箱预览 + DAG 可视化 |
| **代码理解度** | 15% | 类型严格( discriminated union ) + 分层清晰 + 架构决策记录 + 本文档即答辩资料 |
| **创新与产品感** | 10% | "Agent 在群里上班" IM 范式 + PMO 拟人化 + Skill 自沉淀 + Agent 市场 |

### D. 参考文献

- LLMCompiler (arXiv 2312.04511) — DAG-based parallel function calling
- Gradientsys (arXiv 2507.06520) — Multi-Agent LLM Scheduler with ReAct Orchestration
- UFO3 — Cross-Device DAG Orchestration with TaskConstellations
- Anthropic MCP Specification (2025-11-25) — Model Context Protocol
- MCP-AX IETF Draft (May 2026) — Hierarchical Tool Namespace Delegation
- CrewAI v1.14 — Role-Based Multi-Agent Framework
- LangGraph — StateGraph-based Agent Orchestration
- AWS Generative AI Chat Reference Architecture
- Vercel AI SDK — Streaming Chat & Tool Use Patterns

---

> **🤖 本文档由人类架构设计 + Claude Code 辅助撰写，遵循 AgentHub 自身的"先 Spec 后 Code"原则。**
> 
> **下一步**：基于本方案，通过 `/plan` 拆解为可执行的 TaskList，逐项实现。
