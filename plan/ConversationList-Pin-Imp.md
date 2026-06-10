# 对话列表功能完善 — 实施计划

> 日期: 2026-06-10 | 基于: [设计文档](../docs/superpowers/specs/2026-06-10-conversation-list-enhancement-design.md)

## 实施步骤

### Step 1: DB Schema — 加 pinned 列
- `server/src/db/schema.ts`: conversations 表加 `pinned: boolean('pinned').default(false)`
- 执行 `npx drizzle-kit push` 同步数据库

### Step 2: Server — 排序逻辑
- `server/src/routes/conversations.ts`: GET / 查询改为 `ORDER BY pinned DESC, last_activity_at DESC`

### Step 3: 前端类型 — Conversation.pinned
- `agenthub-mvp/src/types.ts`: Conversation 加 `pinned?: boolean`

### Step 4: API Client — 新增函数
- `agenthub-mvp/src/api/client.ts`: 新增 `updateConversation(id, body)`, `deleteConversation(id)`

### Step 5: Store — 3个新 action + 排序
- `agenthub-mvp/src/store/appStore.ts`:
  - `pinConversation(id)`
  - `renameConversation(id, title)`
  - `deleteConversation(id)`
  - 修改排序逻辑（pinned 优先）

### Step 6: UI — ConversationMenu 组件 + ConversationList 改造
- 新增 `agenthub-mvp/src/components/ConversationMenu.tsx`
- 修改 `agenthub-mvp/src/components/ConversationList.tsx`

### Step 7: 验证
- 启动前后端，手动验证置顶/重命名/删除/归档功能
