# AgentHub v1.1 W4 实施方案 — 方案 A（补完工程）

> **状态**: 待用户确认  
> **日期**: 2026-06-06  
> **前置**: v1.1 W3.5（D 方案）全部完成  
> **工期**: 预估 3-4 天

---

## 1. 背景

W3.5 完成后，AgentHub 已具备 IM 全流程（聊天→LLM→产物→持久化），但以下功能仍是缺口：

| 缺口 | 影响 |
|------|------|
| 自建 Agent 后端仅内存数组，重启丢失 | 功能不完整 |
| WebSocket 写了但没人消费，`broadcastToConversation` 无前端订阅 | 多 Tab 实时同步形同虚设 |
| `/deploy` 是前端动画，假的 URL | 虚假 / 功能缺失 |
| 零测试覆盖 | 代码理解度评分丢分 |
| 无演示视频 | 交付物缺一项 |

W4 针对每个缺口逐一补完，最终目标是**3 分钟 Demo 视频能演完全链路**。

---

## 2. 分阶段实施

### W4-1: 自建 Agent 数据库持久化（~2h）

**目标**: 自建 Agent 写入 DB，重启不丢

**改动文件**:

| 文件 | 改动 | 行数 |
|------|------|------|
| `server/src/db/schema.ts` | 新增 `agents` 表（id / name / emoji / color / vendor / capabilities[] / tagline / systemPrompt / isCustom / createdAt） | +20 |
| `server/src/routes/agents.ts` | `POST /custom` 写入 DB + `GET /` 从 DB 加载 + 启动时从 DB 填充 AGENT_METAS | +30/-15 |
| `server/src/db/index.ts` | 新增 `loadCustomAgents()` 导出函数 | +15 |

**关键设计**:
- `agents` 表**不存内置 Agent**（PMO / Claude Code / Codex / OpenCode 的 meta 硬编码在 code 里），只存自建 Agent
- `GET /api/agents` 返回: 内置 meta + DB 中的自建 Agent（以 agent_custom_ 前缀识别）
- 后端启动时调用 `loadCustomAgents()` 把 DB 中的自建 Agent 预装进内存数组

**DDL**:
```sql
CREATE TABLE agents (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  avatar_emoji VARCHAR(10) DEFAULT '🤖',
  avatar_color VARCHAR(50) DEFAULT 'bg-gray-500',
  vendor VARCHAR(20) NOT NULL DEFAULT 'custom',
  capabilities TEXT[] DEFAULT '{}',
  tagline VARCHAR(200),
  system_prompt TEXT,
  is_custom BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**验证**: 前端 `/new-agent` → 创建 → 关后端 → 重开后端 → GET /api/agents 列表仍有该 Agent

---

### W4-2: 前端消费 WebSocket 事件（~3h）

**目标**: 消息、产物、部署变动在多 Tab/多端实时同步

**改动文件**:

| 文件 | 改动 | 行数 |
|------|------|------|
| `agenthub-mvp/src/hooks/useAgentHubWS.ts` | 新建 Hook：connect / subscribe / onEvent → store | +60 |
| `agenthub-mvp/src/App.tsx` | mount 时 connect + subscribe active conv，unmount 时 disconnect | +10 |
| `agenthub-mvp/src/store/appStore.ts` | 新增 `handleWSMessage` / `handleWSArtifact` / `handleWSDeployProgress` 三个 action | +50 |

**实现方案**:

```
wsClient.onEvent(event)
  │
  ├─ message.new          → 检查 convId 是否当前活跃 → 插入到 messagesByConv（去重 by id）
  ├─ message.streaming    → patch 流式消息 delta
  ├─ artifact.new_version → 刷新 artifacts 列表 → 如果面板打开 → 触发 auto-advance
  ├─ deploy.progress      → 更新或插入 deploy 卡片的 step + progress + url
  └─ typing.indicator     → 更新 Agent 打字状态（可选）
```

**验证**: 开两个浏览器 Tab → Tab A 发消息 → Tab B 自动出现消息 / 产物，无需手动刷新

---

### W4-3: 真实 Vercel 部署集成（~4h）

**目标**: `/deploy` → 把 webpage 产物上传到 Vercel → 拿到真实公网 URL

**前置**: 需要一个 Vercel Access Token。如果暂时没有，用 Vercel CLI 做本地部署。

**改动文件**:

| 文件 | 改动 | 行数 |
|------|------|------|
| `server/src/services/vercelDeployService.ts` | 新建：封装 Vercel REST API | +80 |
| `server/src/routes/deploy.ts` | `POST /` 触发异步部署 + `GET /:id/status` SSE | +60/-20 |
| server/.env.example + config.ts | 新增 `VERCEL_TOKEN`+`VERCEL_TEAM_ID`（可选）| +3 |
| `agenthub-mvp/src/store/appStore.ts` | `deployArtifact` 从Mock动画改为调后端 API | +15/-50 |
| `agenthub-mvp/src/components/DeployCard.tsx` | 增加 URL 可点击、二维码（可选）、状态轮询 | +20 |

**部署流程**:

```
用户 /deploy
  │
  ├─ 前端: 发送 POST /api/deploy { artifactId }
  ├─ 后端: 创建 deploys 记录 (step=packaging, progress=10%)
  │         └─ 从 artifact_versions 获取最新版本 html 内容
  ├─ 后端: 调用 Vercel API 创建部署
  │         POST https://api.vercel.com/v13/deployments
  │         { name, files: [{ file: 'index.html', data: <base64> }], projectSettings: { framework: null } }
  │         └→ 返回 { id, url, readyState }
  ├─ 后端: 轮询 GET /v13/deployments/:id 直到 readyState=READY
  │         └─ 每一步更新 deploys 表 → broadcastToConversation(deploy.progress)
  │            building(30%) → uploading(70%) → publishing(90%) → live(100%)
  ├─ 后端: 最终更新 deploys.step='live', deploys.url=<vercel URL>
  │         └→ broadcastToConversation({ type: 'deploy.progress', step: 'live', url })
  └─ 前端: wsClient.onEvent 收到进度 → DeployCard 实时刷新 → 最终显示可点击的 URL
```

**降级策略**（无 Vercel Token 时）:
- 检测 `VERCEL_TOKEN` 未配置 → 走本地 file:// Blob URL 预览 + 提示 "需要 Vercel Token 来获得公网 URL"
- 不想配 Token 时至少保证链路完整

**验证**: 前端 `/deploy` → 4 步进度动画 → 最终返回形如 `https://xxx.vercel.app` 的真实 URL → 浏览器新标签页打开确认可访问

---

### W4-4: 冒烟测试（~3h）

**目标**: 有测试，答辩时能说"这里是测试覆盖率"

**步骤**:

#### 4.1 Vitest 单元测试（前端）

```bash
cd agenthub-mvp && npm install -D vitest @testing-library/react jsdom
```

| 测试文件 | 测试内容 |
|----------|---------|
| `fenceExtractor.test.ts` | 已有 12 条手写测试，加 Vitest runner 包装 |
| `planner.test.ts` | 测试关键词匹配 4 种模式 + 降级路径 |
| `id.test.ts` | 测试 genUuid() 格式 + uid() 前缀 |

#### 4.2 Vitest 单元测试（后端）

```bash
cd server && npm install -D vitest
```

| 测试文件 | 测试内容 |
|----------|---------|
| `plannerService.test.ts` | 测试关键词路径 + LLM 降级路径（mock LLM） |
| `llmGateway.test.ts` | 测试 vendor→provider 映射 + 降级逻辑 |

#### 4.3 Playwright E2E

```bash
cd agenthub-mvp && npm install -D @playwright/test
```

| 测试场景 | 步骤 |
|---------|------|
| 完整聊天流 | 打开页面 → 输入消息 → 等待 Agent 流式回复 → 验证消息出现在页面 |
| 部署流 | 打开群聊 → Agent 已有的产物上点 `/deploy` → 等待 DeployCard 出现 → 验证 4 步走完或 URL 出现 |

**验证**: `npm test` 全部通过；`npx playwright test` 通过

---

### W4-5: Demo 视频录制（~1.5h）

**脚本结构**（3 分钟）:

| 时间段 | 场景 | 操作 |
|--------|------|------|
| 0:00-0:15 | 开场 | 展示 AgentHub 首页，介绍"IM 群聊 × 多 Agent 协作" |
| 0:15-0:45 | 群聊 PMO 编排 | 输入"做个技术博客门户首页"→ PMO 出 Plan Card → 3 Agent 并行回复 |
| 0:45-1:15 | 产物预览迭代 | 点产物面板 → Code Tab 看 Monaco 高亮 → Diff Tab 看版本对比 → 选区操作 → @Agent 改背景色 |
| 1:15-1:45 | 自定义 Agent | `/new-agent` 弹窗 → 填表单 → 创建 → 加入群聊 → @新建 Agent 测试 |
| 1:45-2:15 | 一键部署 | `/deploy` → 4 步进度 → 出现公网 URL → 新标签页打开 |
| 2:15-2:45 | 数据持久化 | 关浏览器 → 重开 → 对话/消息/产物全在 |
| 2:45-3:00 | 收尾 | 展示 Skills/SPEC/架构图 → "基于 AI 三件套方法论，AgentHub 把 IM 范式做进了多 Agent 协作" |

**工具**: OBS Studio / Windows 自带录屏 + 后期剪映加字幕

---

## 3. 文件变更汇总

| 层级 | 新建 | 修改 |
|------|------|------|
| 后端 Schema | — | `schema.ts`（+agents表）|
| 后端路由 | — | `agents.ts`、`deploy.ts` |
| 后端服务 | `vercelDeployService.ts` | — |
| 后端配置 | — | `config.ts`、`.env.example` |
| 前端 Store | — | `appStore.ts`（deploy重写 + WS事件处理）|
| 前端 Hooks | `useAgentHubWS.ts` | — |
| 前端组件 | — | `DeployCard.tsx`、`App.tsx` |
| 测试 | `vitest.config.ts` ×2、`planner.test.ts`、`fenceExtractor.test.ts`（升级）、`plannerService.test.ts`、`e2e/*.spec.ts` | `package.json` ×2 |

---

## 4. 依赖关系

```
W4-1 (Agent DB)  ←── 无依赖，先做
W4-2 (WS 前端)   ←── 依赖 W3.5 的 broadcastToConversation 已修复（✅）
W4-3 (Vercel)    ←── 依赖 W4-2（DeployCard 通过 WS 收进度）
W4-4 (测试)      ←── 依赖 W4-3（部署流是 E2E 的核心场景）
W4-5 (视频)      ←── 依赖 W4-1~W4-4 全部完成
```

**推荐并行策略**: W4-1 和 W4-2 可以并行（改不同的文件、无交叉依赖）

---

## 5. 风险与对策

| 风险 | 概率 | 对策 |
|------|------|------|
| DeepSeek API 不稳定导致测试时 fail | 中 | 单元测试 mock LLM；E2E 用短 prompt 减少 timeout |
| Vercel API Token 没有 | 高 | 提供降级路径：本地 Blob URL 预览 + 说明文字 |
| Vercel API 限流 | 低 | 部署频率低（每次测试才一次），不影响 |
| Windows WSL/PowerShell 差异导致路径问题 | 低 | 所有路径用 `/`，避免 `\` |
| Monaco Editor 在 JSDOM 测试中不可用 | 中 | 跳过 Monaco 渲染测试，只测纯逻辑函数 |

---

## 6. 验收清单

- [ ] `/new-agent` 创建的 Agent 重启后端后仍在
- [ ] 两个 Tab 同时打开同一对话，一侧发消息另一侧实时出现
- [ ] `/deploy` 真实触发 Vercel 部署并返回可访问 URL（或降级为本地 Blob URL 预览）
- [ ] `npm test` 两端都通过（至少 5 条测试用例）
- [ ] `npx playwright test` 至少 2 条 E2E 通过
- [ ] Demo 视频 3 分钟，覆盖 7 个场景
- [ ] TypeScript 双项目编译零错误
- [ ] 开发日志写入 `dev-log/v1.1_W4_完整工程交付_2026-06-07.md`
