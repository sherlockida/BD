# AgentHub — 多智能体协作平台

> **IM 群聊范式的多 Agent 协作平台** — 飞书风格 UI，PMO 智能编排，产物内联预览。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

---

## 什么是 AgentHub？

AgentHub 是一个将 AI Agent 视为 **IM 群聊参与者** 的多智能体协作平台。你不需要编排僵化的工作流管道——只需像在飞书或 Slack 上跟队友聊天一样，与专业 Agent（开发者、设计师、规划师、评论家等）自然对话。内置 **PMO 编排器** 智能拆解复杂任务、分派给合适的 Agent、实时合成结果。

### 为什么用 IM 范式？

| 传统多 Agent | AgentHub（IM 范式） |
|-------------|---------------------|
| 固定 DAG 流水线 | 动态、对话式调度 |
| 任务中途难以干预 | 随时暂停、引导或质疑任意 Agent |
| 结果在全部完成后输出 | 流式响应 + 增量产物交付 |
| Agent 选择不透明 | PMO 解释 *谁* 在做 *什么* 以及 *为什么* |

---

## ✨ 核心特性

- **🧠 智能编排** — PMO Orchestrator 2.0，涵盖分类器、监督者、Agent 选择器、黑板、评论家、合成器、追踪器、卡顿检测和 Saga 模式。133 个测试覆盖完整编排链路。
- **💬 流式多 Agent 聊天** — 基于 SSE 的流式响应 + WebSocket 实时事件推送。每个 Agent 的思考过程实时可见。
- **📦 产物内联预览** — HTML、Markdown、PDF、代码和交互组件通过沙箱 iframe + CSP 保护直接渲染在聊天流中。
- **🔄 DAG 容错调度** — 上游任务失败不阻塞下游 Agent。指数退避重试 + 降级 Agent 切换。
- **🎮 GenUI 交互组件** — Agent 可输出 `ChoiceCards` 等交互式 UI，暂停执行等待用户输入（30 分钟超时自动降级）。
- **🔌 多模型支持** — DeepSeek（开发）/ Anthropic Claude + OpenAI GPT（生产）。厂商无关的 LLM Gateway 支持自动回退。
- **🎨 飞书风格 UI** — 简洁现代的聊天界面，集成 Monaco Editor、Diff Editor、产物卡片和 Agent 头像。
- **💾 对话持久化** — 所有消息、产物和编排追踪持久化到 PostgreSQL，前端乐观更新 + 失败回滚。

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Vite + Zustand + TailwindCSS + Monaco Editor |
| **后端** | Node.js + Express + WebSocket (ws) + TypeScript |
| **数据库** | PostgreSQL 16 + Drizzle ORM |
| **缓存** | Redis 7 |
| **LLM** | DeepSeek（开发）/ Anthropic Claude + OpenAI GPT（生产） |
| **基础设施** | Docker Compose |

---

## 🏗️ 架构概览

```
┌─────────────────────┐     SSE / REST / WS      ┌──────────────────────────────┐
│   agenthub-mvp       │ ◄──────────────────────► │   server (Express + WS)      │
│   (React + Vite)     │                          │                              │
│                      │                          │   ┌──────────────────────┐   │
│  ┌────────────────┐  │                          │   │   PMO 编排器          │   │
│  │  Zustand Store  │  │                          │   │   ─────────────────  │   │
│  │  (乐观更新)      │  │                          │   │   • 分类器            │   │
│  └────────────────┘  │                          │   │   • 监督者            │   │
│                      │                          │   │   • Agent 选择器      │   │
│  ┌────────────────┐  │                          │   │   • 黑板              │   │
│  │  Agent 适配器   │  │                          │   │   • 评论家            │   │
│  │  (Remote/Mock)  │  │                          │   │   • 合成器            │   │
│  └────────────────┘  │                          │   │   • Saga              │   │
│                      │                          │   └──────┬───────────────┘   │
│  ┌────────────────┐  │                          │          │                   │
│  │  产物面板        │  │                          │   ┌──────▼───────────────┐   │
│  │  (iframe + CSP) │  │                          │   │   LLM Gateway         │   │
│  └────────────────┘  │                          │   │   (DeepSeek/Claude/   │   │
└─────────────────────┘                          │   │    GPT + 回退)         │   │
                                                  │   └──────────────────────┘   │
                                                  │                              │
                                                  │   ┌──────────────────────┐   │
                                                  │   │   PostgreSQL + Redis  │   │
                                                  │   └──────────────────────┘   │
                                                  └──────────────────────────────┘
```

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18
- **Docker**（用于 PostgreSQL + Redis）

### 1. 启动数据库

```bash
docker compose up -d
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env — 填写 DEEPSEEK_API_KEY（开发环境必须）
npx drizzle-kit push
```

### 3. 安装依赖

```bash
cd server && npm install
cd ../agenthub-mvp && npm install
```

### 4. 启动开发服务

```bash
# 终端 1: 后端 → http://localhost:3001
cd server && npm run dev

# 终端 2: 前端 → http://localhost:5173
cd agenthub-mvp && npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)，开始与 Agent 协作！

---

## 📂 项目结构

```
BD/
├── agenthub-mvp/          # 前端 (React + Vite)
│   └── src/
│       ├── agents/        # Agent 适配器 (RemoteAgent + Mock 回退)
│       ├── orchestrator/  # PMO 编排器 (规划/调度/聚合)
│       ├── store/         # Zustand 状态管理
│       ├── components/    # UI 组件 (飞书风格)
│       ├── api/           # API 客户端 (REST + SSE + WebSocket)
│       ├── utils/         # 工具函数
│       └── types.ts       # 核心类型定义
├── server/                # 后端 (Express + WS)
│   └── src/
│       ├── routes/        # REST API 路由
│       ├── services/      # LLM Gateway + Planner + PDF 生成器
│       ├── db/            # Drizzle ORM Schema + 连接
│       ├── ws/            # WebSocket 服务
│       └── middleware/     # 认证 / 限流
├── plan/                  # 设计文档
├── dev-log/               # AI 协作开发记录
└── docker-compose.yml     # PostgreSQL + Redis
```

---

## 📊 开发进度

| 阶段 | 状态 | 内容 |
|------|------|------|
| v1.0 MVP | ✅ 已完成 | 纯前端 Mock，IM 范式验证 |
| v1.1 W1 | ✅ 已完成 | 后端骨架 + DB + REST API |
| v1.1 W2 | ✅ 已完成 | LLM 真实接入 + Planner + 前后端联调 |
| v1.1 W2.5 | ✅ 已完成 | 流式 UX 修复 + 自建 Agent |
| v1.1 W3 | ✅ 已完成 | Monaco Editor + iframe CSP + Diff Editor |
| v2.0 W1 | ✅ 已完成 | AgentHub-V2 功能解耦重构 + Workflow 并行开发 |
| v2.0 W1.5 | ✅ 已完成 | 产物预览修复 + DB 持久化 BugFix + DELETE API |
| v2.1 W1 | ✅ 已完成 | Orchestrator 2.0 智能多 Agent 编排器（分类器/监督者/选择器/黑板/评论家/合成器/追踪/卡顿检测/Saga）+ 133 测试 |
| v2.1 W2 | ✅ 已完成 | 全链路修复：DAG 死锁 + 上下文流转 + GenUI 暂停/恢复 + 消息持久化 + 产物去重 + 流截断修复 + 路由修复 + 模型切换 |
| v2.1 W2.5 | ✅ 已完成 | Mock-First 产物交互性升级 + 模型升级 deepseek-v4-pro |

---

## 🧠 关键架构决策

1. **自研编排器** — 不绑定 CrewAI/LangGraph，IM 交互范式需要定制调度。
2. **Planner 双路径** — 关键词快路径 (<100ms) + LLM 智路径 (~2s)。
3. **Drizzle ORM** — 比 Prisma 更轻量，SQL-like API。
4. **Agent 适配器模式** — `IAgent` 统一接口 + RemoteAgent (后端 API) / Mock (回退)。
5. **SSE 流式 + WebSocket 推送** — 聊天用 SSE，实时事件用 WS。
6. **乐观更新 + 失败回滚** — 前端先更新 Zustand 获得即时响应，API 失败时回滚状态 + 系统消息通知用户。
7. **产物类型内容嗅探** — `looksLikeWebpage()` 检测 HTML 标签/DOCTYPE，优先于 `artifact.type` 字段，避免 LLM 误标注导致预览失败。
8. **iframe 三层安全** — CSP meta 标签（外层限制） + AgentHub.util 运行时注入（中层错误处理） + sandbox 属性（内层隔离）。
9. **DAG 容错调度** — 上游任务失败不阻塞下游，下游带 `⚠️ 上游失败` 警告继续执行；指数退避重试 + 降级 Agent 切换。
10. **GenUI 暂停/恢复** — Agent 输出交互组件时任务进入 `paused` 状态，等待用户输入后恢复；30 分钟无响应自动降级。
11. **统一持久化门面** — `addMsg()` 内部自动持久化到 DB，流式消息在 `streaming: false` 时延迟写入；覆盖所有消息路径（用户/Agent/计划卡/系统通知）。
12. **产物同轮去重** — 同一编排轮次内不同 Agent 产出同名产物时用 Agent 后缀区分，避免版本号激增。
13. **max_tokens=8192** — DeepSeek 4096 token 限制导致 HTML 长输出在围栏闭合前截断，上调至 8192 覆盖完整网页生成。
14. **后端全链路日志** — 彩色结构化日志：请求 → LLM 流式进度（每 5s）→ 完整响应内容 → 耗时/字符统计 → 错误详情。

---

## 🔧 开发指南

### LLM 配置

- **开发环境**: 所有 Agent 统一走 DeepSeek `deepseek-v4-pro`（在 `server/.env` 中配置 `DEEPSEEK_API_KEY`）
- **生产环境**: 按厂商分流 — `claude` → Anthropic，`codex` → OpenAI

### 数据库操作

```bash
docker exec agenthub-postgres psql -U agenthub -d agenthub -c "\dt"  # 查看表
cd server && npx drizzle-kit push    # 同步表结构
```

### 运行测试

```bash
cd server && npm test        # 后端: 28 个测试（编排器 + LLM Gateway）
cd agenthub-mvp && npm test   # 前端: 组件 + 单元测试
```

### Commit 规范

```
feat:     新功能
fix:      修复
style:    样式
docs:     文档
refactor: 重构
chore:    杂项
```

---

## 📄 许可证

MIT
