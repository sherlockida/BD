# AgentHub Canvas v2 — 颠覆式交互重构方案

> **状态**: 设计提案 · 待评审通过后启动 PoC
> **基于**: [AgentHub 设计要求](../AgentHub-%20多Agent协作平台设计要求.md) · [v1.1 W4 完整工程](../dev-log/v1.1_W4_完整工程交付_2026-06-06.md) · [AgentHub_Imp.md v2.0](./AgentHub_Imp.md)
> **日期**: 2026-06-07
> **目标**: 黑客松"评委记得住"的差异化作品
> **作者**: AgentHub 架构组

---

## 目录

1. [背景与问题](#1-背景与问题)
2. [市面调研与定位](#2-市面调研与定位)
3. [核心隐喻：数字车间](#3-核心隐喻数字车间)
4. [第一支柱：Canvas 主视图](#4-第一支柱canvas-主视图)
5. [第二支柱：生成式 UI（A2UI Catalog 协议）](#5-第二支柱生成式-uia2ui-catalog-协议)
6. [第三支柱：Demo 加分特效](#6-第三支柱demo-加分特效)
7. [技术架构](#7-技术架构)
8. [实施路径（5 天 PoC）](#8-实施路径5-天-poc)
9. [风险与对策](#9-风险与对策)
10. [与现有 v1.1 投资的关系](#10-与现有-v11-投资的关系)
11. [评委视角自检](#11-评委视角自检)
12. [附录](#12-附录)

---

## 1. 背景与问题

### 1.1 v1.1 工程已经完成的事情

| 维度 | 现状 |
|------|------|
| 后端 | Express + WebSocket + PostgreSQL + Drizzle ORM，REST/SSE/WS 三套通信链路完备 |
| 前端 | React + Vite + Zustand，飞书风三栏布局（左对话/中聊天/右产物） |
| 编排 | PMO Planner（关键词快路径 + LLM 智路径）/ Scheduler / Aggregator 全链路 |
| 产物 | Monaco Editor / iframe CSP 沙箱 / Diff Editor / 版本历史 / 一键回滚 |
| 部署 | Vercel 真实 API 集成（含 token 缺失的本地预览降级）|
| 测试 | 58 个用例（前后端各 ~30）+ Playwright E2E 框架就绪 |

工程链路 **完整且可用**，常规标准下是合格的多 Agent 平台。

### 1.2 真正的痛点：评委记不住

我们对照 2026 行业头部产品的视觉/交互范式，得到这样的结论：

| 维度 | AgentHub v1.1 | 同质竞品 |
|------|---------------|----------|
| 主交互范式 | 飞书风 IM 群聊 | ChatGPT/Devin 单聊、Bolt/v0/Replit 编辑器+聊天 |
| 多 Agent 协作可见性 | 串行消息气泡 | 同左 |
| 产物表达 | 右侧产物面板 + 内联卡片 | 同左 |
| 部署 | DeployCard 动画 + URL | 同左 |

> **评委的体感**：「每个功能我都能在 Cursor/Devin/Manus/Bolt 里找到对应的，没有让我必须记住的东西。」

### 1.3 我们要解决的真问题

不是"加更多功能"，而是 **重塑核心交互范式**，让用户和评委从打开界面的第一秒就感受到差异：

| 目标 | 衡量 |
|------|------|
| **颠覆传统交互** | 第一眼不是聊天框，是一张会动的协作图 |
| **极具创新** | 至少 3 个市面无对应的"杀手镜头"，能成为 Demo 视频的关键 frame |
| **落地可行** | 5 天 PoC 可录 Demo，对现有 v1.1 资产 90% 复用 |
| **好用** | 用户能在零文档情况下完成一次完整的"画布协作 + 部署" |

---

## 2. 市面调研与定位

### 2.1 2026 行业共识：Beyond the Chat Wall

| 趋势 | 代表产品/协议 | 关键洞察 |
|------|--------------|----------|
| **空间画布范式** | tldraw / Figma Agent / Storyflow | "多人协作 + 多 Agent" 正在从聊天窗口走向无限画布 |
| **生成式 UI 协议** | A2UI / AG-UI (CopilotKit) | Agent 主动产出可交互组件，"聊天"与"工具"边界模糊 |
| **Insight Timeline** | InsightsFeed / DataSite (arXiv 2505.19101) | 人和 Agent 共享时间轴，看见彼此的"发现流" |
| **观察性即产品** | LangGraph / Dagster UI | 不可见的调度过程必须变成可见的图谱 |

### 2.2 头部竞品的痛点（我们的机会）

> 调研来源见 [§12.4 参考文献](#124-参考文献)

| 产品 | 现象级痛点 | AgentHub Canvas 的解法 |
|------|-----------|------------------------|
| **Manus AI** | 异步黑盒，提交后等 30 分钟无法 mid-task 干预；架构决策强加给用户 | 画布上随时可见每个 Agent 的状态；订单卡可随时拖给别的工位 |
| **Devin AI** | 13.86% 任务成功率，"看上去能做但不靠谱" | 工位脉动 + 思考流暴露 + 派生连线，过程透明 → 信任 |
| **v0 / Bolt** | 单 Agent 串行；多 Agent 协作能力缺失 | PMO 调度多工位并行可见 |
| **Cursor / Lovable** | "watch in real-time" 看着累，注意力被 IDE 黏住 | 画布是上帝视角，用户不再陷入 IDE |
| **ChatGPT GPT Builder** | 工作流是隐式的 prompt | 工作流是显式的可视拓扑，每个节点都能 Replay |

### 2.3 AgentHub Canvas 的差异化定位

> **AgentHub Canvas 是市面唯一把"多 Agent 协作过程"产品化为可交互空间图谱的平台。**

- 与 Figma Agent 不同：Figma 是"画布产品 + 加 AI"，我们是"AI 协作 + 用画布表达"
- 与 tldraw 不同：tldraw 是 SDK，我们是端到端产品（Agent / 协议 / 部署都自带）
- 与 LangGraph UI 不同：LangGraph UI 给开发者看，我们给最终用户看（隐藏 DAG 数学，露出"车间"隐喻）

---

## 3. 核心隐喻：数字车间

### 3.1 隐喻替换

**旧**：飞书群聊 → Agent 是联系人，协作是消息流
**新**：数字车间 → Agent 是工位，协作是订单流转

### 3.2 概念词表

| 抽象 | 新名 | 旧名（v1.1） | 视觉 |
|------|------|-------------|------|
| 用户需求 | 订单（Order） | 用户消息 | 圆角矩形卡 + 订单号徽章 |
| Agent | 工位（Workstation） | Agent 联系人 | 头像 + 状态脉冲条 + 思考流 |
| Agent 产物 | 工件（Artifact Tile） | Artifact | 瓷砖 + 缩略图 + 版本徽章 |
| 派生关系 | 血脉连线（Lineage Edge） | parentVersion 字段 | 可视贝塞尔曲线 |
| 编排器 | 车间主任（Foreman） | PMO Orchestrator | 特殊工位 + 分发动画 |
| 合并/对比 | 合并工件（Merge Tile） | DiffPayload | 菱形虚线框 |
| 用户交互入口 | 命令面板（Command Palette） | 输入框 | ⌘K 浮层 |
| 时间维度 | 时间线（Timeline Rail）| 无 | 右侧泳道图 |
| 整体记忆 | 复盘动画（Replay）| 无 | 画布压缩回放 |

### 3.3 为什么这个隐喻成立

- **车间** = 多人/多机器并行 = 完美对应多 Agent 并行执行
- **订单** = 异步执行 + 可追溯状态 = 对应 PMO 的 DAG 任务
- **工件 + 血脉** = 产物的派生关系，天然回答"这版从哪来"
- **复盘** = 既是工程概念也是体育概念 = 用户秒懂

### 3.4 不放弃 IM：双模式保留

Canvas 是新主视图，但飞书风 IM 完整保留作为 **Classic 模式**：
- 顶栏切换按钮 `[● Canvas │ ○ Classic IM]`
- 数据完全共享（同一份 appStore）
- 用于演示对比、用户兜底、移动端轻量场景

---

## 4. 第一支柱：Canvas 主视图

### 4.1 整体布局

```
┌──────────────────────────────────────────────────────────────────────┐
│  AgentHub Canvas  [⌥ Project ▾]  [● Canvas │ ○ Classic IM]  ⌘K  👤  │
├──────────┬──────────────────────────────────────────────┬───────────┤
│ 工位墙   │             中央无限画布 (Pan/Zoom)           │ 时间线    │
│ Bench    │                                              │ Timeline  │
│          │       ┌──────────────┐                       │           │
│ ┌──────┐ │       │ Order #1024  │                       │  Claude   │
│ │  PMO │─┼──────►│"博客门户首页"│                       │  ▮▮▮▮▮▮▮  │
│ └──┬───┘ │       └───────┬──────┘                       │           │
│    │     │               ▼                              │  Codex    │
│ ┌──▼───┐ │     ┌─────────┼─────────┐                    │  ▮▮▮▮▮    │
│ │Claude│ │     ▼         ▼         ▼                    │           │
│ │  ●   │ │  ┌──────┐  ┌──────┐  ┌──────┐                │  DocBot   │
│ └──┬───┘ │  │ HTML │  │ CSS  │  │README│                │  ▮▮▮▮▮▮   │
│    │     │  │  ▷   │  │  ▷   │  │  ▷   │                │           │
│ ┌──▼───┐ │  └──┬───┘  └──┬───┘  └──┬───┘                │     ▲     │
│ │Codex │ │     │         │         │                    │    now    │
│ │  ●   │ │     └────┬────┴─────────┘                    │           │
│ └──┬───┘ │          ▼                                    │           │
│    │     │   ┌─[Merge Tile]┐                            │           │
│ ┌──▼───┐ │   │  拖入对比/演化│                            │           │
│ │ Doc  │ │   └──────────────┘                            │           │
│ │  ●   │ │                                               │           │
│ └──────┘ │                                               │           │
│          │  ┌──────────────────────────────────────┐    │           │
│ [+ 添加] │  │ /spec │ /plan │ @Claude 改主色 │ ⌘K  │    │           │
└──────────┴──┴──────────────────────────────────────┴────┴───────────┘
```

### 4.2 三种主要节点

#### 4.2.1 OrderNode（订单节点）

```typescript
interface OrderNodeData {
  orderId: string;          // 短订单号，如 #1024
  intent: string;           // 用户需求原文
  acceptedBy?: AgentId;     // PMO 接单后填充
  acceptedAt?: number;
  status: 'pending' | 'planning' | 'dispatched' | 'done';
}
```

**视觉**：浅色圆角矩形，左上角订单号徽章，右上角状态点。

**交互**：
- 创建：底部输入框回车、画布右键菜单"新订单"、⌘K"new order"
- 拖拽到工位：等价于"指派给该工位"（绕过 PMO 自动派单）
- 双击：展开详情抽屉（查看完整 prompt、依赖工件、产出记录）

#### 4.2.2 WorkstationNode（工位节点）

```typescript
interface WorkstationNodeData {
  agentId: AgentId;
  meta: Agent;
  status: WorkstationStatus;
  thinkingStream: ThinkingFrame[];   // 滚动窗口最新 3 条
  telemetry: {
    tokensPerSec: number;
    inputTokensUsed: number;
    activeOrderId?: string;
  };
}

type WorkstationStatus =
  | 'idle'
  | 'thinking'
  | 'producing'      // 正在产出 chunk
  | 'awaiting-input' // 弹了 GenUI 等用户操作
  | 'done'
  | 'error';

interface ThinkingFrame {
  kind: 'read' | 'decide' | 'write';
  summary: string;     // 一行 < 40 字
  timestamp: number;
}
```

**视觉**：
- 头像（emoji 或字母）+ Agent 名 + vendor 徽章
- 状态脉冲条：纯色矩形，根据 status 用不同色 + 不同呼吸节奏（参考 macOS 录屏指示灯）
- 思考流：3 行小字滚动（"读：PMO 任务 / 决：用 React Hook Form / 写：Hero.tsx:42"）
- 顶部 telemetry 微型条形图：token/秒实时跳

**交互**：
- Hover：浮出操作菜单（暂停/重启/打开思考流详情）
- 双击：右侧抽屉打开"Agent 详情面板"（完整思考流、历史产出、当前 prompt）
- 拖动工件到工位：自动 @ 该 Agent 修改该产物

#### 4.2.3 ArtifactTile（工件瓷砖）

```typescript
interface ArtifactTileData {
  artifactId: ID;
  versionId: ID;
  type: ArtifactType;        // code / webpage / doc / ppt
  name: string;
  thumbnail?: string;        // dataURI 或截图，可选
  authorAgentId: AgentId;
  derivedFrom?: ID[];        // 父工件 id，用于绘制血脉连线
  version: number;
}
```

**视觉**：
- 瓷砖式卡片，左上角类型图标，右上角版本徽章 `v3`
- webpage 类型显示 iframe 缩略图
- code 类型显示前 6 行代码 + 语言标签
- doc 类型显示首段 markdown 渲染

**交互**：
- Hover：弹出 200×120 预览悬浮窗
- 双击：进入"全屏工件模式"（Monaco Editor / 全屏 iframe / 全屏 markdown）
- 拖到 MergeNode：触发对比/合并
- 拖到工位：@ 该 Agent 修改
- 右键：复制 / 导出 / 沉淀为 Skill / 删除

#### 4.2.4 MergeNode（合并节点）

**视觉**：菱形虚线占位，提示文字"拖入 2 个以上工件"。

**行为**：
- 拖入 2 个工件 → 自动调用后端 PMO → 产出 Diff 或合并工件
- 拖入 3+ 工件 → 调用 PMO + 输出"演化提案"（PMO 给出三种合并方向）

### 4.3 派生连线（LineageEdge）

可视化"谁从谁演化而来"，是画布的灵魂：

| 连线样式 | 含义 |
|----------|------|
| 实线 + 箭头 | Order → Workstation → Artifact（派单链） |
| 虚线 + 箭头 | Artifact → Artifact（版本演化） |
| 双线 + 圆点节奏 | 活跃中（chunk 流动）|
| 粗细 | 协作权重（多 Agent 共同产出权重更大）|

边类型与 React Flow 的 `EdgeProps` 对齐，自定义 React 组件实现。

### 4.4 三大辅助区

#### 4.4.1 左侧 BenchWall（工位墙）

紧凑版工位列表，可折叠为图标列。点击工位 = 画布滚动到该工位 + 高亮。底部有 `+ 添加 Agent` 入口。

#### 4.4.2 右侧 TimelineRail（时间线）

```
垂直时间轴，竖直方向是时间（下→上：早→晚）
每个 Agent 一条泳道
泳道内方块 = 一次连续产出会话，颜色编码状态
泳道上的圆点 = 里程碑事件（启动/产物落地/错误/完成）
点击任意点 = 画布快照跳转到那个时刻
```

#### 4.4.3 底部 CommandBar（命令栏）

| 输入 | 效果 |
|------|------|
| 普通文本 | 自动落为新订单 |
| `/spec` | 触发 SPEC 模板生成（复用现有 Spec 流） |
| `/plan` | 强制走 PMO 编排（即使是简单任务） |
| `/deploy` | 触发选中工件部署 |
| `/new-agent` | 弹出自建 Agent 表单 |
| `@AgentName` | 后接的文本自动 @ 该 Agent |
| `⌘K` | 命令面板（搜订单/工件/Agent/Skill） |

### 4.5 视图切换机制

App.tsx 顶层路由：

```typescript
type ViewMode = 'canvas' | 'classic';

function App() {
  const [view, setView] = useState<ViewMode>('canvas');

  return (
    <div className="h-screen w-screen flex flex-col">
      <TopBar view={view} onSwitch={setView} />
      {view === 'canvas' ? <CanvasView /> : <ClassicIMView />}
    </div>
  );
}
```

**两个视图共享 appStore**，仅渲染层不同。切换时无数据加载、无白屏。

---

## 5. 第二支柱：生成式 UI（A2UI Catalog 协议）

### 5.1 核心理念

Agent 的"产出"不只是文字、代码、产物，**还可以是一段"让用户做选择"的交互组件**。这把"聊天"和"工具"的边界打破，让用户从被动看 → 主动点。

### 5.2 协议设计

#### 5.2.1 AgentChunk 新增类型

`agenthub-mvp/src/types.ts` 与 `server/src/types.ts` 同步：

```typescript
export type AgentChunk =
  // 现有
  | { type: 'text'; delta: string }
  | { type: 'code'; language: string; filename?: string; code: string }
  | { type: 'artifact-draft'; artifactType: ArtifactType; name: string; language?: string; content: string; commitMessage: string }
  | { type: 'tool-call'; tool: string; args: unknown }
  | { type: 'done' }
  | { type: 'error'; error: string }
  // 新增 ↓
  | { type: 'ui-component';
      componentId: ID;                    // 实例唯一 ID
      component: keyof Catalog;           // catalog 中的名字
      props: CatalogProps[keyof Catalog]; // catalog 预审过的 props
      awaitsInput: boolean;               // 是否阻塞等待用户操作
    }
  | { type: 'ui-input';                   // 用户操作回传后端
      componentId: ID;
      value: unknown;                      // 由 catalog 定义具体类型
    };
```

#### 5.2.2 后端 API 端点

```
POST /api/agents/ui-input
Body: { conversationId, componentId, value }
作用: 把用户在 GenUI 组件上的操作回写到对话上下文，
      触发对应 Agent 自动续跑（如果该 Agent 之前 awaitsInput=true）
```

### 5.3 v1 Catalog（保守起步：4 个组件）

```typescript
// genui/catalog.ts
export const Catalog = {
  ChoiceCards: {
    propsSchema: z.object({
      title: z.string(),
      options: z.array(z.object({
        id: z.string(),
        label: z.string(),
        preview: z.string().optional(),  // 缩略图 URL 或 emoji
        description: z.string().optional(),
      })).min(2).max(6),
    }),
    valueSchema: z.object({ chosenId: z.string() }),
  },
  ColorPickerGrid: {
    propsSchema: z.object({
      title: z.string(),
      suggested: z.array(z.string()).max(12),  // 十六进制色数组
      allowCustom: z.boolean().default(true),
    }),
    valueSchema: z.object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }),
  },
  SliderRange: {
    propsSchema: z.object({
      title: z.string(),
      min: z.number(),
      max: z.number(),
      step: z.number().default(1),
      defaultValue: z.number().optional(),
      unit: z.string().optional(),  // 'px' / 's' / '%'
    }),
    valueSchema: z.object({ value: z.number() }),
  },
  ConfirmCard: {
    propsSchema: z.object({
      title: z.string(),
      body: z.string(),
      danger: z.boolean().default(false),
      confirmLabel: z.string().default('确认'),
      cancelLabel: z.string().default('取消'),
    }),
    valueSchema: z.object({ confirmed: z.boolean() }),
  },
} as const;
```

**为什么只有 4 个**：A2UI 协议的核心是 **catalog 受限**——前端只渲染白名单组件，安全且可控。先做 4 个高频场景，验证协议合理后再扩。

### 5.4 LLM 注入提示词

`server/src/services/plannerService.ts` 与各 Agent prompt 注入：

```text
## 交互组件能力

你可以使用以下交互组件让用户做选择，避免反复打字。
当你不确定应该用什么方案时，主动产出组件比"提问让用户回答"体验更好。

可用组件（你只能使用 catalog 中的组件，不在 catalog 中的会被忽略）：

- ChoiceCards(title, options[{id,label,preview?,description?}])
  → 当存在 2-6 个对等选项让用户挑（风格/方案/方向）
- ColorPickerGrid(title, suggested[]: hex, allowCustom)
  → 当需要颜色输入
- SliderRange(title, min, max, step, unit?)
  → 当需要数值参数（字号/圆角/动效时长/数量）
- ConfirmCard(title, body, danger)
  → 当将要执行不可逆/高风险操作（部署/删文件/覆盖）

输出格式：使用 ```ui ... ``` 围栏包裹 JSON，schema 与上述对齐。
示例：

```ui
{
  "component": "ChoiceCards",
  "props": {
    "title": "你想要哪种博客风格？",
    "options": [
      {"id": "minimal", "label": "极简", "preview": "🎯"},
      {"id": "glass",   "label": "玻璃风", "preview": "🪟"},
      {"id": "brutal",  "label": "野蛮主义", "preview": "🧱"},
      {"id": "warm",    "label": "暖色文艺", "preview": "🌅"}
    ]
  }
}
```

收到 ```ui``` 围栏后：
1. 你的本轮回答应该结束（不再继续输出文本/代码）
2. 系统会暂停你的执行，等待用户操作
3. 用户操作后你会被自动唤醒，并在 system message 中收到用户的选择
4. 此时再继续完成原本的任务
```

### 5.5 解析与渲染管线

```
后端流: Agent SSE 文本流
         ↓
       parseUiFence.ts: 检测 ```ui ... ``` 围栏 → 抽取 JSON
         ↓
       Zod 校验 → 不通过则降级为 text chunk
         ↓
       下发 { type: 'ui-component', componentId, component, props, awaitsInput: true }
         ↓
前端 ChunkHandler: 创建新的 GenUI Node 落到画布上（位置=该工位下方）
         ↓
       Renderer.tsx: 按 component 名 + props 渲染对应 React 组件
         ↓
用户操作 → 组件 onSubmit(value) → POST /api/agents/ui-input
         ↓
后端: 更新对话 history（注入 system message "用户选择了 X"）→ 唤醒 Agent
         ↓
       Agent 续跑，产出剩余 chunk
```

### 5.6 杀手镜头脚本（Demo 录制时按此演）

```
0:00  用户在画布上空白处右键 → "新订单"
0:02  打字: "做个独立开发者博客门户首页"
0:05  Enter → OrderNode 落到画布中央
0:06  PMO 工位脉冲 → 红线动画延伸到 OrderNode
0:08  PMO 弹出 ChoiceCards: 4 个风格预览缩略图
0:10  鼠标悬停"玻璃风" → 卡片放大预览
0:12  单击 → 卡片灰化，Claude / Codex / DocBot 三个工位同步亮起
0:15  从 OrderNode 派出 3 条蓝色血脉连线到三个工位
0:18  第一个 ArtifactTile 落下（README.md）→ 时间线 DocBot 泳道亮绿
0:22  Codex 工位弹出 ColorPickerGrid 12 个候选色
0:24  用户点 #0066FF → Codex 工位继续跑
0:28  HTML / CSS 两个 ArtifactTile 相继落下
0:30  右键全选三个工件 → "合并预览"
0:32  MergeNode 自动出现 → 弹出全屏预览 iframe
0:38  ⌘K → 输入 "deploy" → 选中刚才的 webpage 工件
0:40  DeployCard 落到画布右下角 → 进度条走完 → 公网 URL 出现
0:48  点击"复盘"按钮 → 整个画布动画压缩回放
0:52  Replay 结束 → 弹出 "沉淀为 Skill" 卡片
0:55  确认 → Skill 入库
```

**全程键盘输入只有 1 次（订单文本），其余全是画布操作 + 点选。**

---

## 6. 第三支柱：Demo 加分特效

按时间预算从必做到可选叠加。

### 6.1 Live Telemetry（必做）

工位卡顶部一条横向条形图：
- 高度：token/秒（实时计算 SSE chunk 速率）
- 颜色：思考门限（绿/黄/红）
- 闪烁：连续错误 / API 限流时

**评委视觉冲击**：3 个工位同时活动时，3 条条形图各自跳动，"团队在干活"扑面而来。

### 6.2 PMO Replay（强烈推荐）

任务完成后画布右上角出现"复盘"按钮。点击：
- 整个协作过程压缩回放为 15 秒动画
- 每一个 chunk 事件按时间顺序触发，订单出现 → 工位亮起 → 工件落下 → 连线绘制
- 配合 PMO 旁白字幕："0:05 接到订单 → 0:12 派给 3 个工位 → 0:30 全部完成"

**技术实现**：所有 chunk 事件已经持久化在 `messages` 表，按 createdAt 排序后用 requestAnimationFrame 加速回放即可。

### 6.3 Skill Snap（强烈推荐）

复盘结束弹出 SkillSnapCard：
- 把当前画布的拓扑（Order → Workstation 链 → Artifact）保存为 Skill 模板
- Skill 的 `trigger` 字段用 LLM 总结订单意图
- 下次相似订单进入 → PMO 自动召回该 Skill → "我记得上次这样做过..."

这是把 SPEC/RULES/Skills 三件套从文档升级为 **画布上的活体**。

### 6.4 Live Cursor Trails（时间允许时）

PMO 调度时在画布上画"调度光标"——一道光带从 PMO 工位飞到目标工位，再延伸到产物落点。每次派单都有可见的"任务流动"动效。

---

## 7. 技术架构

### 7.1 依赖选型

| 包 | 版本 | 用途 | 大小（gzipped） |
|----|------|------|----------------|
| `@xyflow/react` | ^12.x | 画布引擎（节点/边/缩放/选区/MiniMap） | ~50KB |
| `dagre` | ^0.8 | 自动布局算法（生成 DAG 时落点） | ~30KB |
| `framer-motion` | ^11.x | 思考流脉冲 / Replay 动画 | ~30KB |
| `zod` | ^3.x | GenUI catalog schema 校验（前后端共享） | ~12KB |

**选 @xyflow/react 而非 tldraw 的理由**：
- tldraw 是通用白板（含手绘/形状/文本），过重，且要全套主题改造
- @xyflow/react 专为 DAG/Flow 设计，节点 = React 组件，可完全继承现有飞书风格 Tailwind 样式
- 已被 LangGraph Studio / Dify / Flowise 等多个 Agent 工具采用，社区成熟

### 7.2 文件组织

```
agenthub-mvp/src/
├── canvas/                              [新增]
│   ├── CanvasView.tsx                   # 主容器，@xyflow/react 包装
│   ├── nodes/
│   │   ├── OrderNode.tsx                # 订单卡
│   │   ├── WorkstationNode.tsx          # 工位卡（含 telemetry + 思考流）
│   │   ├── ArtifactTileNode.tsx         # 工件瓷砖
│   │   ├── MergeNode.tsx                # 合并/对比节点
│   │   └── GenUiNode.tsx                # 生成式 UI 占位节点（包裹 Renderer）
│   ├── edges/
│   │   └── LineageEdge.tsx              # 血脉连线（带动画）
│   ├── TimelineRail.tsx                 # 右侧时间线
│   ├── BenchWall.tsx                    # 左侧工位墙
│   ├── CommandBar.tsx                   # 底部命令栏
│   ├── CommandPalette.tsx               # ⌘K 命令面板
│   ├── ReplayDirector.tsx               # PMO Replay 动画引擎
│   ├── layout.ts                        # dagre 自动布局工具
│   └── canvasEvents.ts                  # 节点/边 → store 事件路由
│
├── genui/                               [新增]
│   ├── catalog.ts                       # Catalog 定义 + Zod Schema
│   ├── Renderer.tsx                     # 根据 catalog 渲染对应组件
│   ├── components/
│   │   ├── ChoiceCards.tsx
│   │   ├── ColorPickerGrid.tsx
│   │   ├── SliderRange.tsx
│   │   └── ConfirmCard.tsx
│   ├── parseUiFence.ts                  # 从文本流抽取 ```ui ... ``` 围栏
│   └── handlers.ts                      # 用户操作 → POST /api/agents/ui-input
│
├── store/
│   ├── appStore.ts                      [修改] 新增 workstation/genui slice
│   └── canvasStore.ts                   [新增] 节点/边/视口/选区
│
├── components/                          [完全保留] Classic 模式资产
│   ├── ChatWindow.tsx
│   ├── ConversationList.tsx
│   ├── ArtifactPanel.tsx
│   ├── DeployCard.tsx
│   ├── PlanCard.tsx
│   └── ...其他
│
├── TopBar.tsx                           [新增] 视图切换 + 全局命令
├── ClassicIMView.tsx                    [新增] 包裹原三栏布局
├── types.ts                             [修改] 新增 ui-component / WorkstationStatus 等类型
└── App.tsx                              [重构] 顶层视图路由

server/src/
├── services/
│   ├── genuiCatalog.ts                  [新增] 后端 catalog 描述 + 验证
│   ├── llmGateway.ts                    [修改] 注入 catalog 到 system prompt
│   └── plannerService.ts                [修改] 支持 ui-component chunk + ui-input 唤醒
│
└── routes/
    └── agents.ts                        [修改] SSE 流支持 ui-component 类型；POST /ui-input 新接口
```

**新增/修改文件统计**：
- 前端新增 ~18 个文件，修改 ~5 个文件
- 后端新增 1 个文件，修改 3 个文件
- 不删除任何文件

### 7.3 数据流（关键变更）

```
                   ┌────────────────────────────┐
                   │      用户事件源              │
                   │  (输入框/⌘K/拖拽/右键)      │
                   └────────────┬───────────────┘
                                │
                   ┌────────────▼───────────────┐
                   │     canvasEvents.ts         │
                   │  路由到 store action        │
                   └────────────┬───────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
       本地状态更新       触发 PMO 流程       触发 GenUI 渲染
       canvasStore         appStore           genui Renderer
                                │
                                ▼
                        POST /api/agents/chat (SSE)
                                │
                ┌───────────────┴───────────────┐
                │       Agent SSE chunks         │
                └───────────────┬───────────────┘
                                │
       ┌────────────┬──────────┼────────────┬──────────┐
       ▼            ▼          ▼            ▼          ▼
     text         code     artifact     ui-component  done
       │            │          │            │
       │            │          │            └──► parseUiFence
       │            │          │                  │
       │            │          │                  ▼
       │            │          │           Zod 校验通过？
       │            │          │              │     │
       │            │          │              ▼     ▼
       │            │          │            是    否（降级为 text）
       │            │          │              │
       │            │          │              ▼
       │            │          │      新增 GenUiNode 到画布
       │            │          │      状态：awaiting-input
       │            │          │              │
       │            │          │              ▼
       │            │          │      用户操作 → POST /ui-input
       │            │          │              │
       │            │          │              ▼
       │            │          │      后端注入 system message
       │            │          │              │
       │            │          │              ▼
       │            │          │      Agent 自动续跑
       │            │          │
       └────────────┴──────────┴─►  更新工位状态 / 创建工件 / 绘制连线
```

### 7.4 状态管理切片设计

#### canvasStore.ts（新增）
```typescript
interface CanvasState {
  nodes: Node[];                  // @xyflow/react Node 类型
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  selectedIds: ID[];

  // actions
  addNode(node: Node): void;
  updateNode(id: ID, patch: Partial<Node>): void;
  removeNode(id: ID): void;
  addEdge(edge: Edge): void;
  // ...
}
```

#### appStore.ts（增量切片）
```typescript
interface WorkstationSlice {
  workstationsByConv: Record<ID, Record<AgentId, WorkstationState>>;
  updateWorkstation(convId: ID, agentId: AgentId, patch: Partial<WorkstationState>): void;
  pushThinkingFrame(convId: ID, agentId: AgentId, frame: ThinkingFrame): void;
  updateTelemetry(convId: ID, agentId: AgentId, telemetry: Telemetry): void;
}

interface GenUiSlice {
  pendingByComponent: Record<ID, { conversationId: ID; agentId: AgentId; chunk: UiComponentChunk }>;
  submitUiInput(componentId: ID, value: unknown): Promise<void>;
}
```

### 7.5 数据库层（仅最小改动）

`messages.content` 字段已经是 `JSONB`，可直接存 `{ kind: 'ui-component', ... }`，无需 schema 变更。

新增可选表（v2 演进时再加，PoC 阶段不强求）：
```sql
-- Skill Snap 用，把画布拓扑保存为可复用模板
CREATE TABLE skill_topology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  topology JSONB NOT NULL,   -- { nodes: [...], edges: [...] }
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. 实施路径（5 天 PoC）

### Day 1 · Canvas 视图骨架

**目标**：切到 Canvas 模式能看到 mock 数据组成的静态画布。

| 任务 | 文件 | 验收 |
|------|------|------|
| 引入 `@xyflow/react` + `dagre` | `agenthub-mvp/package.json` | npm install 成功 |
| 重构 App.tsx 顶层路由 | `App.tsx` / `TopBar.tsx` / `ClassicIMView.tsx` | 切换按钮可用，无白屏 |
| Canvas 主容器骨架 | `canvas/CanvasView.tsx` | ReactFlow + Background + MiniMap 显示 |
| 三种 Node + 一种 Edge 静态 mock | `canvas/nodes/*.tsx` `canvas/edges/*.tsx` | 画布上看到 1 个 Order + 3 个 Workstation + 3 个 Artifact + 连线 |
| canvasStore | `store/canvasStore.ts` | 增删改节点 action 单测 |

**Deliverable**：能在 dev server 看到 Canvas mock 画面。

### Day 2 · 工位实时状态 + 真实 Agent 连通

**目标**：发一条消息，Canvas 上 Agent 工位真的"活起来"。

| 任务 | 文件 | 验收 |
|------|------|------|
| WorkstationNode 完整版（状态条/思考流/telemetry） | `canvas/nodes/WorkstationNode.tsx` | hover 可见思考流 |
| WS chunk → workstation slice 路由 | `store/appStore.ts` `hooks/useAgentHubWS.ts` | 收到 text chunk 工位脉冲 |
| chunk → 自动创建 ArtifactTileNode | `canvas/canvasEvents.ts` | artifact-draft 落工件 |
| 血脉连线自动绘制 | `canvas/edges/LineageEdge.tsx` | Order→Agent→Artifact 三段连线 |
| dagre 自动布局 | `canvas/layout.ts` | 新节点不重叠 |

**Deliverable**：从 OrderNode 输入框发 prompt，工位真的脉冲、工件真的落下。

### Day 3 · 完整画布交互 + 命令面板

**目标**：Canvas 模式可完整跑完 v1.1 现有的 PMO 协作流。

| 任务 | 文件 | 验收 |
|------|------|------|
| OrderNode 输入框 + 提交 | `canvas/nodes/OrderNode.tsx` `canvas/CommandBar.tsx` | 文本回车产单 |
| ArtifactTile 双击全屏（复用 Monaco/iframe） | `canvas/nodes/ArtifactTileNode.tsx` | 工件全屏可编辑 |
| 拖拽工件到工位 = @Agent | `canvas/canvasEvents.ts` | 拖拽触发 chat API + 工位高亮 |
| MergeNode + 拖入对比 | `canvas/nodes/MergeNode.tsx` | 两工件拖入 → DiffCard |
| CommandPalette ⌘K | `canvas/CommandPalette.tsx` | 全局搜索 + slash 命令 |
| `/deploy` 复用现有 Vercel 链路 | `canvas/canvasEvents.ts` | 部署进度可见 |

**Deliverable**：不用 Classic IM 也能跑完一次完整协作（含部署）。

### Day 4 · 生成式 UI 协议

**目标**：杀手镜头脚本（§5.6）可演完。

| 任务 | 文件 | 验收 |
|------|------|------|
| types.ts 加 ui-component chunk | `types.ts` + 后端同步 | 编译通过 |
| catalog + Zod schema | `genui/catalog.ts` `server/src/services/genuiCatalog.ts` | 单测覆盖 |
| 4 个 GenUI 组件 | `genui/components/*.tsx` | 独立可渲染 |
| parseUiFence 解析 | `genui/parseUiFence.ts` | 单测覆盖 5 种边界用例 |
| LLM prompt 注入 catalog | `server/src/services/llmGateway.ts` | 实际触发 ChoiceCards |
| POST /ui-input + Agent 唤醒 | `server/src/routes/agents.ts` `plannerService.ts` | 用户点选后 Agent 续跑 |
| GenUiNode 落画布 | `canvas/nodes/GenUiNode.tsx` | 画布上能交互 |

**Deliverable**：§5.6 脚本能完整演完，含 ChoiceCards / ColorPickerGrid 至少 2 次触发。

### Day 5 · 时间线 + Replay + Demo 打磨

**目标**：录 3 分钟 Demo 视频。

| 任务 | 文件 | 验收 |
|------|------|------|
| TimelineRail（per-Agent 泳道） | `canvas/TimelineRail.tsx` | 实时更新 |
| Telemetry 数据流 | `store/appStore.ts` `hooks/useAgentHubWS.ts` | token/s 数字跳 |
| PMO Replay 动画 | `canvas/ReplayDirector.tsx` | 15s 压缩回放可触发 |
| Skill Snap 卡片 | `genui/components/SkillSnapCard.tsx` | Replay 后弹卡 |
| Onboarding 引导 | `canvas/Onboarding.tsx` | 首次打开有 30s 引导 |
| Demo 视频录制 | OBS / 剪映 | 3min 含 7 个分镜 |

**Deliverable**：可交付的 Demo 视频。

### 时间不足时的削减优先级（由易割舍到核心）

1. ✂️ Onboarding 引导（可省）
2. ✂️ Live Cursor Trails（可省）
3. ✂️ Skill Snap 持久化（可只演弹卡）
4. ✂️ Live Telemetry token/s 计算改为模拟（可，不影响视觉）
5. ⚠️ PMO Replay 必保（这是最大记忆点之一）
6. ⚠️ GenUI ChoiceCards + ColorPickerGrid 至少 2 个必保
7. ❌ Canvas 主视图 + 工位脉动 + 派生连线（绝不削减，否则全方案失效）

---

## 9. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| `@xyflow/react` 大量节点性能 | 中 | 卡顿 | React.memo + 远距节点 LOD + minimap 替代 |
| LLM 输出非 catalog 组件 / Schema 不匹配 | 高 | GenUI 失败 | Zod 强校验；不匹配降级为 text 显示；prompt 中明示"不在 catalog 中的会被忽略" |
| LLM 总是不主动输出 GenUI（保守倾向） | 中 | 杀手镜头演不出 | 关键词触发兜底（如 "风格 / 配色 / 确认" 强制 PMO 加 GenUI）；Demo 用固定 prompt |
| 视图切换时状态错乱 | 低 | UI 卡 | 单一 appStore，切换仅渲染层；切换前后 selectors 复用 |
| Canvas 学习成本 | 中 | 评委困惑 | 首次进入 30s 引导动画；Classic IM 兜底 |
| 5 天工期估计过于乐观 | 中 | Demo 不完整 | Day 5 当天有"削减优先级"明示，可砍掉非核心特效 |
| DeepSeek 上调试 GenUI 协议不稳 | 中 | 协议失败 | 先用 mock-LLM 验证 catalog 协议；DeepSeek 上限制只用 4 个组件 + 给充分 example |
| `dagre` 布局把工件挤到画布外 | 低 | 用户找不到节点 | 落点超出视口时自动 fitView |
| 工件连线视觉混乱（>10 节点） | 中 | 看不清 | dagre 自动布局 + 用户可手动调整 + MiniMap + 缩放至全图按钮 |

---

## 10. 与现有 v1.1 投资的关系

### 10.1 完整保留（不动）

| 资产 | 角色 |
|------|------|
| `agenthub-mvp/src/components/*` | Classic IM 模式渲染层 |
| `agenthub-mvp/src/agents/*` | Agent 适配器（无变化）|
| `agenthub-mvp/src/orchestrator/*` | PMO Planner / Scheduler / Aggregator |
| `agenthub-mvp/src/api/*` | API 客户端（仅扩展 /ui-input 一个端点）|
| `agenthub-mvp/src/hooks/*` | useAgentHubWS 等 hook |
| `server/src/routes/*` | 全部 REST 路由（agents.ts 仅扩展） |
| `server/src/services/*` | LLM Gateway / Planner / Vercel 部署 |
| `server/src/db/*` | Schema / migrations |
| 58 个测试用例 | 继续运行 |

### 10.2 轻度修改（增量改动）

| 文件 | 改动量 | 改动 |
|------|--------|------|
| `App.tsx` | ~30 行 | 视图切换路由 |
| `types.ts` (前后端) | ~50 行 | ui-component / WorkstationStatus 等类型 |
| `store/appStore.ts` | ~80 行 | workstation/genui 切片 |
| `server/src/services/llmGateway.ts` | ~30 行 | catalog 注入 system prompt |
| `server/src/services/plannerService.ts` | ~40 行 | 支持 ui-component awaitsInput 状态机 |
| `server/src/routes/agents.ts` | ~60 行 | SSE 流新类型 + POST /ui-input |

### 10.3 纯新增

- 前端 `canvas/`、`genui/`、`store/canvasStore.ts` 共 ~18 个新文件
- 后端 `services/genuiCatalog.ts` 1 个新文件

### 10.4 复用价值

- **PMO 编排链路**完整复用——画布只是新的可视化层
- **Agent 适配器**完整复用——SSE chunk 流增加新 type 即可
- **Vercel 部署**完整复用——画布 `/deploy` 触发与现在等价
- **Monaco/iframe 沙箱**复用作为 ArtifactTile 双击的全屏视图

---

## 11. 评委视角自检

### 11.1 评分维度对齐

| 维度 | 权重 | 对应策略 |
|------|------|----------|
| **AI 协作能力** | 30% | Skill Snap 自动从画布拓扑沉淀 / PMO Replay 把协作过程产品化 / catalog 协议本身是 AI 协作的产物 |
| **功能完整度** | 25% | Canvas + GenUI + Classic IM 三档体验都跑通；现有 IM 全功能不丢 |
| **生成效果质量** | 20% | 工位脉动 + 派生连线 + Replay 动画 → 视觉冲击远超飞书风 IM |
| **代码理解度** | 15% | 协议层（chunk 新类型 + catalog + Zod 校验）有完整架构故事 |
| **创新与产品感** | 10% | "数字车间"隐喻 + A2UI catalog + Replay + Skill Snap → 4 层创新 |

### 11.2 评委的"记忆点"清单

1. **画面记忆**：3 个 Agent 工位同时跳动，3 个工件沿血脉连线长出（市面无对应）
2. **协议记忆**：Agent 主动产出可点选的组件（ChoiceCards/ColorPickerGrid），用户零打字
3. **回放记忆**：5 分钟协作压缩为 15 秒动画的 PMO Replay
4. **产品哲学记忆**：Skill 不再是文档，是画布上的活体拓扑

### 11.3 答辩可能被问到的问题与答案

> **Q：为什么不用 LangGraph Studio 那套？**
> A：LangGraph UI 是开发者面向工具，需要懂 StateGraph 概念。我们的"数字车间"隐喻让最终用户秒懂，没有学习曲线。

> **Q：GenUI 安全性怎么保证？**
> A：Catalog 受限 + Zod 强校验。前端只渲染白名单组件，LLM 输出非 catalog 组件直接降级为文本。这是 A2UI 协议的核心安全原则。

> **Q：Canvas 学习成本会不会比 IM 高？**
> A：会有 30s onboarding 引导覆盖。同时 Classic IM 模式完整保留，用户可一键切回。

> **Q：5 天 PoC 能 Cover 这么多？**
> A：所有数据流复用现有 v1.1 后端，仅渲染层重构。文件清单见 §7.2。

---

## 12. 附录

### 12.1 关键接口契约

#### Workstation 状态机
```
idle → thinking → producing → done
                ↘
                  awaiting-input ──[用户操作]──> producing → done
                ↘
                  error → idle (自动重试) | done (用户取消)
```

#### GenUI 时序图
```
Agent A         前端                后端
  │                │                  │
  │── text chunk ──┼─────────────────► │
  │── ```ui...```─┼────parseUiFence──►│
  │                │                  ├── Zod 校验
  │                │◄─ ui-component ──┤
  │                ├─ 落 GenUiNode ──►│
  │                │                  │
  │                │   [用户点选]      │
  │                ├─ POST /ui-input ►│
  │                │                  ├── 注入 system message
  │                │◄─ 200 OK ─────── ┤
  │                │                  │
  │◄── 唤醒 ──────┼──────────────────┤
  │── continue ────┼─────────────────►│
  │── artifact ────┼─────────────────►│
  │── done ────────┼─────────────────►│
```

### 12.2 推荐的 Canvas Onboarding 文案（首次进入）

> 欢迎来到 AgentHub 数字车间。
>
> 这里是你和 AI 工位们的协作空间。
> 中央是画布，左边是工位墙，右边是时间线。
>
> 三步上手：
>   1. 在画布上点右键 → 新订单，或在底部输入需求。
>   2. PMO 接单后，工位会自动亮起开始工作。
>   3. 工件落到画布上时，双击即可全屏预览或修改。
>
> 觉得复杂？右上角切回 Classic IM 模式。

### 12.3 命令面板（⌘K）支持的命令清单

| 命令 | 作用 |
|------|------|
| `new order` / `o:订单文本` | 创建新订单 |
| `find agent:XXX` | 搜索并跳转到工位 |
| `find artifact:XXX` | 搜索并跳转到工件 |
| `replay` | 触发 PMO Replay |
| `deploy:artifactId` | 部署指定工件 |
| `switch classic` | 切换到 Classic IM 视图 |
| `pin: messageId` | Pin 关键消息 |
| `skill: skillName` | 搜索 Skill |
| `/spec` `/plan` `/deploy` `/new-agent` | 复用 Slash 命令 |

### 12.4 参考文献

- [Beyond the Chat Wall: Agentic Interfaces (2026)](https://insights.theinteractive.studio/beyond-the-chat-agentic-interfaces-inside-your-product)
- [A2UI Protocol — Agent-Driven Interfaces (2026)](https://dev.to/czmilo/the-a2ui-protocol-a-2026-complete-guide-to-agent-driven-interfaces-2l3c)
- [AG-UI Protocol (CopilotKit, 2025)](https://github.com/CopilotKit/open-multi-agent-canvas)
- [Figma Agents on Multiplayer Canvas (2026)](https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/)
- [tldraw Accidental AI Canvas (Latent Space, 2025)](https://www.latent.space/p/tldraw)
- [Manus / Devin Limitations Review (2026)](https://www.idlen.io/blog/devin-ai-engineer-review-limits-2026/)
- [Agentic Visualization Design Patterns (arXiv 2505.19101)](https://arxiv.org/pdf/2505.19101)
- [DAG-Style AI Agents: Turning Chat Into Workflows](https://securitysenses.com/posts/dagstyle-agents-finish-jobs)
- [Microsoft AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [React Flow / @xyflow/react Docs](https://reactflow.dev/)

### 12.5 与 AgentHub_Imp.md v2.0 的关系

`AgentHub_Imp.md` 是 v1.1 工程的实施方案（已 W4 完整交付）。
本文档 `AgentHub-New-Imp.md` 是 v2.0 的"番外设计"——围绕评委体感重塑核心交互。

两份方案并不冲突：
- v1.1 后端 / 适配器 / 编排器 / 数据库 全部继承
- v1.1 三栏 IM 作为 Classic 模式保留
- v2.0 在视觉层和协议层做颠覆，工程层做最小侵入扩展

> **🤖 本文档基于 v1.1 W4 已完成工程，结合 2026 行业前沿调研，重塑核心交互范式。落地形式：5 天 PoC 验证、3 分钟 Demo 视频、答辩可演示。**
>
> **下一步**：本设计评审通过后，按 §8 实施路径启动 PoC，逐日交付。
