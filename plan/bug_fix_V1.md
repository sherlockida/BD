# AgentHub 产物预览 & 持久化 Bug 修复方案 V1

> **创建日期**: 2026-06-09
> **状态**: 待确认
> **涉及模块**: 前端 ArtifactPanel / Store / API Client，后端 Artifacts Router / DB Schema

---

## 一、问题总览

| # | 问题 | 严重度 | 根因类别 |
|---|------|--------|----------|
| 1 | HTML 产物预览有时显示代码而非渲染页面 | 高 | 类型判定 + 缺少预览工具栏 |
| 2 | 预览中点击无功能按钮 → 白屏 | 高 | iframe 无错误处理 |
| 3 | Agent 生成的 HTML 缺少"此功能暂未实现"约定 | 中 | 缺少编码规范注入 |
| 4 | 预览区缺少刷新按钮 | 中 | UI 缺失 |
| 5 | 产物未真正落盘到 PostgreSQL | 致命 | 静默失败 + 缺少 DELETE 端点 |
| 6 | 历史/回滚/删除操作需真实 DB 持久化 | 致命 | 后端 DELETE 缺失 + 前端无删除 UI |

---

## 二、问题详细分析与修复方案

### 问题 1：HTML 预览显示代码而非页面

#### 根因分析

**文件**: `agenthub-mvp/src/components/ArtifactPanel.tsx:277-301` (`PreviewBody`)

```typescript
function PreviewBody({ artifact, version }) {
  if (artifact.type === 'webpage') {
    return <iframe ... srcDoc={injectCsp(version.content)} />;
  }
  if (artifact.type === 'doc') {
    return <pre>{version.content}</pre>;
  }
  // ⚠️ 问题点：artifact.type === 'code' 时走到这里，显示 Monaco Editor
  return <CodeBody version={version} />;
}
```

**判定逻辑完全依赖 `artifact.type` 字段**。当前类型来源有两个：
1. `fenceExtractor.ts:153-175` 的 `defaultNameFor()` — 语言 → 类型映射
2. Agent 直接产出的 `artifact-draft` chunk 中的 `artifactType`

**会出错的场景**：
- LLM 用 `xml` / `htm` / 无标签包裹 HTML → fenceExtractor 将未知语言映射为 `'code'` 类型
- Agent 直接创建 artifact 时 `artifactType` 传错
- LLM 生成完整 HTML 但 fence 语言标注为 `plain` 或 `text`

实际上 `fenceExtractor.ts:175` 的兜底逻辑是：
```typescript
// 默认按代码处理
return [`snippet.${L || 'txt'}`, 'code'];
```
这意味着任何未被识别语言的代码块都会被标记为 `'code'` 类型，即使内容实际上是 HTML。

#### 修复方案（三层防御）

**第 1 层：增强 fenceExtractor 语言检测** (`fenceExtractor.ts`)

在 `defaultNameFor()` 中增加更多 HTML 别名：
```typescript
// 增加：htm, xhtml, xml, svg 等标记语言
if (L === 'html' || L === 'htm' || L === 'xhtml') return ['index.html', 'webpage'];
if (L === 'xml' || L === 'svg') return ['graphic.svg', 'webpage'];
```

**第 2 层：前端内容嗅探** (`PreviewBody` 组件)

在 `PreviewBody` 中增加内容启发式检测 —— 无论 `artifact.type` 是什么，如果内容看起来像完整 HTML 页面，优先用 iframe 渲染：

```typescript
function looksLikeWebpage(content: string): boolean {
  return /<!DOCTYPE\s+html/i.test(content) ||
         /<html[\s>]/i.test(content) ||
         (/<(head|body|div|script|style|link|meta)[\s>]/i.test(content) &&
          /<\/?(html|body|div|script)>/i.test(content));
}
```

修改 `PreviewBody`：
```typescript
function PreviewBody({ artifact, version }) {
  const effectiveType = (artifact.type !== 'webpage' && looksLikeWebpage(version.content))
    ? 'webpage'
    : artifact.type;

  if (effectiveType === 'webpage') {
    return <IframePreview version={version} />;
  }
  // ...
}
```

**第 3 层：增加预览工具栏**（见问题 4）

增加一个预览工具栏，让用户可以在 `预览` / `代码` 视图之间手动切换，即使自动检测失败也能手动纠正。

---

### 问题 2：预览中点击按钮 → 白屏

#### 根因分析

**文件**: `ArtifactPanel.tsx:281-288`

```tsx
<iframe
  key={version.id}
  title="preview"
  className="w-full h-full bg-white border-0"
  sandbox="allow-scripts"  // ⚠️ 极简 sandbox
  srcDoc={injectCsp(version.content)}
/>
```

问题有 3 层：

**2a. sandbox 过严导致 JS 异常未捕获**
- `sandbox="allow-scripts"` 禁止了 `allow-same-origin`、`allow-popups`、`allow-forms`、`allow-modals`
- 当 HTML 中的 JS 尝试 `window.open()`、`alert()`、`location.href =` 等操作时，浏览器抛出 `SecurityError`
- 如果错误未被 try/catch 包裹，可能导致整个文档执行中断
- **更关键**：`sandbox` 没有 `allow-same-origin`，这意味着 iframe 内的 DOM 访问受到极大限制，任何 `document.write()` / `document.open()` 操作会清空整个文档

**2b. CSP meta 标签过严**
`injectCsp()` (lines 401-410) 注入的 CSP：
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self' 'unsafe-inline' 'unsafe-eval';
           style-src 'self' 'unsafe-inline';
           script-src 'self' 'unsafe-inline';
           img-src 'self' data: https:;
           connect-src 'none'; frame-src 'none';">
```
`connect-src 'none'` 会阻止所有 fetch/XHR 请求。如果 Agent 生成的内容中有网络请求，会静默失败。

**2c. 无 iframe 错误边界**
当前 iframe 没有 `onError` 处理，也没有消息通信机制来检测 iframe 内部是否正常运行。

#### 修复方案

**修复 2a+2c：注入错误监控脚本 + 放宽 sandbox**

```typescript
function injectCsp(html: string): string {
  // 放宽 connect-src 以支持基本的 API 请求（但限制来源）
  const csp = `<meta http-equiv="Content-Security-Policy"
    content="default-src 'self' 'unsafe-inline' 'unsafe-eval';
             style-src 'self' 'unsafe-inline';
             script-src 'self' 'unsafe-inline';
             img-src 'self' data: https:;
             connect-src 'self' https:;
             frame-src 'none';">`;

  // 注入错误处理脚本 + "功能未实现" 默认行为
  const safetyScript = `
<script>
(function() {
  // 1. 全局错误捕获 — 防止白屏
  window.onerror = function(msg, url, line, col, err) {
    console.warn('[AgentHub Preview] Error:', msg);
    // 错误气泡展示（不阻断页面）
    var banner = document.getElementById('__ah_error_banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = '__ah_error_banner';
      banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff3cd;color:#856404;padding:8px 16px;font-size:12px;z-index:99999;border-top:2px solid #ffc107;font-family:sans-serif;';
      document.body.appendChild(banner);
    }
    banner.textContent = '⚠️ 页面脚本错误 — 可点击工具栏刷新按钮重新加载';
    return true;
  };

  // 2. 拦截未实现的按钮 — 显示"此功能暂时还没有实现哦~"
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button, [role="button"], .btn, [onclick]');
    if (btn && !btn.__ah_handled) {
      var hasHandler = btn.onclick || btn.getAttribute('onclick') ||
        btn.form || btn.type === 'submit' || btn.type === 'reset' ||
        btn.closest('form') || btn.closest('a[href]');
      if (!hasHandler) {
        e.preventDefault();
        e.stopPropagation();
        showNotImplementedToast();
      }
    }
  }, true);

  // 3. 拦截未实现的链接（href="#" 或 href="javascript:void(0)" 且无 onclick）
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href="#"], a[href="javascript:void(0)"]');
    if (a && !a.onclick && !a.getAttribute('onclick')) {
      e.preventDefault();
      showNotImplementedToast();
    }
  }, true);

  function showNotImplementedToast() {
    var existing = document.querySelector('.__ah_toast');
    if (existing) { existing.remove(); }
    var toast = document.createElement('div');
    toast.className = '__ah_toast';
    toast.textContent = '此功能暂时还没有实现哦~';
    toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.78);color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:99999;pointer-events:none;animation:__ah_fade 2.4s ease forwards;font-family:sans-serif;';
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 2500);
  }

  // 注入动画
  var style = document.createElement('style');
  style.textContent = '@keyframes __ah_fade{0%,80%{opacity:1}100%{opacity:0}}';
  document.head.appendChild(style);
})();
</script>`;

  // 注入到 HTML
  // ... 合并到原有 injectCsp 逻辑
}
```

**修复 2b：放宽 sandbox**

```tsx
<iframe
  key={version.id}
  title="preview"
  sandbox="allow-scripts allow-same-origin"  // 增加 allow-same-origin
  srcDoc={injectCsp(version.content)}
/>
```

增加 `allow-same-origin` 使 iframe 内的 document 操作不会因跨域被阻止。

---

### 问题 3：Agent 编码规范 — "此功能暂时还没有实现哦~"

#### 修复方案

除了前端注入的全局拦截（问题 2），还需要在 **Agent 系统提示词** 中明确规范：

**修改位置**: `server/src/services/genuiCatalog.ts` 的 `CATALOG_SYSTEM_PROMPT` 常量

在系统提示词末尾追加编码规范段落：

```markdown
## HTML/CSS/JS 编码规范

当你生成包含交互元素（按钮、链接、表单等）的 HTML 页面时，必须遵守以下规范：

1. **功能占位**：如果某个按钮/功能在本次迭代中不需要完整实现，
   请使用以下标准占位处理：
   ```html
   <button onclick="AgentHub.util.notImplemented()">功能按钮</button>
   ```
   或者如果不用 onclick 属性，在 <script> 中添加：
   ```javascript
   document.querySelector('#btn-id').addEventListener('click', function() {
     AgentHub.util.notImplemented();
   });
   ```

2. **`AgentHub.util` 全局工具** 在每个预览页面中自动可用，包含：
   - `AgentHub.util.notImplemented()` — 显示"此功能暂时还没有实现哦~"Toast
   - `AgentHub.util.showMessage(text, type)` — 显示通知消息
   - `AgentHub.util.refresh()` — 通知外层刷新预览

3. **按钮/链接安全规范**：
   - 所有 `<a>` 标签如无实际链接地址，使用 `href="javascript:void(0)"`
   - 所有 `<button>` 必须有明确的 `type` 属性
   - 不要使用 `alert()` / `prompt()` / `confirm()`（沙箱环境下可能不可用）

4. **错误处理**：所有 `<script>` 代码块应包裹在 try/catch 中，
   避免单个错误导致整个页面白屏。
```

同时在 `agenthub-mvp/src/agents/fenceExtractor.ts` 的公共 API 中暴露 `injectAgentHubRuntime()` 工具函数，供 HTML 注入使用。

---

### 问题 4：预览区缺少刷新按钮

#### 修复方案

**文件**: `ArtifactPanel.tsx` — 在 `PreviewBody` 上方增加工具栏

```tsx
function PreviewBody({ artifact, version }) {
  const [iframeKey, setIframeKey] = useState(0);
  const [showCodeFallback, setShowCodeFallback] = useState(false);

  const handleRefresh = () => {
    setIframeKey(k => k + 1); // 强制 iframe 重新挂载
  };

  const looksLikeHtml = looksLikeWebpage(version.content);

  return (
    <div className="h-full flex flex-col">
      {/* 预览工具栏 */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-feishu-bg border-b border-feishu-border shrink-0">
        <span className="text-xs text-feishu-subtext mr-2">预览</span>
        <button onClick={handleRefresh}
          className="text-xs px-2 py-0.5 rounded hover:bg-feishu-accent/10 transition"
          title="刷新预览">
          <RefreshCw size={13} />
        </button>
        {looksLikeHtml && artifact.type !== 'webpage' && (
          <button onClick={() => setShowCodeFallback(!showCodeFallback)}
            className="text-xs px-2 py-0.5 rounded text-feishu-accent hover:bg-feishu-accent/10">
            {showCodeFallback ? '预览渲染' : '查看源码'}
          </button>
        )}
        <button onClick={() => window.open(createBlobUrl(version.content), '_blank')}
          className="text-xs px-2 py-0.5 rounded hover:bg-feishu-accent/10"
          title="在新标签页打开">
          <ExternalLink size={13} />
        </button>
      </div>

      {/* 预览内容 */}
      <div className="flex-1">
        {showCodeFallback ? (
          <CodeBody version={version} />
        ) : (
          <iframe key={`${version.id}-${iframeKey}`} ... />
        )}
      </div>
    </div>
  );
}
```

---

### 问题 5：产物未落盘到 PostgreSQL

#### 根因分析

通过代码审查发现：**持久化代码已经写了**，但存在以下隐患导致实际上可能未落盘：

**5a. API 调用静默失败** (`appStore.ts:1191-1196, 1244-1254`)

```typescript
apiCreateArtifact({...}).catch(err =>
  console.warn('[persist] artifact create failed:', err.message));
```

如果后端未启动、DB 连接断开、schema 未同步……前端收不到任何提示，产物只存在于内存中。用户刷新页面后数据永久丢失。

**5b. 前端生成 UUID，后端也生成 UUID —— 存在 ID 冲突风险**

前端 `handleChunkInto` (line 1218-1219) 生成 `artId = genUuid()` (crypto.randomUUID())，后端 `artifacts.ts:72` 处理 `clientArtId ?? uuid()`。正常情况下前端传来的 ID 被接受。但如果数据库已有同 ID 记录（极端情况），INSERT 会报 duplicate key 冲突，但前端只能看到 `.catch()` 的 console.warn。

**5c. 前端乐观更新 + 后端异步存储**

前端的 pattern 是：
1. 先 `set(s => upsertArtifact(s, artifact))` — 立即更新 Zustand 状态
2. 再 `apiCreateArtifact(...).catch(...)` — 异步调 API

这意味着即使用户立刻看到产物出现在侧栏，实际上 API 可能失败。这是典型的乐观更新问题——应该增加同步状态标记和失败回滚。

**5d. 缺少数据库 schema 同步检查和健康告警**

当前 `/api/health` 只检查 DB 连接，不检查表结构是否存在（drizzle-kit push 是否执行过）。

#### 修复方案

**修复 5a+5c：增加持久化状态追踪 + 失败用户提示**

在 Store 中增加每个 artifact 的持久化状态：

```typescript
// types.ts 扩展
type PersistStatus = 'saved' | 'saving' | 'error' | 'local-only';

// Artifact 类型扩展
interface Artifact {
  // ... 现有字段
  _persistStatus?: PersistStatus;  // UI 同步状态
}
```

修改 `handleChunkInto`：
```typescript
// 创建 artifact 时标记为 'saving'
set(s => upsertArtifact(s, { ...artifact, _persistStatus: 'saving' }));

apiCreateArtifact({...})
  .then(() => {
    // 成功后标记为 'saved'
    set(s => upsertArtifact(s, { ...artifact, _persistStatus: 'saved' }));
  })
  .catch(err => {
    // 失败后标记为 'error'
    console.error('[persist] artifact create failed:', err.message);
    set(s => upsertArtifact(s, { ...artifact, _persistStatus: 'error' }));
    // 触发用户可见的提示
    set(s => addMsg(s, convId, {
      id: genUuid(),
      conversationId: convId,
      senderType: 'system',
      senderId: 'system',
      content: {
        kind: 'system',
        text: `⚠️ 产物 "${artifact.name}" 保存数据库失败：${err.message}。刷新页面后可能丢失。`,
      },
      createdAt: Date.now(),
    }));
  });
```

在 HistoryBody 中显示同步状态指示器：
```tsx
{artifact._persistStatus === 'saving' && <span className="text-yellow-500">⏳ 保存中...</span>}
{artifact._persistStatus === 'error' && <span className="text-red-500">⚠️ 未保存</span>}
```

**修复 5b：后端增加幂等性处理**

```typescript
// artifacts.ts POST / — 如果 ID 已存在则更新而非报错
const existing = await db.select().from(artifacts).where(eq(artifacts.id, artId)).limit(1);
if (existing.length > 0) {
  // 幂等：已存在则跳过插入，继续添加版本
  // ...
}
```

**修复 5d：增强健康检查**

在 `/api/health` 中增加表检查：
```typescript
app.get('/api/health', async (_req, res) => {
  const dbOk = await dbHealthCheck();
  let schemaOk = false;
  if (dbOk) {
    try {
      await db.execute(sql`SELECT 1 FROM artifacts LIMIT 0`);
      schemaOk = true;
    } catch { schemaOk = false; }
  }
  res.json({
    status: dbOk && schemaOk ? 'ok' : 'degraded',
    db: dbOk,
    schema: schemaOk,
    // ...
  });
});
```

---

### 问题 6：历史/回滚/删除操作需真实 DB 持久化

#### 6a. DELETE 操作完全缺失

**当前状态**：
- 后端 `artifacts.ts`：**没有 DELETE 路由**
- 前端 `appStore.ts`：**没有 deleteArtifact / deleteVersion action**
- 前端 `ArtifactPanel.tsx` HistoryBody：**没有删除按钮**
- 搜索整个项目：`grep -ri "delete.*artifact\|removeArtifact"` → **0 结果**

**修复方案：完整 DELETE 链路**

**(1) 后端新增 DELETE 路由** (`server/src/routes/artifacts.ts`)

```typescript
// DELETE /api/artifacts/:id — 删除整个 artifact（级联删除所有版本 + 关联 deploy 记录）
artifactsRouter.delete('/:id', async (req, res) => {
  try {
    const artifactId = req.params.id;

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    // artifactVersions 和 deploys 有 ON DELETE CASCADE，自动清理
    await db.delete(artifacts).where(eq(artifacts.id, artifactId));

    // 广播删除事件
    if (artifact.conversationId) {
      broadcastToConversation(artifact.conversationId, {
        type: 'artifact.deleted',
        artifactId,
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/artifacts/:id/versions/:versionId — 删除特定版本
artifactsRouter.delete('/:id/versions/:versionId', async (req, res) => {
  try {
    const { id: artifactId, versionId } = req.params;

    // 不允许删除唯一版本
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId));
    if ((count[0]?.count ?? 0) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only version. Delete the artifact instead.' });
    }

    // 如果删除的是 latestVersionId，需要回退 latestVersionId
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    const isLatest = artifact?.latestVersionId === versionId;

    await db.delete(artifactVersions).where(eq(artifactVersions.id, versionId));

    if (isLatest) {
      // 回退 latestVersionId 到次新版本
      const [newLatest] = await db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.artifactId, artifactId))
        .orderBy(desc(artifactVersions.version))
        .limit(1);
      await db
        .update(artifacts)
        .set({ latestVersionId: newLatest?.id ?? null })
        .where(eq(artifacts.id, artifactId));
    }

    if (artifact?.conversationId) {
      broadcastToConversation(artifact.conversationId, {
        type: 'artifact.version_deleted',
        artifactId,
        versionId,
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

**(2) 前端 API Client 新增** (`agenthub-mvp/src/api/client.ts`)

```typescript
export async function deleteArtifact(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/artifacts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete artifact: ${res.status}`);
}

export async function deleteArtifactVersion(artifactId: string, versionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/artifacts/${artifactId}/versions/${versionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete version: ${res.status}`);
}
```

**(3) 前端 Store 新增 action** (`appStore.ts`)

```typescript
// AppState 接口中新增：
deleteArtifact(artifactId: ID): Promise<void>;
deleteArtifactVersion(artifactId: ID, versionId: ID): Promise<void>;

// 实现：
async deleteArtifact(artifactId) {
  const art = get().artifacts.find(a => a.id === artifactId);
  if (!art) return;

  // 乐观删除
  set(s => ({
    ...s,
    artifacts: s.artifacts.filter(a => a.id !== artifactId),
    activeArtifactId: s.activeArtifactId === artifactId ? null : s.activeArtifactId,
  }));

  try {
    await apiDeleteArtifact(artifactId);
  } catch (err: any) {
    // 删除失败 → 回滚
    console.error('[persist] delete artifact failed:', err.message);
    set(s => upsertArtifact(s, art)); // 恢复到状态中
    // 用户提示
  }
},

async deleteArtifactVersion(artifactId, versionId) {
  const art = get().artifacts.find(a => a.id === artifactId);
  if (!art) return;
  const oldVersions = [...art.versions];

  // 乐观删除
  const newVersions = art.versions.filter(v => v.id !== versionId);
  const newLatestId = newVersions.length > 0
    ? newVersions.reduce((a, b) => a.version > b.version ? a : b).id
    : '';
  set(s => upsertArtifact(s, { ...art, versions: newVersions, latestVersionId: newLatestId }));

  try {
    await apiDeleteArtifactVersion(artifactId, versionId);
  } catch (err: any) {
    // 回滚
    set(s => upsertArtifact(s, { ...art, versions: oldVersions }));
  }
},
```

**(4) 前端 HistoryBody 增加删除按钮**

```tsx
function HistoryBody({ artifact, onPick, onRollback, onDeleteVersion }) {
  // ...
  {versions.map(v => (
    <div key={v.id}>
      {/* 现有：查看 + 回滚 按钮 */}
      {/* 新增：删除按钮（红色，带确认） */}
      <button
        onClick={() => {
          if (confirm(`确定删除 v${v.version} 吗？此操作不可撤销。`)) {
            onDeleteVersion(v.id);
          }
        }}
        className="text-[11px] px-2 py-0.5 rounded text-red-500 hover:bg-red-50"
      >
        <Trash2 size={11} className="inline mr-1" />删除
      </button>
    </div>
  ))}
}
```

#### 6b. 回滚操作的完整链路确认

回滚操作 (`rollbackArtifact`) 当前状态：
- ✅ 前端 Store 有实现 (appStore.ts:508-544) — 乐观更新
- ✅ 前端 API Client 有实现 (client.ts:203-211) — `POST /api/artifacts/:id/rollback`
- ✅ 后端路由有实现 (artifacts.ts:183-229) — 创建新版本包含旧内容
- ✅ 有效 DB 写入

**但需要增加**：
- 前端乐观更新后若 API 失败应回滚 Zustand 状态
- WS 广播回滚事件以同步多标签页

---

## 三、实施步骤

### Phase 1：预览修复（预计改动 3 个文件）

| 步骤 | 文件 | 改动内容 |
|------|------|----------|
| 1.1 | `fenceExtractor.ts` | 扩展 HTML 语言别名映射 |
| 1.2 | `ArtifactPanel.tsx` | 重写 `PreviewBody`：增加工具栏（刷新/切换视图/新标签）、HTML 嗅探、iframe 错误处理 |
| 1.3 | `genuiCatalog.ts` | 在 `CATALOG_SYSTEM_PROMPT` 追加 Agent 编码规范 |

### Phase 2：持久化修复（预计改动 5 个文件）

| 步骤 | 文件 | 改动内容 |
|------|------|----------|
| 2.1 | `server/src/routes/artifacts.ts` | 新增 `DELETE /:id` 和 `DELETE /:id/versions/:versionId` 路由 |
| 2.2 | `agenthub-mvp/src/api/client.ts` | 新增 `apiDeleteArtifact()` 和 `apiDeleteArtifactVersion()` |
| 2.3 | `agenthub-mvp/src/types.ts` | 扩展 `Artifact` 类型，增加 `_persistStatus` 字段 |
| 2.4 | `agenthub-mvp/src/store/appStore.ts` | 新增 `deleteArtifact` / `deleteArtifactVersion` action；增强持久化错误处理 + 回滚机制 |
| 2.5 | `agenthub-mvp/src/components/ArtifactPanel.tsx` | HistoryBody 增加删除按钮 + 同步状态指示器 |

### Phase 3：基础设施增强（预计改动 2 个文件）

| 步骤 | 文件 | 改动内容 |
|------|------|----------|
| 3.1 | `server/src/index.ts` | `/api/health` 增加 schema 检查 |
| 3.2 | `server/src/ws/wsServer.ts` | 增加 `artifact.deleted` / `artifact.version_deleted` 事件类型 |

---

## 四、风险与影响评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| iframe sandbox 放宽可能导致安全问题 | 中 | 保留 CSP 限制；注入的 AgentHub.util API 只暴露安全方法 |
| 删除操作不可逆 | 中 | 前端二次确认；后续可增加软删除（archived 标记） |
| 乐观更新回滚可能造成 UI 闪烁 | 低 | 仅在 API 失败时回滚，正常情况不受影响 |
| 前端生成 UUID 可能与服务端默认 UUID 冲突 | 极低 | crypto.randomUUID() 碰撞概率可忽略，但增加幂等处理 |
| Agent 编码规范注入可能增加 token 消耗 | 低 | 规范文本约 800 字符，对 LLM 成本影响极小 |

---

## 五、验证清单

实施完成后需验证：

- [ ] 生成 HTML 产物 → 预览 Tab 显示渲染页面（非代码）
- [ ] 点击预览中无功能按钮 → 显示 "此功能暂时还没有实现哦~" Toast
- [ ] 点击预览中 JS 错误按钮 → 页面不白屏，底部显示黄色错误条
- [ ] 点击刷新按钮 → iframe 重新加载
- [ ] 切换 "查看源码" → 显示 Monaco 编辑器
- [ ] 重启页面 → 之前生成的产物仍在（已持久化到 DB）
- [ ] 历史 Tab → 可查看所有版本
- [ ] 回滚操作 → 生成新版本（内容回退）→ 刷新后仍然存在
- [ ] 删除版本 → 版本从历史列表消失 → 刷新后仍然消失
- [ ] 删除整个产物 → 产物从侧栏消失 → 刷新后仍然消失
- [ ] DB 不可用时 → 前端显示 "保存失败" 提示

---

## 六、后续优化（非本次范围）

1. **产物导出**：支持下载 HTML/CSS/JS 为 ZIP
2. **产物对比**：历史版本间的可视化对比（当前 Diff Tab 已有基础）
3. **批量删除**：清理某个对话下所有产物
4. **产物搜索**：按名称/类型/创建时间搜索
5. **软删除**：用 archived 字段替代硬删除，允许恢复
6. **自动版本清理**：超过 N 个版本的产物自动压缩旧版本
