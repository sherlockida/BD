# Phase 0: AgentHub-V2—SharedTypes 开发规范

## 模块职责
所有 V2 模块共享的类型契约、AgentChunk 扩展、GenUI Catalog Zod Schema。
**此模块不依赖其他任何模块**，是最底层的基石。

## 需创建的文件 (6 个)

### 1. `AgentHub-V2—SharedTypes/src/types.ts`
完整的 V2 类型系统：

- 从 `../../agenthub-mvp/src/types` re-export 所有 v1.1 类型（ID, Agent, AgentCapability, AgentVendor, Conversation, ConversationType, Message, MessageSenderType, MessageContent, OrchestratorPlan, SubTask, SubTaskStatus, Artifact, ArtifactType, ArtifactVersion, DeployStatus, DiffPayload, DiffHunk, Skill, AgentInput, AgentChunk, IAgent）
- 新增类型：
  - `ViewMode = 'canvas' | 'classic'`
  - `OrderNodeData { orderId, intent, acceptedBy?, acceptedAt?, status: 'pending'|'planning'|'dispatched'|'done' }`
  - `WorkstationStatus = 'idle' | 'thinking' | 'producing' | 'awaiting-input' | 'done' | 'error'`
  - `ThinkingFrame { kind: 'read'|'decide'|'write', summary: string, timestamp: number }`
  - `Telemetry { tokensPerSec, inputTokensUsed, activeOrderId? }`
  - `WorkstationNodeData { agentId, meta: { id, name, avatarEmoji, avatarColor, vendor, capabilities[] }, status, thinkingStream[], telemetry }`
  - `ArtifactTileData { artifactId, versionId, type, name, thumbnail?, authorAgentId, derivedFrom?[], version }`
  - `CatalogComponentName = 'ChoiceCards' | 'ColorPickerGrid' | 'SliderRange' | 'ConfirmCard'`
  - `UiComponentChunk { type: 'ui-component', componentId, component: CatalogComponentName, props: Record<string,unknown>, awaitsInput: boolean }`
  - `UiInputPayload { componentId, value: unknown }`
  - `CanvasState { nodes[], edges[], viewport: {x,y,zoom}, selectedIds[] }`
  - `WorkstationSlice { workstationsByConv: Record<string, Record<string, WorkstationNodeData>> }`
  - `GenUiSlice { pendingByComponent: Record<string, { conversationId, agentId, chunk: UiComponentChunk }> }`
  - `ReplayEvent { timestamp, kind: 'order-created'|'agent-dispatched'|'artifact-dropped'|'edge-drawn'|'genui-shown', payload: Record<string,unknown> }`

Import 路径：用相对路径 `../../agenthub-mvp/src/types` 而非 `@legacy/types`（路径别名在模块独立编译时可能不生效）。

### 2. `AgentHub-V2—SharedTypes/src/chunkTypes.ts`
扩展 AgentChunk 类型 + 类型守卫：

- `AgentChunkV2 = LegacyChunk | UiComponentChunk | { type: 'ui-input', componentId: string, value: unknown }`
- 导出类型守卫函数：
  - `isUiComponent(chunk): chunk is UiComponentChunk`
  - `isTextChunk(chunk): chunk is { type: 'text', delta: string }`
  - `isArtifactDraft(chunk)`  
  - `isCodeChunk(chunk)`
  - `isDoneChunk(chunk)`
  - `isErrorChunk(chunk)`

### 3. `AgentHub-V2—SharedTypes/src/catalog.ts`
GenUI Catalog Zod Schema（4 个组件的 props + value schema）：

- **ChoiceCards**: props = `{ title: string, options: Array<{id, label, preview?, description?}>, min 2 max 6 }`, value = `{ chosenId: string }`
- **ColorPickerGrid**: props = `{ title: string, suggested: hexColor[] max 12, allowCustom: boolean default true }`, value = `{ hex: string regex /^#[0-9A-Fa-f]{6}$/ }`
- **SliderRange**: props = `{ title: string, min: number, max: number, step: number default 1, defaultValue?: number, unit?: string }`, value = `{ value: number }`
- **ConfirmCard**: props = `{ title: string, body: string, danger: boolean default false, confirmLabel default "确认", cancelLabel default "取消" }`, value = `{ confirmed: boolean }`
- `CatalogSchemaMap` = 上述 4 个组件的 schema 映射表
- `CatalogName = keyof typeof CatalogSchemaMap`
- `validateCatalogProps(name, props)` — 以 safeParse 校验 props
- `validateCatalogValue(name, value)` — 以 safeParse 校验 value

### 4. `AgentHub-V2—SharedTypes/src/index.ts`
Barrel export：从 types.ts、chunkTypes.ts、catalog.ts 全部 re-export。

### 5. `AgentHub-V2—SharedTypes/__tests__/types.test.ts`
测试类型守卫（每个守卫 2+ 用例）：
- isTextChunk 正例/反例
- isUiComponent 正例/反例
- isCodeChunk 正例/反例
- isArtifactDraft 正例/反例
- isDoneChunk 正例/反例
- isErrorChunk 正例/反例

### 6. `AgentHub-V2—SharedTypes/__tests__/catalog.test.ts`
测试 Zod Schema（每个组件 3-5 用例）：
- ChoiceCards: 合法 props 通过、<2 options 拒绝、>6 options 拒绝、缺 title 拒绝、合法 value 通过、错误类型 value 拒绝
- ColorPickerGrid: 合法 props、非法 hex 拒绝、>12 suggested 拒绝、合法 value、非法 hex value 拒绝
- SliderRange: 合法 props（含所有可选字段）、合法 value、非数字 value 拒绝
- ConfirmCard: 合法 props（含 danger 和默认值）、合法 value（true/false）、非 boolean value 拒绝
- 未知组件名返回 error

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx tsc --noEmit
npx vitest run AgentHub-V2—SharedTypes
```

## 关键约束
- 使用 vitest（describe/it/expect）
- import 从 `'vitest'`
- 类型守卫用 `chunk.type ===` 直接判断
- Zod schema 用 `safeParse` 返回 `{ success, data, error }`
- 所有文件完整可运行，无 TODO/占位符
