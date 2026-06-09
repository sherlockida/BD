# AgentHub — 多 Agent 协作平台

> **IM 群聊范式的多 Agent 协作平台**，飞书风格 UI，PMO 智能编排，产物内联预览。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + Zustand + TailwindCSS + Monaco Editor |
| 后端 | Node.js + Express + WebSocket (ws) + TypeScript |
| 数据库 | PostgreSQL 16 + Drizzle ORM |
| 缓存 | Redis 7 |
| LLM | DeepSeek (dev) / Anthropic Claude + OpenAI GPT (prod) |
| 基础设施 | Docker Compose |

---

## 目录结构

```
BD/
├── agenthub-mvp/          # 前端 (React + Vite)
│   ├── src/
│   │   ├── agents/        # Agent 适配器 (RemoteAgent + Mock fallback)
│   │   ├── orchestrator/  # PMO 编排器 (规划/调度/聚合)
│   │   ├── store/         # Zustand 状态管理
│   │   ├── components/    # UI 组件 (飞书风格)
│   │   ├── api/           # API 客户端 (REST + SSE + WebSocket)
│   │   ├── types.ts       # 核心类型定义
│   │   └── utils/         # 工具函数
│   └── ...
├── server/                # 后端 (Express + WS)
│   ├── src/
│   │   ├── routes/        # REST API 路由
│   │   ├── services/      # LLM Gateway + Planner
│   │   ├── db/            # Drizzle ORM Schema + 连接
│   │   ├── ws/            # WebSocket 服务
│   │   └── middleware/    # auth / rateLimit
│   └── ...
├── plan/                  # 设计文档
│   └── AgentHub_Imp.md    # 完整落地方案
├── dev-log/               # AI 协作开发记录
├── docker-compose.yml     # PostgreSQL + Redis
└── CLAUDE.md              # 本文件
```

---

## 启动命令

### 首次启动
```bash
# 1. 启动数据库
docker compose up -d

# 2. 创建 .env 并建表
cd server && cp .env.example .env && npx drizzle-kit push

# 3. 安装依赖
cd server && npm install
cd agenthub-mvp && npm install
```

### 日常开发
```bash
# 终端 1: 数据库
docker start agenthub-postgres agenthub-redis

# 终端 2: 后端 (http://localhost:3001)
cd server && npm run dev

# 终端 3: 前端 (http://localhost:5173)
cd agenthub-mvp && npm run dev
```

### 数据库操作
```bash
docker exec agenthub-postgres psql -U agenthub -d agenthub -c "\dt"  # 查看表
cd server && npx drizzle-kit push    # 同步表结构
```

---

## ⚠️ 开发结束必须清理

**每次开发测试结束后，关闭所有进程，一个不漏：**

```bash
# 1. 杀 Node 后端进程 (端口 3001)
netstat -ano | grep ":3001" | grep "LISTENING"
taskkill //PID <PID> //F

# 2. 杀 Vite 前端进程 (端口 5173)
netstat -ano | grep ":5173" | grep "LISTENING"
taskkill //PID <PID> //F

# 3. 停 Docker 容器
docker stop agenthub-postgres agenthub-redis

# 4. 验证清空
netstat -ano | grep "LISTENING" | grep -E "3001|5173"  # 应无输出
docker ps --filter "name=agenthub"                       # 应无输出
```

---

## AI 协作规范

### Dev-Log 自动记录
- 目录: `dev-log/`
- 命名: `{版本号}_{第几阶段}_{修改内容}_{日期}.md`
- 每次代码修改后自动凝练写入

### Commit 规范
```
feat: 新功能
fix: 修复
style: 样式
docs: 文档
refactor: 重构
chore: 杂项
```

### 数据库中文编码规范 ⚠️

**新建表时必须考虑 UTF-8 编码：**
- Docker Compose: 设置 `LANG=C.UTF-8` + `POSTGRES_INITDB_ARGS="--encoding=UTF-8 --locale=C.UTF-8"`
- 连接池: 每个新连接执行 `SET client_encoding = 'UTF8'`
- 连接字符串: 包含 `?client_encoding=UTF8`

**遇到中文乱码的处理优先级：**
1. **先尝试恢复** — 检查 hex 值 (`encode(col::bytea, 'hex')`) 判断原始字节是否可恢复
2. **尝试编码逆转** — `convert_from(convert_to(col, 'LATIN1'), 'UTF8')` 等 double-encoding 反转
3. **删除是最后手段** — 仅当字节已是 U+FFFD 替换字符或截断损坏时才删除

### 单文件行数上限
- 组件/工具函数: ≤ 300 行
- Store 文件: ≤ 500 行

---

## 当前开发状态

| 阶段 | 状态 | 内容 |
|------|------|------|
| v1.0 MVP | ✅ 已完成 | 纯前端 Mock，IM 范式验证 |
| v1.1 W1 | ✅ 已完成 | 后端骨架 + DB + REST API |
| v1.1 W2 | ✅ 已完成 | LLM 真实接入 + Planner + 前后端联调 |
| v1.1 W2.5 | ✅ 已完成 | 流式 UX 修复 + 自建 Agent |
| v1.1 W3 | ✅ 已完成 | Monaco Editor + iframe CSP + Diff Editor |
| v1.1 W4 | ⬜ 待启动 | Vercel 部署集成 + E2E 测试 |
| v2.0 W1 | ✅ 已完成 | AgentHub-V2 功能解耦重构 + Workflow 并行开发 |
| v2.0 W1.5 | ✅ 已完成 | 产物预览修复 + DB 持久化 BugFix + DELETE API |

### LLM 配置
- 开发环境: 所有 Agent 统一走 DeepSeek
- DEEPSEEK_API_KEY 在 `server/.env` 中配置
- 生产环境按 vendor 分流: claude→Anthropic, codex→OpenAI

---

## 关键架构决策

1. **自研编排器** — 不绑定 CrewAI/LangGraph，IM 交互范式需要定制调度
2. **Planner 双路径** — 关键词快路径 (<100ms) + LLM 智路径 (~2s)
3. **Drizzle ORM** — 比 Prisma 更轻量，SQL-like API
4. **Agent 适配器模式** — IAgent 统一接口 + RemoteAgent(后端API) / Mock(回退)
5. **SSE 流式 + WebSocket 推送** — 聊天用 SSE，实时事件用 WS
6. **Dev 全部走 DeepSeek** — 只有 DeepSeek Key，其他厂商预留
7. **乐观更新 + 失败回滚** — 前端先更新 Zustand 获得即时响应，API 失败时回滚状态 + 系统消息通知用户
8. **产物类型内容嗅探** — `looksLikeWebpage()` 检测 HTML 标签/DOCTYPE，优先于 artifact.type 字段，避免 LLM 误标注导致预览失败
9. **预览 iframe 三层安全** — CSP meta 标签（外层限制） + AgentHub.util 运行时注入（中层错误处理） + sandbox 属性（内层隔离），确保 LLM 生成的 HTML 不会白屏
10. **Hydration 自愈** — `hydrateFromBackend()` 发现 DB 为空时自动持久化本地 demo 数据，避免 FK 约束导致 artifact 保存失败
