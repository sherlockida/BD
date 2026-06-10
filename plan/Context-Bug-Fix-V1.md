# Context-Bug-Fix-V1 — 产物上下文传递 & 历史记录持久化修复方案

> **版本**: v2.1 | **日期**: 2026-06-10 | **状态**: 待确认
> **修复范围**: Bug#1 产物选择修改上下文丢失 + Bug#2 Agent/编排消息未持久化

---

## 一、Bug 根因分析

### Bug #1: 框选代码提交给 Agent 修改 — 完整上下文丢失

**用户操作路径**:
1. 在产物面板 Code Tab 中框选一段代码
2. 在 SelectionRail 输入修改指令（如"把这个按钮改成绿色"）
3. 点击"发送到聊天"

**当前实现** (`ArtifactPanel.tsx:683-691`):

```typescript
const selectionBlock = hasSelection
  ? `\n\n选区内容（来自 v${version.version}）:\n\`\`\`\n${trimmedSelection.slice(0, 800)}\n\`\`\`\n`
  : '\n\n（未选中具体片段，请基于整份产物理解）\n';
const text = `@${a?.name} 针对产物 \`${artifact.name}\` ${selectionBlock}\n指令：${instruction}`;
onSend(text);
```

**根因**:

| 问题 | 细节 |
|------|------|
| **只发 800 字符** | `trimmedSelection.slice(0, 800)` — Agent 看不到完整文件 |
| **丢失产物身份** | Agent 不知道这是哪个 artifact，无法生成同名产物触发 diff |
| **丢失完整文件** | 选区之外的内容完全不传，Agent 无法理解上下文 |
| **丢失版本信息** | Agent 不知道当前是 v1/v2/v3，无法生成正确的下一版本 |
| **丢失语言信息** | Agent 不知道文件类型（html/css/js），可能用错语法 |

**期望行为**:
1. 发送完整产物内容 + 选区标记 + 用户指令 → Agent
2. Agent 理解上下文 → 输出修改后的完整文件
3. `fenceExtractor` 解析同名 artifact → 触发 v2 → DiffEditor 自动显示 diff

---

### Bug #2: 数据库缺失 Agent 输出记录 — 刷新后只剩用户消息

**当前持久化调用点** (`appStore.ts`):

```
apiPostMessage 调用位置:
  ├─ sendUserMessage (line 399)      ✅ 用户消息 — 始终持久化
  ├─ runSingleAgent final (line 1070) ⚠️  仅 text 类型, 仅在单 Agent 流程
  └─ runOrchestrated                 ❌ 永不调用 — 全部丢失
```

**丢失的消息类型**:

| 消息类型 | 产生位置 | 持久化 | 刷新后 |
|----------|---------|--------|--------|
| 用户消息 | `sendUserMessage` | ✅ | 保留 |
| 单Agent文本回复 | `runSingleAgent` | ⚠️ 部分 | 可能保留 |
| 单Agent代码/产物/diff | `runSingleAgent` | ❌ | 丢失 |
| PMO Plan Card | `runOrchestrated` | ❌ | 丢失 |
| 编排Agent任务消息 | `runOrchestrated` onTaskStart | ❌ | 丢失 |
| 编排Agent流式输出 | `runOrchestrated` onTaskChunk | ❌ | 丢失 |
| 系统通知(降级/暂停) | `runOrchestrated` onFallback/onUiPause | ❌ | 丢失 |
| PMO 周报 | `runOrchestrated` | ❌ | 丢失 |
| Blackboard 快照 | `runOrchestrated` | ❌ | 丢失 |

**根因**: 持久化只在两处调用，编排流程完全未接入。非 text 类型的 Agent 输出也未持久化。

---

## 二、解决方案设计

### 2.1 Bug #1: Artifact-Aware 上下文传递

#### 核心思路：把"选区+指令"提升为"完整产物+选区标记+指令"的结构化上下文

```
当前:  用户消息文本 = "@Codex 针对产物 index.html\n选区内容:```<div>...```\n指令：改成绿色"
        ↓ Agent 只看到 800 字符片段

修复后: 用户消息文本 = "@Codex 修改产物 index.html\n指令：把按钮改成绿色"
        + AgentInput.contextArtifacts = [{ name: "index.html", 完整内容, 选区位置 }]
        ↓ Agent 看到完整文件 + 选区标记 + 指令
```

#### 具体改动

**A. SelectionRail → sendUserMessage 路径**

`ArtifactPanel.tsx:683-691` 改动：
- 不再把选区内容嵌入消息文本（避免 800 字符截断）
- 改为传递 `attachedArtifactIds` + 选区元数据：

```typescript
// 新: 结构化传递
onSend({
  text: `@${a?.name} 修改产物 \`${artifact.name}\`\n指令：${instruction}`,
  attachedArtifactIds: [artifact.id],
  selectionContext: {
    artifactId: artifact.id,
    versionId: version.id,
    selectedRange: { start: selectionStart, end: selectionEnd },  // Monaco 选区位置
    selectedText: trimmedSelection,
  },
});
```

**B. sendUserMessage 扩展**

`appStore.ts:sendUserMessage` 签名扩展 — 新增可选参数：
```typescript
sendUserMessage(convId, text, mentions, replyToMessageId, attachedArtifactIds?, selectionContext?)
```

当 `attachedArtifactIds` 存在时，把完整 artifact 内容注入到 Agent 上下文：
```typescript
if (attachedArtifactIds?.length) {
  const fullArtifacts = attachedArtifactIds
    .map(id => get().artifacts.find(a => a.id === id))
    .filter(Boolean);
  // 注入到 AgentInput.contextArtifacts
  // 如果存在 selectionContext，在内容中标记选区位置
}
```

**C. Agent 上下文注入增强**

`remoteAgent.ts:chat()` — 当 `input.contextArtifacts` 存在时：
```typescript
let enhancedPrompt = input.userPrompt;
if (input.contextArtifacts?.length) {
  for (const art of input.contextArtifacts) {
    const latest = art.versions.reduce((a, b) => a.version > b.version ? a : b);
    enhancedPrompt += `\n\n## 产物: ${art.name} (${art.type})\n\`\`\`${art.language ?? ''}\n${latest.content}\n\`\`\``;
  }
}
```

**D. 选区标记机制**

在 Agent 的 system prompt 中注入选区位置：
```
用户已在源码中框选了以下区域，请重点修改此处:
  产物: index.html
  选区: 第 45-52 行 (或 字符偏移 1200-1450)
  内容: "<button class="btn-primary">提交</button>"

请输出完整文件，不要只输出修改的部分。
```

**E. Diff 自动触发**

已通过 Phase 4 的 `mergeArtifacts()` 和 `fenceExtractor` 的 `nextName()` 实现：
- 当 Agent 输出同名 artifact（如 `index.html`），自动创建 v2
- 产物面板自动显示 v1→v2 diff

只需确保 SelectionRail 传递的 `artifact.name` 正确匹配 `fenceExtractor` 的命名。

---

### 2.2 Bug #2: 全链路消息持久化

#### 核心思路：统一持久化门面 — 所有消息创建路径都自动持久化

```
设计原则:
  1. 单一真相源 — addMsg() 同时写 Zustand + 触发 DB 持久化
  2. 火后不理 — 持久化失败不阻塞 UI（catch + console.warn）
  3. 渐进兼容 — 先在 addMsg 内部调用 apiPostMessage，不修改现有调用点
  4. 去重保护 — 客户端生成的 UUID 天然保证幂等（PG primary key）
```

#### 具体改动

**A. 统一持久化门面**

在 `appStore.ts` 中，将 `addMsg` 升级为自动持久化：

```typescript
const addMsg = (state: AppState, convId: ID, msg: Message): AppState => {
  // 火后不理：异步持久化到 DB
  if (msg.senderType !== 'system' || msg.content.kind === 'system') {
    // system 消息也持久化（降级通知、暂停提醒等）
    apiPostMessage(convId, {
      id: msg.id,
      senderType: msg.senderType,
      senderId: msg.senderId,
      content: msg.content,
      mentions: msg.mentions ?? [],
      replyToMessageId: msg.replyToMessageId,
    } as any).catch(err => console.warn('[persist] addMsg failed:', err.message));
  }

  // 原有逻辑不变
  const list = state.messagesByConv[convId] ?? [];
  return {
    ...state,
    messagesByConv: { ...state.messagesByConv, [convId]: [...list, msg] },
    conversations: state.conversations.map(c =>
      c.id === convId ? { ...c, lastActivityAt: msg.createdAt } : c,
    ),
  };
};
```

**B. 流式消息的延迟持久化**

流式消息（`streaming: true`）不在创建时持久化，而是在流结束时持久化最终内容：

```typescript
// 在 onTaskDone / patchMsg streaming=false 时触发持久化
function persistFinalMessage(msg: Message, convId: ID) {
  apiPostMessage(convId, {
    id: msg.id,
    senderType: msg.senderType,
    senderId: msg.senderId,
    content: msg.content,
    mentions: msg.mentions ?? [],
    replyToMessageId: msg.replyToMessageId,
  } as any).catch(err => console.warn('[persist] final message failed:', err.message));
}
```

在 `patchMsg` 中检测 `streaming: false` 转换 → 触发持久化。

**C. 移除重复的持久化调用**

修改 `sendUserMessage` 和 `runSingleAgent` 中的手动 `apiPostMessage` 调用，因为 `addMsg` 已自动处理。

**D. hydrateFromBackend 补充**

当前 `hydrateFromBackend` 在服务端无数据时不会加载消息。需要：
1. 从服务端加载已有的 conversations + 它们的 messages
2. 恢复 Zustand 状态：conversations, messagesByConv, artifacts

```typescript
async hydrateFromBackend() {
  // ... 现有逻辑加载 conversations

  // 新增: 加载每个 conversation 的消息
  for (const conv of convs) {
    const { messages: serverMsgs } = await apiListMessages(conv.id, undefined, 200);
    if (serverMsgs?.length) {
      allMessages[conv.id] = serverMsgs.map(m => ({
        id: m.id,
        conversationId: m.conversationId,
        senderType: m.senderType as MessageSenderType,
        senderId: m.senderId,
        content: m.content as MessageContent,
        mentions: m.mentions ?? [],
        replyToMessageId: m.replyToMessageId,
        streaming: false,
        pinned: m.pinned ?? false,
        createdAt: typeof m.createdAt === 'string' ? new Date(m.createdAt).getTime() : m.createdAt,
      }));
    }
  }

  set({ messagesByConv: allMessages });
}
```

---

## 三、数据流图

### Bug #1 修复后流程

```
用户在 ArtifactPanel 框选代码 + 输入指令
  │
  ▼
SelectionRail.onSend({
  text: "@Codex 修改产物 index.html\n指令：按钮改成绿色",
  attachedArtifactIds: ["art_123"],
  selectionContext: { start: 1200, end: 1450, text: "<button>...</button>" }
})
  │
  ▼
sendUserMessage(convId, text, mentions, replyTo, attachedArtifactIds, selectionContext)
  │
  ├─→ addMsg(userMsg) → persist ✅
  │
  ├─→ runSingleAgent(convId, agentId, text)
  │     │
  │     ├─ 构建 AgentInput:
  │     │   userPrompt = 修改指令
  │     │   contextArtifacts = [完整 index.html 内容 + 选区标记]
  │     │   upstreamContext = "选区位置: 行 45-52, 偏移 1200-1450"
  │     │
  │     └─→ RemoteAgent.chat(input) → POST /api/agents/chat
  │           │
  │           ▼
  │         后端 LLM 收到: system prompt + 完整文件 + 选区标记 + 指令
  │           │
  │           ▼
  │         LLM 输出:
  │           ```html
  │           <!DOCTYPE html>
  │           ...（完整修改后的 index.html）
  │           ```
  │           │
  │           ▼
  │         fenceExtractor → artifact-draft { name: "index.html", content: "..." }
  │           │
  │           ▼
  │         handleChunkInto → 检测同名 artifact → 创建 v2 → diff card → 持久化 ✅
  │
  └─→ 产物面板自动显示 v1→v2 diff ✅
```

### Bug #2 修复后流程

```
任何消息创建路径:
  sendUserMessage     ─┐
  runSingleAgent      ─┤
  runOrchestrated     ─┼─→ addMsg(msg) ─→ Zustand 更新 + apiPostMessage(msg) ─→ DB
  onTaskStart/Chunk   ─┤
  onFallback          ─┤
  onUiPause/Resume    ─┤
  PMO Summary         ─┘

流式消息:
  addMsg({ streaming: true }) → 仅 Zustand（不持久化）
  patchMsg({ streaming: false }) → 检测状态切换 → 持久化最终内容
  handleChunkInto (artifact/diff/code card) → addMsg(完整消息) → 持久化 ✅

页面刷新:
  hydrateFromBackend() → apiListConversations + apiListMessages(每conv) → 恢复全部历史 ✅
```

---

## 四、实施步骤

### Step 1: Bug #1 修复（产物上下文传递）

| # | 文件 | 改动 | 大小 |
|---|------|------|------|
| 1.1 | `types.ts` | 新增 `SelectionContext` 接口 + `sendUserMessage` 参数扩展 | 小 |
| 1.2 | `ArtifactPanel.tsx` | `SelectionRail.onSend` 改为结构化传递（不再截断 800 字符） | 中 |
| 1.3 | `appStore.ts` | `sendUserMessage` 新增 `attachedArtifactIds` / `selectionContext` 参数 | 中 |
| 1.4 | `appStore.ts` | `runSingleAgent` + `runOrchestrated` 的 `AgentInput` 注入完整 artifact 内容 | 中 |
| 1.5 | `remoteAgent.ts` | `chat()` 将 `contextArtifacts` 拼入 user prompt | 小 |

### Step 2: Bug #2 修复（全链路持久化）

| # | 文件 | 改动 | 大小 |
|---|------|------|------|
| 2.1 | `appStore.ts` | `addMsg` 升级为自动持久化（火后不理） | 中 |
| 2.2 | `appStore.ts` | `patchMsg` 检测 `streaming: false` 触发最终内容持久化 | 小 |
| 2.3 | `appStore.ts` | 移除 `sendUserMessage` / `runSingleAgent` 中的手动 `apiPostMessage`（已由 addMsg 覆盖） | 小 |
| 2.4 | `appStore.ts` | `hydrateFromBackend` 补充消息加载逻辑 | 大 |
| 2.5 | `server/src/routes/messages.ts` | 确认 GET messages 端点正确处理所有 content kind（jsonb 原生支持，无需改动） | 验证 |

### Step 3: 集成验证

| # | 内容 |
|---|------|
| 3.1 | TypeScript 编译检查 |
| 3.2 | 现有 163 个测试全部通过 |
| 3.3 | 手动测试: 框选代码 → 提交修改 → 验证 diff 出现 |
| 3.4 | 手动测试: 发送消息 → 刷新页面 → 验证历史完整（含 Agent 消息 + Plan Card） |

---

## 五、风险与边界

| 风险 | 缓解 |
|------|------|
| `addMsg` 自动持久化导致大量 API 调用 | 已有 `catch` 保护，失败不阻塞 UI；可加防抖（但当前消息量不大） |
| 流式 chunk 频繁触发 `addMsg` → 大量持久化请求 | 流式消息创建时带 `streaming: true`，跳过持久化；只在最终 `streaming: false` 时持久化 |
| `hydrateFromBackend` 加载大量消息 | 已有 cursor 分页（默认 200 条），足够覆盖近期历史 |
| `contextArtifacts` 内容过大超出 token 限制 | 截断保护: 单文件最大 16000 字符，选区上下文最大 500 字符 |
| 与现有 `addMsg` 调用点冲突 | `addMsg` 签名不变，内部增强透明；所有 20+ 调用点无需修改 |

---

## 六、不做什么（明确边界）

- ❌ 不修改后端消息存储 schema — jsonb content 字段已支持所有 MessageContent 类型
- ❌ 不添加 WebSocket 实时同步 — 持久化走 REST，WS 仅用于在线通知
- ❌ 不修改 `patchMsg` 签名 — 通过检测 `streaming` 字段变化触发持久化
- ❌ 不实现离线队列 — 持久化失败不重试，页面刷新时从服务端恢复为准
- ❌ 不修改 artifact 持久化逻辑 — 已有独立路径（`apiCreateArtifact` / `apiAddArtifactVersion`），保持不变
