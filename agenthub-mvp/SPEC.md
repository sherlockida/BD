# AgentHub · 平台规格 (SPEC)

> 这是 AgentHub 平台本身的 Spec。我们用"先 Spec 后 Code"的原则来开发 AgentHub，也把这种范式做成了产品功能（用户在群里输入 `/spec` 即可对自己的需求生成 Spec）。

---

## 1. 背景

- 单 Agent 能力有边界，单聊体验无法承载"项目交付"级别的协作。
- 主流 Agent 散落在浏览器/IDE/聊天工具之间，用户切换疲劳。
- 已有 IM 范式（飞书/微信）是用户最熟悉的协作模式 — 把它复用到"人与 Agent 团队"是最低学习成本的入口。

## 2. 目标

- **P0**：提供 IM 风格的对话/群聊体验，至少接入 2+ Agent 平台。
- **P0**：提供「主 Agent (PMO)」拆任务 + 并行调度 + 失败降级。
- **P0**：在消息流中内联预览代码 / 网页 / 文档产物，并支持二次迭代。
- **P1**：版本时间线 + Diff 视图 + 回滚。
- **P1**：一键部署（模拟）。
- **P2**：多端同步、多人协作、Agent 市场计费。

## 3. 用户故事

- **作为独立开发者**，我希望 1 个人就能调度多个 Agent 完成「设计→编码→部署」全流程，以便 3 小时把"6 个工具切换"压缩成"在一个群聊里说话"。
- **作为不写代码的 PM**，我希望可以用自然语言描述需求，由系统自动拆任务给合适的 Agent，并把产物以可视化卡片呈现。
- **作为团队 leader**，我希望对话有完整审计记录、产物有版本历史、Agent 行为有约束（RULES.md），以便对 AI 协作做治理。

## 4. 验收标准（v1.0 MVP）

- [x] 左栏对话列表：可新建 / 搜索 / 归档 / 选择激活
- [x] 中栏聊天窗：流式消息渲染、Pin、引用、复制、重新生成
- [x] 单聊：用户与 1 个 Agent 1v1
- [x] 群聊：用户 + 多个 Agent，@ 单 Agent 走单响应、@ PMO 或无 @ 走编排
- [x] PMO 拆任务：返回 Plan Card，含子任务 DAG，可视化状态
- [x] 并行调度：无依赖任务并行执行；有依赖任务等待
- [x] 失败降级：Agent 失败时自动切到 fallback agent，并在群里系统通知
- [x] 4 个 Agent：Claude Code / Codex / OpenCode / 自建 DocAgent
- [x] 产物类型：code / webpage / doc
- [x] 产物卡片内联 + 全屏面板（预览 / 代码 / Diff / 历史）
- [x] 产物选区 → @ Agent 二次修改的右键操作（在 ArtifactPanel 右栏）
- [x] 部署卡：模拟"打包 → 上传 → CDN → 上线"四步
- [x] AI 协作三件套：SPEC.md / RULES.md / Skills/

## 5. 非目标

- 真实接入 Claude / OpenAI / Codex API（v1.1 接入；MVP 用 Mock 适配器保留真实接口形状）。
- 真实部署到 Vercel / Netlify（v1.2）。
- 多端同步、CRDT 多人协作（v1.2）。
- 权限 / 计费 / SSO（v1.3）。

## 6. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| 多 Agent 并发改同一文件 → 冲突 | 产物状态错乱 | 适配器层落版本，UI 弹冲突 Modal；MVP 用 commit-by-commit append 模式避免覆盖 |
| Agent API 不稳定 | 任务失败 | 适配器层做 try/catch + fallback；UI 系统消息透传 |
| 流式消息渲染卡顿 | 大量 setState | 用 zustand 分片更新；后续可上虚拟列表 |
| Mock 数据让评委误以为是真 LLM | 答辩被质疑 | README 明确标注 Mock 边界，并说明真实接入的迁移路径 |

## 7. 名词表

- **Agent**：实现 `IAgent` 接口的智能体，可来自 Claude Code / Codex / OpenCode / 用户自建。
- **PMO（Orchestrator）**：主 Agent，负责拆任务、调度、汇总。
- **Plan**：PMO 输出的任务 DAG，每个节点是一个 SubTask。
- **Artifact**：Agent 产出的可预览物件（code/webpage/doc）。
- **Skill**：从群聊中沉淀的"协作经验"，以 Markdown 文件保存，供未来对话召回。
- **Spec / Rules**：项目级"约束"，注入到每个 Agent 的 System Prompt。

## 8. 接口契约（核心）

```ts
interface IAgent {
  meta: Agent;
  chat(input: AgentInput): AsyncIterable<AgentChunk>;
  healthCheck(): Promise<boolean>;
}

type AgentChunk =
  | { type: 'text'; delta: string }
  | { type: 'code'; language: string; code: string; filename?: string }
  | { type: 'artifact-draft'; artifactType, name, language?, content, commitMessage }
  | { type: 'tool-call'; tool: string; args: any }
  | { type: 'done' }
  | { type: 'error'; error: string };
```

任何 Agent 实现只要遵守此契约，即可被 Orchestrator 调度、被产物层正确归档、被 UI 正确渲染。

> 真实接入 Claude API 的迁移成本 = "把 Mock 的 `generate()` 改成调用 `https://api.anthropic.com/v1/messages` 并把 SSE 转成 AgentChunk"，~50 行代码。
