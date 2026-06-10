# LongTask-Bug-Fix-V1 — 多Agent长任务处理缺陷修复方案

> **版本**: v2.1 | **日期**: 2026-06-10 | **状态**: 待确认
> **基于**: 工作流调查发现的 7 个根因（A→G）
> **关联**: `Context-Bug-Fix-V1.md`（Bug A/B 是该方案 Bug #1 的遗留缺陷）

---

## 一、根因回顾

| ID | 严重度 | 位置 | 问题 |
|----|--------|------|------|
| **A** | 🔴 致命 | `ArtifactPanel.tsx:207` | `SelectionRail.onSend` 类型缺少 `mentions`，连接器填 `[]` |
| **B** | 🔴 致命 | `appStore.ts:450` | 路由误判：`mentions=[]` → PMO 编排代替单Agent直调 |
| **C** | 🔴 致命 | `appStore.ts:1109` | `runOrchestrated` 丢弃 `attachedArtifactIds` / `selectionContext` |
| **D** | 🔴 致命 | `fenceExtractor.ts:33` | 每个 `RemoteAgent.chat()` 独立 `usedNames` → 跨Agent同名冲突 → 版本激增 |
| **E** | 🟡 严重 | `fenceExtractor.ts:99` | `feed()` 围栏闭合路径无空内容保护 → 空白 artifact |
| **F** | 🟡 严重 | `remoteAgent.ts:112` | `catch` 块不调 `extractor.flush()` → 部分内容静默丢弃 |
| **G** | 🟡 中等 | `llmGateway.ts:286` | `max_tokens=4096` 过紧 → LLM 长输出被截断，围栏未闭合 |

**因果链**：
```
A → B → C → (Agent 丢失上下文，PMO 误编排)
               ↓
D → (6个Agent都输出同名 artifact → v6→v11 激增)
               ↓
E + F + G → (空内容 + 截断 + 未flush) → 空白预览 + "流意外结束"
```

---

## 二、修复方案

### Fix A+B: SelectionRail 路由修复

**文件**: `ArtifactPanel.tsx` + `appStore.ts`

**问题**: `SelectionRail.onSend` 类型没有 `mentions` 字段，连接器传 `[]`，导致路由永远走 PMO。

**方案**:

1. `ArtifactPanel.tsx:624` — `onSend` 回调类型新增 `mentions?: ID[]`：
   ```typescript
   onSend: (opts: {
     text: string;
     mentions?: ID[];
     attachedArtifactIds: ID[];
     selectionContext?: SelectionContext;
   }) => void;
   ```

2. `ArtifactPanel.tsx:687` — `onClick` 中传入 `mentions: [target]`：
   ```typescript
   onSend({
     text,
     mentions: [target],
     attachedArtifactIds: [artifact.id],
     selectionContext: hasSelection ? { ... } : undefined,
   });
   ```

3. `ArtifactPanel.tsx:207` — 连接器传递 `opts.mentions` 而非 `[]`：
   ```typescript
   onSend={(opts) => sendUser(conv.id, opts.text, opts.mentions ?? [], undefined,
     opts.attachedArtifactIds, opts.selectionContext)}
   ```

**验证**: 在群聊中从 SelectionRail 选 Agent 发修改请求 → 应走 `runSingleAgent` 而非 `runOrchestrated`。

---

### Fix C: runOrchestrated 上下文传递

**文件**: `appStore.ts`

**问题**: `runOrchestrated` 不接受 `attachedArtifactIds` / `selectionContext`，产物上下文在编排路径中丢失。

**方案**:

1. `runOrchestrated` 签名扩展：
   ```typescript
   async function runOrchestrated(
     get: GetState, set: SetState, convId: ID, userText: string,
     attachedArtifactIds?: ID[],
     selectionContext?: SelectionContext,
   ): Promise<void>
   ```

2. 在 `schedule()` 调用前，若 `attachedArtifactIds` 存在，将其注入 `context`：
   ```typescript
   // 构建上下文 artifacts
   let contextArtifacts: Artifact[] | undefined;
   if (attachedArtifactIds?.length) {
     contextArtifacts = attachedArtifactIds
       .map(id => get().artifacts.find(a => a.id === id))
       .filter((a): a is Artifact => !!a);
   }
   
   // 增强 plan.intent（注入选区标记）
   let enhancedIntent = userText;
   if (selectionContext) {
     enhancedIntent += `\n\n> 用户框选了产物 "${selectionContext.artifactId}" 中的以下区域:\n> "${selectionContext.selectedText.slice(0, 300)}"\n> 请重点修改此处，输出完整文件。`;
   }
   ```

3. 将 `contextArtifacts` 和增强后的 intent 传入 `schedule()` 的 context 参数，使每个 `AgentInput` 都能拿到。

4. `sendUserMessage` 调用点更新（line 450）：
   ```typescript
   await runOrchestrated(get, set, convId, text, attachedArtifactIds, selectionContext);
   ```

---

### Fix D: 跨 Agent 同名 artifact 去重

**文件**: `fenceExtractor.ts` + `appStore.ts`

**问题**: 每个 `RemoteAgent.chat()` 创建独立 `usedNames`，6 个 Agent 产出同名 `index.html`，版本从 v6 激增到 v11。

**方案（最小侵入）**: 在 `handleChunkInto` 中增加**同轮去重**逻辑。

`appStore.ts:handleChunkInto` 中 `artifact-draft` 处理分支：

```typescript
if (chunk.type === 'artifact-draft') {
  // Fix D: 同轮去重 — 同一 orchestration round 内，同名 artifact 只保留首个版本
  // 后续同名块来自不同 Agent 的独立输出，应合并而非追加版本
  const existing = get().artifacts.find(
    a => a.conversationId === convId && a.name === chunk.name
  );
  
  if (existing) {
    // 同一个 orchestration session 中，同名 artifact 已被创建
    // 检查是否来自同一轮（通过 artifact 创建时间判断：< 5 分钟内 = 同一轮）
    const isRecentDuplicate = Date.now() - existing.createdAt < 5 * 60 * 1000;
    if (isRecentDuplicate && existing.createdBy !== agentId) {
      // 不同 Agent 输出同名 artifact → 视为独立产物，用 -N 后缀区分
      // 而不是追加版本（避免 v6→v11 激增）
      const dedupName = `${chunk.name.replace(/\.\w+$/, '')}-${agentId.split('_').pop()}.${chunk.name.split('.').pop()}`;
      // 创建新 artifact 用去重名称
      chunk = { ...chunk, name: dedupName };
    }
  }
  // ... 后续版本创建逻辑不变
}
```

**备选方案（更彻底但改动更大）**: 将 `usedNames` 从提取器实例级提升为对话级单例，确保跨 Agent 调用的 `nextName()` 全局唯一。但由于 `fenceExtractor` 运行在浏览器端且无直接访问 Zustand store 的能力，此方案需要重构提取器接口，暂不采用。

---

### Fix E: feed() 空内容保护

**文件**: `fenceExtractor.ts:96-99`

**问题**: `feed()` 的围栏闭合路径在发出 `artifact-draft` 前不检查空内容，与 `flush()` 不一致。

**方案**: 在 `feed()` 围栏闭合处增加空值保护（与 `flush()` 第 152-153 行逻辑一致）：

```typescript
// fenceExtractor.ts ~line 99
const content = state.buf.endsWith('\n') ? state.buf.slice(0, -1) : state.buf;

// Fix E: 空围栏保护 — 与 flush() 保持一致
if (content.trim().length === 0) {
  // 跳过空围栏，切回 outside 继续处理
  const rest = state.pending.slice(idx + 3);
  state = { kind: 'outside', pending: '' };
  if (rest.length > 0) return out.concat(feed(rest));
  break;
}

const lang = state.lang;
// ... 后续正常 artifact-draft 输出
```

---

### Fix F: catch 块补充 flush()

**文件**: `remoteAgent.ts:112-113`

**问题**: `for await...of` 异常时 `catch` 跳过 `extractor.flush()`，围栏内已缓冲内容全部丢失。

**方案**: 在 `catch` 块中，发出错误前先 flush：

```typescript
} catch (err: any) {
  // Fix F: 先 flush 剩余缓冲再报错，避免部分内容丢失
  for (const ch of extractor.flush()) yield ch;
  yield { type: 'error', error: `Connection error: ${err.message}` };
}
```

---

### Fix G: max_tokens 翻倍

**文件**: `llmGateway.ts:286`

**问题**: `max_tokens=4096` 对生成完整 HTML 文件来说太紧，DeepSeek 经常在围栏闭合前截断。

**方案**: 将默认 `max_tokens` 从 4096 提升到 8192。

```typescript
// llmGateway.ts ~line 286
max_tokens: params.maxTokens ?? 8192,  // was 4096
```

同时更新 `chatWithClaude` 和 `chatWithGPT` 的默认值保持一致。

---

## 三、改动清单

| # | 文件 | 内容 | 行数变化 |
|---|------|------|---------|
| A | `ArtifactPanel.tsx` | `onSend` 类型 + 传 `mentions` | ~5 行 |
| A | `ArtifactPanel.tsx` | 连接器传 `opts.mentions` | ~1 行 |
| C | `appStore.ts` | `runOrchestrated` 签名扩展 + 上下文注入 | ~20 行 |
| C | `appStore.ts` | `sendUserMessage` 调用点更新 | ~1 行 |
| D | `appStore.ts` | `handleChunkInto` 同轮去重 | ~15 行 |
| E | `fenceExtractor.ts` | `feed()` 空围栏保护 | ~6 行 |
| F | `remoteAgent.ts` | `catch` 块补充 `flush()` | ~3 行 |
| G | `llmGateway.ts` | `max_tokens` 4096→8192 | ~3 行 |

**总改动**: 5 个文件，约 55 行。

---

## 四、验证计划

| # | 验证内容 | 方法 |
|---|---------|------|
| 1 | TypeScript 编译通过 | `npx tsc --noEmit` |
| 2 | 现有 163 个测试全部通过 | `npx vitest run` |
| 3 | SelectionRail 选择 Agent → 单Agent直调 | 手动：群聊中框选代码→选 Agent→发指令→验证不走 PMO |
| 4 | 产物上下文正确传递 | 手动：Agent 响应中包含完整文件内容 |
| 5 | 同名 artifact 不再版本激增 | 手动：PMO 编排后产物 v1→v2 而非 v6→v11 |
| 6 | 空白 artifact 被过滤 | 手动：空围栏不出现在产物列表中 |
| 7 | 网络异常时部分内容保留 | 模拟：断开连接后产物面板仍有部分代码 |
| 8 | 长 HTML 不再被截断 | 手动：>4000 token 的 HTML 文件完整输出 |

---

## 五、风险与边界

| 风险 | 缓解 |
|------|------|
| Fix D 去重逻辑可能误杀合法的多次修改 | 用 5 分钟时间窗口 + 不同 Agent ID 判断，同 Agent 的合法 v2 不受影响 |
| Fix G 增加 token 消耗 | 仅在 `maxTokens` 未显式指定时生效，调用方可覆盖 |
| Fix A 改变 `onSend` 类型 | 检查所有 `onSend` 调用点（2处：ArtifactPanel 连接器 + SelectionRail 内部），均兼容 |
| Fix C `runOrchestrated` 签名变更 | 检查所有调用点（1处：sendUserMessage），已覆盖 |

---

## 六、不做什么

- ❌ 不重构 `fenceExtractor` 的 `usedNames` 为对话级单例（改动太大，Fix D 的同轮去重已足够）
- ❌ 不修改后端 SSE 路由的连接管理（`req.on('close')` 是资源优化，非功能缺陷）
- ❌ 不引入 `AbortController` 超时机制（可后续独立优化）
