# Phase 2: AgentHub-V2—BackendServices 开发规范

## 模块职责
后端增量服务 — GenUI catalog 验证、LLM prompt 注入（catalog 使用说明）、planner 状态机扩展（ui-component + awaitingInput）、agents 路由扩展（SSE + POST /ui-input）。
**依赖**: AgentHub-V2—SharedTypes（Zod Schema）

**重要**: 此模块输出"补丁函数"，需要手动应用到 server/ 目录。不直接修改 server/ 文件。

## 需创建的文件

### 1. `src/genuiCatalog.ts` — 后端 GenUI Catalog 服务
```
功能:
- 从 SharedTypes re-export Zod schemas
- 导出 LLM prompt injection 文本（catalog 使用说明）
- 导出验证函数

导出:
- CatalogSchemaMap (re-export from SharedTypes)
- validateCatalogProps / validateCatalogValue (re-export)
- CATALOG_SYSTEM_PROMPT: string — 注入到 LLM system prompt 的文本

CATALOG_SYSTEM_PROMPT 内容:
"## 交互组件能力

你可以使用以下交互组件让用户做选择，避免反复打字。
当你不确定应该用什么方案时，主动产出组件比提问让用户回答体验更好。

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
  \"component\": \"ChoiceCards\",
  \"props\": {
    \"title\": \"你想要哪种博客风格？\",
    \"options\": [
      {\"id\": \"minimal\", \"label\": \"极简\", \"preview\": \"🎯\"},
      {\"id\": \"glass\",   \"label\": \"玻璃风\", \"preview\": \"🪟\"},
      {\"id\": \"brutal\",  \"label\": \"野蛮主义\", \"preview\": \"🧱\"},
      {\"id\": \"warm\",    \"label\": \"暖色文艺\", \"preview\": \"🌅\"}
    ]
  }
}
```

收到 ```ui``` 围栏后：
1. 你的本轮回答应该结束（不再继续输出文本/代码）
2. 系统会暂停你的执行，等待用户操作
3. 用户操作后你会被自动唤醒，并在 system message 中收到用户的选择
4. 此时再继续完成原本的任务"

### 2. `src/llmGateway.ts` — LLM Gateway 补丁
```
功能:
- 提供补丁函数: patchSystemPrompt(originalSystemPrompt: string): string
- 将 CATALOG_SYSTEM_PROMPT 追加到 system prompt 末尾

导出:
- patchSystemPrompt(systemPrompt: string): string
  → 返回 systemPrompt + '\n\n' + CATALOG_SYSTEM_PROMPT
```

### 3. `src/plannerService.ts` — Planner 状态机补丁
```
功能:
- 处理 ui-component chunk 的解析和状态管理
- 处理 ui-input 后 Agent 唤醒

导出:
- parseAgentChunkForGenUI(chunk: any): { isGenUI: boolean; component?: string; props?: any; error?: string }
  → 检测 chunk 中是否包含 ```ui...``` 围栏
  → 使用 parseUiFence 逻辑（从 GenUI 模块复用概念，但后端独立实现）
  → 是 GenUI → 返回 { isGenUI: true, component, props }
  → 不是 GenUI → 返回 { isGenUI: false }

- createWakeupMessage(componentId: string, value: unknown): { role: 'system'; content: string }
  → 生成唤醒 Agent 用的 system message
  → content: "用户已对组件 {componentId} 做出选择: {JSON.stringify(value)}。请继续完成未完成的任务。"
```

### 4. `src/routes-agents.ts` — Agents 路由补丁
```
功能:
- POST /api/agents/ui-input 的 handler 逻辑

导出:
- uiInputHandler(body: { conversationId: string; componentId: string; value: unknown }): Promise<{ success: boolean }>
  → 1. 验证 body 参数
  → 2. 查找对应 conversation
  → 3. 调用 createWakeupMessage 生成 system message
  → 4. 将 system message 插入 conversation history (写入数据库 messages 表)
  → 5. 找到之前 awaitsInput 的 Agent，触发续跑 (调用 chatWithAgent)
  → 6. 返回 { success: true }

伪代码:
async function uiInputHandler(body) {
  // 1. Validate
  if (!body.conversationId || !body.componentId || body.value === undefined) {
    throw new Error('Missing required fields');
  }
  
  // 2. Find conversation
  // const conv = await db.getConversation(body.conversationId);
  
  // 3. Create wakeup message
  const wakeupMsg = createWakeupMessage(body.componentId, body.value);
  
  // 4. Insert into history
  // await db.insertMessage(body.conversationId, { senderType: 'system', content: wakeupMsg });
  
  // 5. Resume agent
  // const lastAwaitingAgent = findLastAwaitingInputAgent(body.conversationId);
  // await chatWithAgent(lastAwaitingAgent, { conversation, history: updatedHistory, resumeFromAwaitingInput: true });
  
  return { success: true };
}
```

### 5. `src/index.ts` — Barrel Export
导出所有函数和常量

### 6. `__tests__/genuiCatalog.test.ts` — Catalog 服务测试
- CATALOG_SYSTEM_PROMPT 非空字符串
- CATALOG_SYSTEM_PROMPT 包含 4 个组件名 (ChoiceCards, ColorPickerGrid, SliderRange, ConfirmCard)
- patchSystemPrompt 正确追加
- patchSystemPrompt 保留原始 prompt 内容

### 7. `__tests__/plannerService.test.ts` — Planner 补丁测试
- parseAgentChunkForGenUI: text delta → isGenUI=false
- parseAgentChunkForGenUI: ui fence chunk → isGenUI=true
- createWakeupMessage: 生成正确的 system message 格式
- createWakeupMessage: value 被正确 JSON stringify

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx vitest run AgentHub-V2—BackendServices
```
