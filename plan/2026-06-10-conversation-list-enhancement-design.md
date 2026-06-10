# 对话列表功能完善 — 设计文档

> 日期: 2026-06-10 | 状态: ✅ 已确认

## 需求概述

完善左侧会话列表功能：新建/置顶/归档/搜索，按最近活跃排序。当前实现已有基础框架，缺少置顶（pin）能力和上下文操作入口。

## 当前状态 vs 目标

| 功能 | 当前 | 目标 |
|------|------|------|
| 新建对话 | ✅ NewChatModal | 保持不变 |
| 置顶 | ❌ 不存在 | 数据库+pinned字段，右键菜单操作 |
| 归档 | ✅ hover按钮+底部入口 | 保留现有交互，加入右键菜单 |
| 搜索 | ✅ 本地文本过滤 | 保持不变 |
| 排序 | ✅ lastActivityAt | pinned优先 → lastActivityAt |
| 重命名 | ❌ 不存在 | inline编辑 |
| 删除 | ❌ 前端未暴露 | 右键菜单+确认弹窗 |

---

## 1. 数据模型

### DB: conversations 表新增列

```sql
ALTER TABLE conversations ADD COLUMN pinned boolean DEFAULT false;
```

### Drizzle Schema 变更

`server/src/db/schema.ts` — conversations 定义增加:
```ts
pinned: boolean('pinned').default(false),
```

### TypeScript 类型

`agenthub-mvp/src/types.ts` — Conversation 接口增加:
```ts
pinned?: boolean;
```

---

## 2. 后端 API

### GET /api/conversations — 排序逻辑修改

```sql
ORDER BY pinned DESC, last_activity_at DESC
```

### PATCH /api/conversations/:id — 无需改动

已有动态字段更新支持 `{ pinned }`, `{ title }`, `{ archived }`。

### DELETE /api/conversations/:id — 无需改动

已有，直接复用。

---

## 3. API Client 新增

`agenthub-mvp/src/api/client.ts`:

```ts
updateConversation(id: string, body: { title?, pinned?, archived? }) → ConversationDTO
deleteConversation(id: string) → void
```

---

## 4. Store 状态管理

`agenthub-mvp/src/store/appStore.ts` — 新增 3 个 action：

### pinConversation(id)
- 乐观 toggle pinned
- fire-and-forget: PATCH /api/conversations/:id { pinned }
- 失败回滚: 恢复原 pinned + 系统消息

### renameConversation(id, title)
- 乐观更新 title
- fire-and-forget: PATCH /api/conversations/:id { title }
- 失败回滚: 恢复原标题 + 系统消息

### deleteConversation(id)
- 乐观移除 conversation + messagesByConv
- 如果删除的是活跃会话，切换到下一个
- fire-and-forget: DELETE /api/conversations/:id
- 失败回滚: 恢复快照 + 系统消息

### 排序逻辑

所有返回 conversations 的地方（create/hydrate/排序）统一规则:
```
.sort((a, b) => {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.lastActivityAt - a.lastActivityAt;
})
```

---

## 5. UI 组件

### 5.1 ConversationList.tsx (修改)

**布局:**
```
┌─────────────────────────────┐
│  [Logo] AgentHub   [+] [🔍] │  头部
├─────────────────────────────┤
│  📌 置顶                     │  有置顶时显示
│  ┌───────────────────────┐  │
│  │ 📌 项目A        ⋯     │  │  置顶项带图钉图标
│  └───────────────────────┘  │
│  ─ ─ ─ ─ 分隔线 ─ ─ ─ ─   │  分隔区
│  全部                        │  标签
│  ┌───────────────────────┐  │
│  │ 🤖 Claude Code  ⋯    │  │  普通项
│  └───────────────────────┘  │
├─────────────────────────────┤
│  [市场] [Skills] [📦归档]  │  底部(不变)
└─────────────────────────────┘
```

**置顶视觉:**
- pinned 项左侧有 📌 图标
- 浅色背景 (`bg-feishu-accent/5`)
- 与普通列表之间用细分隔线

**三点菜单:**
- 每个会话项 hover 时右侧出现 `⋯` 按钮
- 点击弹出 `ConversationMenu`

### 5.2 ConversationMenu.tsx (新增)

下拉菜单组件，≤150行：

```
┌──────────────────┐
│ 📌 置顶 / 取消置顶│  根据当前 pinned 状态切换
│ ✏️ 重命名        │
│ 📦 归档 / 取消归档│  根据当前 archived 状态切换
│ ─────────────── │  分隔
│ 🗑️ 删除对话      │  红色，危险操作
└──────────────────┘
```

**交互:**
- 点击菜单外部关闭
- 重命名 → 会话标题变为 input，回车确认，blur 取消
- 删除 → 弹出小型 inline 确认弹窗
- 菜单定位: fixed，计算屏幕边界避免溢出
- 点击菜单项后自动关闭

### 5.3 NewChatModal.tsx (不变)

现有实现已满足需求。

---

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/src/db/schema.ts` | 修改 | 加 pinned 列 |
| `server/src/routes/conversations.ts` | 修改 | 排序逻辑加 pinned |
| `agenthub-mvp/src/types.ts` | 修改 | Conversation 加 pinned |
| `agenthub-mvp/src/api/client.ts` | 修改 | 新增 updateConversation / deleteConversation |
| `agenthub-mvp/src/store/appStore.ts` | 修改 | 3个新action + 排序逻辑 |
| `agenthub-mvp/src/components/ConversationList.tsx` | 修改 | 置顶分区 + 三点菜单入口 |
| `agenthub-mvp/src/components/ConversationMenu.tsx` | **新增** | 下拉菜单组件 |

---

## 7. 错误处理

所有操作遵循项目现有模式:
- **乐观更新** — UI 即时响应
- **失败回滚** — API 失败时恢复旧状态
- **系统消息** — `addMsg` 发送错误通知到对话
- **pinned 持久化** — fire-and-forget，不等 API 响应

---

## 8. 验收标准

- [ ] 会话支持置顶/取消置顶，刷新后保持
- [ ] 置顶会话显示在列表最上方，有视觉分隔
- [ ] 右键菜单包含: 置顶、重命名、归档、删除
- [ ] 重命名支持 inline 编辑
- [ ] 删除有确认弹窗
- [ ] 搜索功能正常（置顶+普通均参与搜索）
- [ ] 按 pinned → lastActivityAt 排序
- [ ] API 失败时乐观回滚 + 错误提示
