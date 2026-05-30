# AgentHub MVP

> 飞书式的多 Agent 协作平台。让每个 Agent 都像同事一样在群里上班。
> 完整方案文档见 `../bd_version_1_0.md`。

## ✨ 你能用它做什么

- 像用飞书一样新建对话/群聊，跟多个 AI Agent 协作完成"项目交付"
- 用一句话需求触发 **PMO 主 Agent** 拆任务、并行调度多个子 Agent
- 在群里看代码、网页、文档的内联预览，并圈选片段 @ Agent 二次迭代
- 全程沉淀「AI 协作 Skill」，让下次对话更聪明

## 🚀 30 秒跑起来

```bash
cd agenthub-mvp
npm install
npm run dev
# 浏览器自动打开 http://localhost:5173
```

> Node ≥ 18。无需后端、无需任何 API Key。所有 Agent 行为目前是 Mock 实现，但接口形状真实可平滑替换。

## 🎬 必看 Demo 路径（3 分钟）

1. **打开默认群聊「茶饮落地页项目」**
2. 在输入框输入：
   ```
   做个茶饮品牌的 H5 落地页，带表单收集留资
   ```
   敲回车 → 看 PMO 弹出 **Plan Card**，4 个子任务并行/串行可视化
3. 等几秒，多个 Agent 流式产出（typing 气泡）：
   - `DocAgent` 出 `brand-copy.md`
   - `Claude Code` 出 `index.html`
   - `Codex` 出 `theme.css`
4. **点右上角"产物"** → 展开右侧面板，切换"预览 / 代码 / Diff / 历史"四个 Tab
5. 在右侧选区面板里：选个 Agent，输入"把按钮改成圆角更大" → 发到聊天
6. 输入 `/deploy` → 看 **Deploy Card** 进度条 → 上线 → 收到 PMO 推荐沉淀的 Skill
7. **点左下角 Skills** → 查看已沉淀的协作经验
8. **点左下角 Agent 市场** → 浏览/自建 Agent

### 其他可玩

- `/spec` — 在群里生成 Spec 模板
- `/new-agent <一句话>` — 一句话自建 Agent 并入群
- `/skills` — 打开 Skills 抽屉
- 任意 Agent 消息 hover → 点 ✨ 沉淀为 Skill
- 任意消息右侧操作：📌 Pin、↩ 引用、🔄 重新生成、复制

## 🏗️ 架构速览

```
src/
├── agents/           # Agent 适配器层（统一 IAgent 接口）
│   ├── base.ts          # 抽象基类（流式骨架）
│   ├── claudeCode.ts    # Mock: Anthropic Claude Code
│   ├── codex.ts         # Mock: OpenAI Codex
│   ├── openCode.ts      # Mock: 开源 OpenCode（兜底）
│   ├── custom.ts        # 用户自建 Agent
│   └── registry.ts      # 注册中心 + 能力匹配
│
├── orchestrator/     # PMO 主 Agent
│   ├── planner.ts       # 任务拆解（关键词 → DAG）
│   ├── scheduler.ts     # 并行 + 依赖调度 + 失败降级
│   └── aggregator.ts    # 结果聚合 → PMO 周报
│
├── store/            # 全局状态（zustand）
│   └── appStore.ts      # 会话/消息/产物/Skills 统一 store
│
├── components/       # 飞书风格 UI
│   ├── ConversationList.tsx  # 左栏对话列表
│   ├── ChatWindow.tsx        # 中栏聊天窗口
│   ├── ArtifactPanel.tsx     # 右栏产物面板（预览/代码/Diff/历史）
│   ├── MessageBubble.tsx     # 消息气泡（多类型 + 流式）
│   ├── PlanCard.tsx          # PMO 任务编排卡
│   ├── DiffViewer.tsx        # Diff 视图
│   ├── DeployCard.tsx        # 部署状态卡
│   ├── AgentPicker.tsx       # Agent 选择 / 自建
│   ├── AgentMarket.tsx       # Agent 市场
│   ├── SkillsDrawer.tsx      # Skills 抽屉
│   └── NewChatModal.tsx      # 新建对话弹窗
│
├── utils/
│   ├── id.ts             # uid / sleep
│   └── diff.ts           # 极简行级 diff
│
├── types.ts          # 全局类型（IAgent / Conversation / Message / Plan / Artifact / Skill）
├── App.tsx           # 整体布局
└── main.tsx          # 入口
```

## 📦 三件套（AI 协作沉淀）

- `SPEC.md` — 平台需求规格（先 Spec 后 Code）
- `RULES.md` — 给所有 Agent 注入的行为约束
- `.agenthub/skills/*.md` — 5 条可复用 Skill
  - `im-message-streaming.md`
  - `orchestrator-task-planning.md`
  - `agent-adapter-pattern.md`
  - `artifact-version-control.md`
  - `human-ai-collaboration-protocol.md`

## 🛠️ 真实接入路径（v1.1）

1. 把 `src/agents/claudeCode.ts` 的 `generate()` 改成：
   ```ts
   async *chat(input) {
     const res = await anthropic.messages.stream({
       model: 'claude-sonnet-4-6',
       messages: this.buildMessages(input),
     });
     for await (const ev of res) yield mapAnthropicEvent(ev);
     yield { type: 'done' };
   }
   ```
2. 把 Codex / OpenCode 类比替换为 OpenAI Responses / OSS Endpoint
3. 加一个 Node.js 后端（Express + ws），把 Adapter 从前端搬到后端（保留 IAgent 契约不变）
4. 加 Postgres + Redis（参见 `bd_version_1_0.md` §5.5 数据模型）

## ⚖️ 评分对齐自检

| 维度 | 权重 | 我们的对应 |
|---|---|---|
| AI 协作能力 | 30% | SPEC + RULES + 5 Skills + 产品化沉淀机制（一键沉淀 Skill） |
| 功能完整度 | 25% | 单/群聊 + 4 Agent + Orchestrator + 3 类产物 + Diff + 部署 |
| 生成效果质量 | 20% | 飞书风格 UI + 流式 typing + 产物时间线 + iframe sandbox 预览 |
| 代码理解度 | 15% | 类型严格、分层清晰、本 README 解释了每个目录的职责 |
| 创新与产品感 | 10% | "Agent 在群里上班" 范式 + PMO 拟人化 + Skill 自沉淀 + Agent 市场 |

## 🧠 设计要点（答辩 cheat sheet）

- **为什么用群聊范式**：零学习成本，复用用户对飞书/微信的肌肉记忆
- **为什么有 PMO**：单 Agent 没有"项目视角"，PMO 把"工程化协作"做出来
- **为什么 Adapter Pattern**：屏蔽厂商 API 差异，让上游统一被调度
- **为什么 append-only 产物**：审计可追溯，回滚也是 new version
- **为什么前端 mock**：黑客松时间宝贵，先把"协作范式"跑通，真实接入是 v1.1 的事

## License
MIT
