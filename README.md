# AgentHub — Multi-Agent Collaboration Platform

> **IM Chat-Group Paradigm for Multi-Agent Collaboration** — Feishu-style UI, PMO intelligent orchestration, in-line artifact preview.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

---

## What is AgentHub?

AgentHub is a multi-agent collaboration platform that treats AI agents as participants in an **IM group chat**. Instead of rigid workflow pipelines, you interact with specialized AI agents (Developer, Designer, Planner, Critic, etc.) through natural conversation — just like chatting with teammates on Feishu or Slack. A built-in **PMO Orchestrator** intelligently breaks down complex tasks, dispatches them to the right agents, and synthesizes results in real-time.

### Why IM Paradigm?

| Traditional Multi-Agent | AgentHub (IM Paradigm) |
|--------------------------|-------------------------|
| Fixed DAG pipelines | Dynamic, conversational dispatch |
| Hard to intervene mid-task | Pause, redirect, or challenge any agent |
| Results after full completion | Streaming responses + incremental artifacts |
| Opaque agent selection | PMO explains *who* is doing *what* and *why* |

---

## ✨ Core Features

- **🧠 Intelligent Orchestration** — PMO Orchestrator 2.0 with classifier, supervisor, agent selector, blackboard, critic, synthesizer, trace, stall detector, and saga patterns. 133 tests covering full orchestration pipeline.
- **💬 Streaming Multi-Agent Chat** — SSE-based streaming responses with real-time WebSocket event push. See what every agent is thinking as it happens.
- **📦 In-Line Artifact Preview** — HTML, Markdown, PDF, code, and interactive components rendered directly in the chat stream via sandboxed iframes with CSP protection.
- **🔄 DAG Fault-Tolerant Scheduling** — Upstream task failures don't block downstream agents. Exponential backoff retries + degraded agent fallback.
- **🎮 GenUI Interactive Components** — Agents can output `ChoiceCards` and other interactive UI, pausing execution until user input (30-min timeout with auto-degradation).
- **🔌 Multi-Model Support** — DeepSeek (dev), Anthropic Claude + OpenAI GPT (prod). Vendor-agnostic LLM Gateway with automatic fallback.
- **🎨 Feishu-Style UI** — Clean, modern chat interface with Monaco Editor, Diff Editor, artifact cards, and agent avatars.
- **💾 Persistent Conversations** — All messages, artifacts, and orchestration traces persisted to PostgreSQL with optimistic UI updates + failure rollback.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-------------|
| **Frontend** | React 18 + TypeScript + Vite + Zustand + TailwindCSS + Monaco Editor |
| **Backend** | Node.js + Express + WebSocket (ws) + TypeScript |
| **Database** | PostgreSQL 16 + Drizzle ORM |
| **Cache** | Redis 7 |
| **LLM** | DeepSeek (dev) / Anthropic Claude + OpenAI GPT (prod) |
| **Infrastructure** | Docker Compose |

---

## 🏗️ Architecture

```
┌─────────────────────┐     SSE / REST / WS      ┌──────────────────────────────┐
│   agenthub-mvp       │ ◄──────────────────────► │   server (Express + WS)      │
│   (React + Vite)     │                          │                              │
│                      │                          │   ┌──────────────────────┐   │
│  ┌────────────────┐  │                          │   │   PMO Orchestrator   │   │
│  │  Zustand Store  │  │                          │   │   ─────────────────  │   │
│  │  (Optimistic UI)│  │                          │   │   • Classifier       │   │
│  └────────────────┘  │                          │   │   • Supervisor       │   │
│                      │                          │   │   • AgentSelector    │   │
│  ┌────────────────┐  │                          │   │   • Blackboard       │   │
│  │  Agent Adapters │  │                          │   │   • Critic           │   │
│  │  (Remote/Mock)  │  │                          │   │   • Synthesizer      │   │
│  └────────────────┘  │                          │   │   • Saga             │   │
│                      │                          │   └──────┬───────────────┘   │
│  ┌────────────────┐  │                          │          │                   │
│  │  Artifact Panel  │  │                          │   ┌──────▼───────────────┐   │
│  │  (iframe + CSP)  │  │                          │   │   LLM Gateway         │   │
│  └────────────────┘  │                          │   │   (DeepSeek/Claude/   │   │
└─────────────────────┘                          │   │    GPT + Fallback)     │   │
                                                  │   └──────────────────────┘   │
                                                  │                              │
                                                  │   ┌──────────────────────┐   │
                                                  │   │   PostgreSQL + Redis  │   │
                                                  │   └──────────────────────┘   │
                                                  └──────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Docker** (for PostgreSQL + Redis)

### 1. Start Databases

```bash
docker compose up -d
```

### 2. Configure Environment

```bash
cd server
cp .env.example .env
# Edit .env — add your DEEPSEEK_API_KEY (required for dev)
npx drizzle-kit push
```

### 3. Install Dependencies

```bash
cd server && npm install
cd ../agenthub-mvp && npm install
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend → http://localhost:3001
cd server && npm run dev

# Terminal 2: Frontend → http://localhost:5173
cd agenthub-mvp && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and start collaborating with agents!

---

## 📂 Project Structure

```
BD/
├── agenthub-mvp/          # Frontend (React + Vite)
│   └── src/
│       ├── agents/        # Agent adapters (RemoteAgent + Mock fallback)
│       ├── orchestrator/  # PMO Orchestrator (plan/schedule/aggregate)
│       ├── store/         # Zustand state management
│       ├── components/    # UI components (Feishu-style)
│       ├── api/           # API client (REST + SSE + WebSocket)
│       ├── utils/         # Utility functions
│       └── types.ts       # Core type definitions
├── server/                # Backend (Express + WS)
│   └── src/
│       ├── routes/        # REST API routes
│       ├── services/      # LLM Gateway + Planner + PDF Generator
│       ├── db/            # Drizzle ORM schema + connection
│       ├── ws/            # WebSocket service
│       └── middleware/     # Auth / rate limiting
├── plan/                  # Design documents
├── dev-log/               # AI-assisted development logs
└── docker-compose.yml     # PostgreSQL + Redis
```

---

## 📊 Development Progress

| Phase | Status | Description |
|-------|--------|-------------|
| v1.0 MVP | ✅ Done | Pure frontend mock, IM paradigm validation |
| v1.1 W1 | ✅ Done | Backend skeleton + DB + REST API |
| v1.1 W2 | ✅ Done | LLM integration + Planner + frontend-backend integration |
| v1.1 W2.5 | ✅ Done | Streaming UX fixes + custom agents |
| v1.1 W3 | ✅ Done | Monaco Editor + iframe CSP + Diff Editor |
| v2.0 W1 | ✅ Done | AgentHub-V2 decoupling refactor + parallel workflow |
| v2.0 W1.5 | ✅ Done | Artifact preview fixes + DB persistence + DELETE API |
| v2.1 W1 | ✅ Done | Orchestrator 2.0 (classifier/supervisor/blackboard/critic/synthesizer/trace/stall/saga) + 133 tests |
| v2.1 W2 | ✅ Done | Full-chain fixes: DAG deadlock, context flow, GenUI pause/resume, message persistence, artifact dedup, stream truncation, routing, model switch |
| v2.1 W2.5 | ✅ Done | Mock-First artifact interactivity upgrade + model upgrade to deepseek-v4-pro |

---

## 🧠 Key Architecture Decisions

1. **Self-Built Orchestrator** — No CrewAI/LangGraph dependency. The IM interaction paradigm requires custom scheduling.
2. **Planner Dual Path** — Keyword fast-path (<100ms) + LLM intelligent-path (~2s).
3. **Drizzle ORM** — Lighter than Prisma, SQL-like API.
4. **Agent Adapter Pattern** — `IAgent` unified interface + RemoteAgent (backend API) / Mock (fallback).
5. **SSE Streaming + WebSocket Push** — SSE for chat streaming, WS for real-time events.
6. **Optimistic Update + Rollback** — Frontend updates Zustand instantly; rolls back state + notifies user on API failure.
7. **Artifact Content Sniffing** — `looksLikeWebpage()` detects HTML tags/DOCTYPE, overriding `artifact.type` to prevent LLM mislabeling.
8. **iframe Triple-Layer Security** — CSP meta tags (outer) + AgentHub.util runtime injection (middle) + sandbox attribute (inner isolation).
9. **DAG Fault-Tolerant Scheduling** — Upstream failures don't block downstream; downstream continues with `⚠️ upstream failed` warning. Exponential backoff retry + agent degradation.
10. **GenUI Pause/Resume** — Agent outputs interactive components → task enters `paused` state → waits for user input → resumes. 30-min timeout with auto-degradation.
11. **Unified Persistence Facade** — `addMsg()` auto-persists to DB; streaming messages deferred until `streaming: false`. Covers all message paths (user/agent/plan card/system).
12. **Same-Round Artifact Dedup** — Artifacts with identical names within one orchestration round get agent-specific suffixes to prevent version explosion.
13. **max_tokens=8192** — DeepSeek's 4096 token limit truncated HTML before tag closure; 8192 covers full webpage generation.
14. **Full-Chain Backend Logging** — Colorful structured logs: request → LLM streaming progress (every 5s) → full response → timing/char stats → error details.

---

## 🔧 Development Guide

### LLM Configuration

- **Development**: All agents use DeepSeek `deepseek-v4-pro` (configure `DEEPSEEK_API_KEY` in `server/.env`)
- **Production**: Per-vendor routing — `claude` → Anthropic, `codex` → OpenAI

### Database

```bash
docker exec agenthub-postgres psql -U agenthub -d agenthub -c "\dt"  # List tables
cd server && npx drizzle-kit push    # Sync schema
```

### Running Tests

```bash
cd server && npm test        # Backend: 28 tests (orchestrator + LLM gateway)
cd agenthub-mvp && npm test   # Frontend: component + unit tests
```

### Commit Convention

```
feat:     New feature
fix:      Bug fix
style:    UI/style changes
docs:     Documentation
refactor: Code refactoring
chore:    Miscellaneous
```

---

## 📄 License

MIT
