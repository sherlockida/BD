import { create } from 'zustand';
import type {
  Conversation,
  Message,
  Agent,
  Artifact,
  ArtifactVersion,
  Skill,
  ID,
  OrchestratorPlan,
  SubTask,
  AgentChunk,
  ArtifactType,
  DeployStatus,
} from '../types';
import { uid, sleep } from '../utils/id';
import { diffLines } from '../utils/diff';
import { agentRegistry } from '../agents/registry';
import { planTasks, schedule, summarize, ORCHESTRATOR_META } from '../orchestrator';

// ────────────────────────────────────────────────────────────
// AppStore — 统一的全局状态（MVP 阶段，避免多 store 同步成本）
// ────────────────────────────────────────────────────────────

interface AppState {
  // Domain
  conversations: Conversation[];
  messagesByConv: Record<ID, Message[]>;
  agents: Agent[];                       // 含 orchestrator + 注册中心所有 agent
  artifacts: Artifact[];
  skills: Skill[];

  // UI
  activeConversationId: ID | null;
  activeArtifactId: ID | null;
  artifactPanelOpen: boolean;
  agentMarketOpen: boolean;
  skillsDrawerOpen: boolean;
  conflictModal: null | { artifactId: ID; baseVersionId: ID; theirVersionId: ID };

  // ── Actions: conversations ──
  createConversation(opts: { type: 'single' | 'group'; memberAgentIds: ID[]; title?: string }): Conversation;
  setActiveConversation(id: ID): void;
  archiveConversation(id: ID): void;
  togglePinMessage(messageId: ID): void;
  setArtifactPanelOpen(open: boolean): void;
  openArtifact(id: ID): void;
  setAgentMarketOpen(open: boolean): void;
  setSkillsDrawerOpen(open: boolean): void;

  // ── Actions: agents ──
  createCustomAgent(opts: {
    name: string;
    tagline: string;
    capabilities: Agent['capabilities'];
    systemPrompt: string;
    avatarEmoji?: string;
    avatarColor?: string;
  }): Agent;
  addAgentToConversation(convId: ID, agentId: ID): void;
  removeAgentFromConversation(convId: ID, agentId: ID): void;

  // ── Actions: chat ──
  sendUserMessage(convId: ID, text: string, mentions: ID[], replyToMessageId?: ID, attachedArtifactIds?: ID[]): Promise<void>;
  regenerateLastAgentMessage(convId: ID, agentId: ID): Promise<void>;
  triggerSlash(convId: ID, command: string): Promise<void>;

  // ── Actions: artifact ──
  rollbackArtifact(artifactId: ID, versionId: ID): void;
  applyDiff(artifactId: ID, fromVersionId: ID, toVersionId: ID): void;
  deployArtifact(artifactId: ID, convId: ID): Promise<void>;

  // ── Actions: skill ──
  distillSkill(opts: { name: string; trigger: string; description: string; steps: string[]; conversationId?: ID }): Skill;
  removeSkill(id: ID): void;
}

// ── 内部：addMessage 工具 ──
const addMsg = (state: AppState, convId: ID, msg: Message): AppState => {
  const list = state.messagesByConv[convId] ?? [];
  return {
    ...state,
    messagesByConv: { ...state.messagesByConv, [convId]: [...list, msg] },
    conversations: state.conversations.map(c =>
      c.id === convId ? { ...c, lastActivityAt: msg.createdAt } : c,
    ),
  };
};

const patchMsg = (state: AppState, convId: ID, msgId: ID, patch: (m: Message) => Message): AppState => {
  const list = state.messagesByConv[convId] ?? [];
  return {
    ...state,
    messagesByConv: {
      ...state.messagesByConv,
      [convId]: list.map(m => (m.id === msgId ? patch(m) : m)),
    },
  };
};

const upsertArtifact = (state: AppState, art: Artifact): AppState => {
  const exists = state.artifacts.some(a => a.id === art.id);
  return {
    ...state,
    artifacts: exists ? state.artifacts.map(a => (a.id === art.id ? art : a)) : [...state.artifacts, art],
  };
};

export const useAppStore = create<AppState>((set, get) => {
  // ── 启动时种入一个示范对话 ──
  const initialAgents: Agent[] = [
    ORCHESTRATOR_META,
    ...agentRegistry.allMeta(),
  ];
  const demoConvId = uid('conv');
  const demoGroupConvId = uid('conv');

  const welcomeMsgs: Message[] = [
    {
      id: uid('msg'),
      conversationId: demoConvId,
      senderType: 'system',
      senderId: 'system',
      content: { kind: 'system', text: '欢迎使用 AgentHub。试试输入「做个茶饮品牌落地页，带表单收集留资」让 PMO 帮你调度。' },
      createdAt: Date.now(),
    },
  ];

  return {
    conversations: [
      {
        id: demoGroupConvId,
        type: 'group',
        title: '茶饮落地页项目',
        memberAgentIds: ['agent_orchestrator', 'agent_claude_code', 'agent_codex', 'agent_doc', 'agent_open_code'],
        pinnedMessageIds: [],
        lastActivityAt: Date.now(),
        unread: 0,
      },
      {
        id: demoConvId,
        type: 'single',
        title: 'Claude Code · 代码助手',
        memberAgentIds: ['agent_claude_code'],
        pinnedMessageIds: [],
        lastActivityAt: Date.now() - 1000,
        unread: 0,
      },
    ],
    messagesByConv: {
      [demoConvId]: welcomeMsgs,
      [demoGroupConvId]: [
        {
          id: uid('msg'),
          conversationId: demoGroupConvId,
          senderType: 'system',
          senderId: 'system',
          content: { kind: 'system', text: '群已创建。@PMO 拆任务，或 @ 具体 Agent 单独提需求。' },
          createdAt: Date.now(),
        },
      ],
    },
    agents: initialAgents,
    artifacts: [],
    skills: [
      {
        id: uid('skill'),
        name: '先 Spec 后 Code',
        trigger: '当任务包含"做一个 / 实现 / 开发"时',
        description: '在编码前先输出 Spec（背景/目标/验收标准），用户 Review 后再 Code，可减少 60% 返工。',
        steps: ['理解用户原始意图', '输出 Spec 草案', '用户 Review / 修订', '基于 Spec Code'],
        createdAt: Date.now(),
        source: 'manual',
      },
      {
        id: uid('skill'),
        name: '冲突自动 3-way merge',
        trigger: '当两个 agent 修改同一产物',
        description: '对同一文件出现两路并发修改时，由 base / mine / theirs 三方做 3-way merge，失败再弹冲突 UI。',
        steps: ['检测 artifact 同时被两个 task 写入', '执行 diff3', '能合则合，否则弹 conflict modal'],
        createdAt: Date.now() - 1000,
        source: 'auto-distilled',
      },
    ],

    activeConversationId: demoGroupConvId,
    activeArtifactId: null,
    artifactPanelOpen: false,
    agentMarketOpen: false,
    skillsDrawerOpen: false,
    conflictModal: null,

    // ─────────────────────────────────────────────────────
    createConversation({ type, memberAgentIds, title }) {
      const id = uid('conv');
      // 群聊默认带 PMO
      let members = [...memberAgentIds];
      if (type === 'group' && !members.includes('agent_orchestrator')) {
        members = ['agent_orchestrator', ...members];
      }
      const titleAuto =
        title ??
        (type === 'single'
          ? get().agents.find(a => a.id === memberAgentIds[0])?.name ?? '新对话'
          : `新群聊 (${members.length} 成员)`);
      const conv: Conversation = {
        id,
        type,
        title: titleAuto,
        memberAgentIds: members,
        pinnedMessageIds: [],
        lastActivityAt: Date.now(),
        unread: 0,
      };
      set(s => ({
        conversations: [conv, ...s.conversations],
        messagesByConv: {
          ...s.messagesByConv,
          [id]: [
            {
              id: uid('msg'),
              conversationId: id,
              senderType: 'system',
              senderId: 'system',
              content: {
                kind: 'system',
                text:
                  type === 'group'
                    ? '群已创建。@PMO 拆任务，或 @ 具体 Agent 单独提需求。'
                    : `已和 ${titleAuto} 建立单聊。`,
              },
              createdAt: Date.now(),
            },
          ],
        },
        activeConversationId: id,
      }));
      return conv;
    },

    setActiveConversation(id) {
      set(s => ({
        activeConversationId: id,
        conversations: s.conversations.map(c => (c.id === id ? { ...c, unread: 0 } : c)),
      }));
    },

    archiveConversation(id) {
      set(s => ({
        conversations: s.conversations.map(c => (c.id === id ? { ...c, archived: !c.archived } : c)),
      }));
    },

    togglePinMessage(messageId) {
      const { activeConversationId } = get();
      if (!activeConversationId) return;
      set(s => {
        const conv = s.conversations.find(c => c.id === activeConversationId);
        if (!conv) return s;
        const pinned = conv.pinnedMessageIds.includes(messageId)
          ? conv.pinnedMessageIds.filter(x => x !== messageId)
          : [...conv.pinnedMessageIds, messageId];
        return {
          conversations: s.conversations.map(c =>
            c.id === activeConversationId ? { ...c, pinnedMessageIds: pinned } : c,
          ),
          messagesByConv: {
            ...s.messagesByConv,
            [activeConversationId]: (s.messagesByConv[activeConversationId] ?? []).map(m =>
              m.id === messageId ? { ...m, pinned: pinned.includes(messageId) } : m,
            ),
          },
        };
      });
    },

    setArtifactPanelOpen(open) {
      set({ artifactPanelOpen: open });
    },
    openArtifact(id) {
      set({ activeArtifactId: id, artifactPanelOpen: true });
    },
    setAgentMarketOpen(open) {
      set({ agentMarketOpen: open });
    },
    setSkillsDrawerOpen(open) {
      set({ skillsDrawerOpen: open });
    },

    // ─────────────────────────────────────────────────────
    createCustomAgent(opts) {
      const meta = agentRegistry.createCustom(opts);
      set(s => ({ agents: [...s.agents, meta] }));
      return meta;
    },

    addAgentToConversation(convId, agentId) {
      set(s => ({
        conversations: s.conversations.map(c =>
          c.id === convId && !c.memberAgentIds.includes(agentId)
            ? { ...c, memberAgentIds: [...c.memberAgentIds, agentId] }
            : c,
        ),
        messagesByConv: {
          ...s.messagesByConv,
          [convId]: [
            ...(s.messagesByConv[convId] ?? []),
            {
              id: uid('msg'),
              conversationId: convId,
              senderType: 'system',
              senderId: 'system',
              content: {
                kind: 'system',
                text: `${s.agents.find(a => a.id === agentId)?.name ?? agentId} 加入了对话`,
              },
              createdAt: Date.now(),
            },
          ],
        },
      }));
    },

    removeAgentFromConversation(convId, agentId) {
      set(s => ({
        conversations: s.conversations.map(c =>
          c.id === convId ? { ...c, memberAgentIds: c.memberAgentIds.filter(id => id !== agentId) } : c,
        ),
      }));
    },

    // ─────────────────────────────────────────────────────
    async sendUserMessage(convId, text, mentions, replyToMessageId, attachedArtifactIds) {
      const userMsg: Message = {
        id: uid('msg'),
        conversationId: convId,
        senderType: 'user',
        senderId: 'user',
        content: { kind: 'text', text },
        mentions,
        replyToMessageId,
        createdAt: Date.now(),
      };
      set(s => addMsg(s, convId, userMsg));

      const conv = get().conversations.find(c => c.id === convId);
      if (!conv) return;

      // ── 派单决策 ──
      // 1) 单聊：被 mention 字段忽略，直接用对话里那个 agent
      // 2) 群聊：
      //    - 仅 @ 单个非 PMO agent → 该 agent 单独响应
      //    - @ PMO 或 没 @ 任何人 或 @ 多个 → PMO 接管，拆任务
      const nonPmoMentions = mentions.filter(id => id !== 'agent_orchestrator');
      const isSingleAgentCase =
        conv.type === 'single' ||
        (conv.type === 'group' && nonPmoMentions.length === 1 && !mentions.includes('agent_orchestrator'));

      if (isSingleAgentCase) {
        const targetAgentId = conv.type === 'single' ? conv.memberAgentIds[0] : nonPmoMentions[0];
        await runSingleAgent(get, set, convId, targetAgentId, text);
      } else {
        await runOrchestrated(get, set, convId, text);
      }
    },

    async regenerateLastAgentMessage(convId, agentId) {
      const list = get().messagesByConv[convId] ?? [];
      // 找最后一条用户消息
      let lastUserText = '';
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m.senderType === 'user' && m.content.kind === 'text') {
          lastUserText = m.content.text;
          break;
        }
      }
      if (!lastUserText) return;
      await runSingleAgent(get, set, convId, agentId, lastUserText);
    },

    async triggerSlash(convId, command) {
      const cmd = command.trim();
      if (cmd === '/skills') {
        set({ skillsDrawerOpen: true });
        return;
      }
      if (cmd.startsWith('/spec')) {
        const arg = cmd.replace(/^\/spec\s*/, '') || '请描述你的需求';
        set(s =>
          addMsg(s, convId, {
            id: uid('msg'),
            conversationId: convId,
            senderType: 'agent',
            senderId: 'agent_orchestrator',
            content: {
              kind: 'text',
              text:
                `📝 **Spec 模板**\n\n` +
                `## 背景\n${arg}\n\n` +
                `## 目标\n- [ ] 目标 1\n- [ ] 目标 2\n\n` +
                `## 用户故事\n作为 ___，我希望 ___，以便 ___。\n\n` +
                `## 验收标准\n- [ ] 标准 1\n- [ ] 标准 2\n\n` +
                `## 非目标\n- 暂不涉及 ___\n\n` +
                `## 风险\n- 风险 1：___；对策：___\n\n` +
                `> 请补全后回复"确认 Spec"，我会基于此分派任务。`,
            },
            createdAt: Date.now(),
          }),
        );
        return;
      }
      if (cmd.startsWith('/new-agent')) {
        const arg = cmd.replace(/^\/new-agent\s*/, '');
        const meta = get().createCustomAgent({
          name: arg.slice(0, 16) || '我的助手',
          tagline: arg || '用户自建 Agent',
          capabilities: ['code', 'doc'],
          systemPrompt: `你是「${arg}」，请按这个角色回复用户。`,
        });
        get().addAgentToConversation(convId, meta.id);
        return;
      }
      if (cmd.startsWith('/deploy')) {
        // 找最近一个 webpage artifact
        const convArts = get().artifacts.filter(a => a.conversationId === convId);
        const target = [...convArts].reverse().find(a => a.type === 'webpage') ?? convArts[convArts.length - 1];
        if (!target) {
          set(s =>
            addMsg(s, convId, {
              id: uid('msg'),
              conversationId: convId,
              senderType: 'system',
              senderId: 'system',
              content: { kind: 'system', text: '当前对话没有可部署的产物。' },
              createdAt: Date.now(),
            }),
          );
          return;
        }
        await get().deployArtifact(target.id, convId);
        return;
      }
      // 未知命令
      set(s =>
        addMsg(s, convId, {
          id: uid('msg'),
          conversationId: convId,
          senderType: 'system',
          senderId: 'system',
          content: { kind: 'system', text: `未识别命令：${cmd}。可用：/spec /skills /new-agent /deploy` },
          createdAt: Date.now(),
        }),
      );
    },

    // ─────────────────────────────────────────────────────
    rollbackArtifact(artifactId, versionId) {
      const art = get().artifacts.find(a => a.id === artifactId);
      if (!art) return;
      const ver = art.versions.find(v => v.id === versionId);
      if (!ver) return;
      const newVer: ArtifactVersion = {
        id: uid('ver'),
        artifactId,
        version: art.versions.length + 1,
        content: ver.content,
        authorAgentId: 'user',
        commitMessage: `revert: 回滚到 v${ver.version}`,
        createdAt: Date.now(),
      };
      set(s =>
        upsertArtifact(s, {
          ...art,
          versions: [...art.versions, newVer],
          latestVersionId: newVer.id,
        }),
      );
      // 在对应对话里追加一条系统消息
      set(s =>
        addMsg(s, art.conversationId, {
          id: uid('msg'),
          conversationId: art.conversationId,
          senderType: 'system',
          senderId: 'system',
          content: { kind: 'system', text: `${art.name} 已回滚到 v${ver.version}（生成新版本 v${newVer.version}）` },
          createdAt: Date.now(),
        }),
      );
    },

    applyDiff(_artifactId, _fromVersionId, _toVersionId) {
      // MVP：diff 已经由 ChunkProcessor 落版本了，这里仅作为占位
    },

    async deployArtifact(artifactId, convId) {
      const art = get().artifacts.find(a => a.id === artifactId);
      if (!art) return;
      const deployId = uid('deploy');
      const msg: Message = {
        id: uid('msg'),
        conversationId: convId,
        senderType: 'agent',
        senderId: 'agent_open_code',
        content: {
          kind: 'deploy',
          deploy: {
            id: deployId,
            artifactId,
            step: 'building',
            progress: 5,
            message: '构建中...',
            startedAt: Date.now(),
          },
        },
        createdAt: Date.now(),
      };
      set(s => addMsg(s, convId, msg));

      const steps: { step: DeployStatus['step']; progress: number; msg: string; delay: number }[] = [
        { step: 'building', progress: 30, msg: '正在打包静态资源...', delay: 600 },
        { step: 'building', progress: 60, msg: '正在压缩...', delay: 500 },
        { step: 'uploading', progress: 80, msg: '正在上传到 Vercel...', delay: 700 },
        { step: 'uploading', progress: 95, msg: '正在分配 CDN...', delay: 500 },
        { step: 'live', progress: 100, msg: '部署成功', delay: 400 },
      ];
      for (const s of steps) {
        await sleep(s.delay);
        set(state =>
          patchMsg(state, convId, msg.id, m => {
            if (m.content.kind !== 'deploy') return m;
            return {
              ...m,
              content: {
                ...m.content,
                deploy: {
                  ...m.content.deploy,
                  step: s.step,
                  progress: s.progress,
                  message: s.msg,
                  ...(s.step === 'live'
                    ? {
                        url: `https://${art.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${deployId.slice(-4)}.vercel.app`,
                        finishedAt: Date.now(),
                      }
                    : {}),
                },
              },
            };
          }),
        );
      }

      // 沉淀 candidate skill
      set(s =>
        addMsg(s, convId, {
          id: uid('msg'),
          conversationId: convId,
          senderType: 'agent',
          senderId: 'agent_orchestrator',
          content: {
            kind: 'text',
            text:
              '✅ 部署完成。本次协作中我观察到 1 条可沉淀的经验：\n\n' +
              '> **"页面骨架先行，样式后调"** — 让 Claude Code 先出 HTML 结构，Codex 再做样式，能避免双方互相覆盖。\n\n' +
              '是否沉淀为 Skill？打开右上角 Skills 抽屉一键入库。',
          },
          createdAt: Date.now(),
        }),
      );
    },

    distillSkill(opts) {
      const sk: Skill = {
        id: uid('skill'),
        name: opts.name,
        trigger: opts.trigger,
        description: opts.description,
        steps: opts.steps,
        createdAt: Date.now(),
        source: 'auto-distilled',
        conversationId: opts.conversationId,
      };
      set(s => ({ skills: [sk, ...s.skills] }));
      return sk;
    },

    removeSkill(id) {
      set(s => ({ skills: s.skills.filter(x => x.id !== id) }));
    },
  };
});

// ────────────────────────────────────────────────────────────
// 内部：单 agent / 编排两种执行路径
// ────────────────────────────────────────────────────────────

type GetState = () => AppState;
type SetState = (
  partial:
    | AppState
    | Partial<AppState>
    | ((s: AppState) => AppState | Partial<AppState>),
) => void;

async function runSingleAgent(
  get: GetState,
  set: SetState,
  convId: ID,
  agentId: ID,
  userText: string,
): Promise<void> {
  const agent = agentRegistry.get(agentId);
  if (!agent) return;

  // 创建一条流式 agent 消息
  const msgId = uid('msg');
  const agentMsg: Message = {
    id: msgId,
    conversationId: convId,
    senderType: 'agent',
    senderId: agentId,
    content: { kind: 'text', text: '' },
    createdAt: Date.now(),
    streaming: true,
  };
  set(s => addMsg(s, convId, agentMsg));

  const conv = get().conversations.find(c => c.id === convId)!;
  const history = get().messagesByConv[convId] ?? [];

  try {
    for await (const chunk of agent.chat({ conversation: conv, history, userPrompt: userText })) {
      handleChunkInto(get, set, convId, msgId, chunk, agentId);
    }
  } catch (e: any) {
    set(s =>
      patchMsg(s, convId, msgId, m => ({
        ...m,
        streaming: false,
        content: { kind: 'text', text: `❌ Agent 调用失败：${e?.message ?? e}` },
      })),
    );
    return;
  }
  set(s => patchMsg(s, convId, msgId, m => ({ ...m, streaming: false })));
}

async function runOrchestrated(get: GetState, set: SetState, convId: ID, userText: string): Promise<void> {
  const conv = get().conversations.find(c => c.id === convId)!;
  const availableAgents = conv.memberAgentIds
    .map(id => get().agents.find(a => a.id === id))
    .filter((x): x is Agent => !!x && x.id !== 'agent_orchestrator');

  // 1) Planner
  const plan = planTasks(userText, availableAgents);

  // 2) PMO 在群里发一条 plan card
  const planMsg: Message = {
    id: uid('msg'),
    conversationId: convId,
    senderType: 'agent',
    senderId: 'agent_orchestrator',
    content: { kind: 'plan', plan: { ...plan, status: 'running' } },
    createdAt: Date.now(),
  };
  set(s => addMsg(s, convId, planMsg));

  // 跟踪 task → message 映射
  const taskToMsgId = new Map<string, ID>();

  await schedule(
    plan,
    { conversation: conv, history: get().messagesByConv[convId] ?? [] },
    {
      onTaskStart(task: SubTask) {
        // 为这个任务创建一条流式 agent 消息
        const m: Message = {
          id: uid('msg'),
          conversationId: convId,
          senderType: 'agent',
          senderId: task.assignedAgentId,
          content: { kind: 'text', text: '' },
          createdAt: Date.now(),
          streaming: true,
        };
        taskToMsgId.set(task.id, m.id);
        set(s => addMsg(s, convId, m));
        // 更新 plan card 的 task status
        updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
          ...p,
          subTasks: p.subTasks.map(t => (t.id === task.id ? { ...t, status: 'running', startedAt: Date.now() } : t)),
        }));
      },
      onTaskChunk(task: SubTask, chunk: AgentChunk) {
        const mid = taskToMsgId.get(task.id);
        if (!mid) return;
        handleChunkInto(get, set, convId, mid, chunk, task.assignedAgentId, task);
      },
      onTaskDone(task: SubTask, success: boolean, errMsg?: string) {
        const mid = taskToMsgId.get(task.id);
        if (mid) {
          set(s => patchMsg(s, convId, mid, m => ({ ...m, streaming: false })));
        }
        updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
          ...p,
          subTasks: p.subTasks.map(t =>
            t.id === task.id
              ? {
                  ...t,
                  status: success ? (t.status === 'fallback' ? 'fallback' : 'success') : 'failed',
                  finishedAt: Date.now(),
                  output: errMsg,
                }
              : t,
          ),
        }));
      },
      onFallback(task: SubTask, fromId: string, toId: string) {
        // 系统消息
        set(s =>
          addMsg(s, convId, {
            id: uid('msg'),
            conversationId: convId,
            senderType: 'system',
            senderId: 'system',
            content: {
              kind: 'system',
              text: `⚠️ ${s.agents.find(a => a.id === fromId)?.name ?? fromId} 失败，降级到 ${
                s.agents.find(a => a.id === toId)?.name ?? toId
              } 重试`,
            },
            createdAt: Date.now(),
          }),
        );
        updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
          ...p,
          subTasks: p.subTasks.map(t => (t.id === task.id ? { ...t, status: 'fallback', assignedAgentId: toId } : t)),
        }));
      },
    },
  );

  // 3) Aggregator 写一条总结
  const final = get().messagesByConv[convId]?.find(m => m.id === planMsg.id);
  const planAfter =
    final && final.content.kind === 'plan'
      ? final.content.plan
      : { ...plan, status: 'done' as const };
  const summary = summarize(planAfter);
  set(s =>
    addMsg(s, convId, {
      id: uid('msg'),
      conversationId: convId,
      senderType: 'agent',
      senderId: 'agent_orchestrator',
      content: { kind: 'text', text: `🧭 **PMO 周报**\n\n${summary}` },
      createdAt: Date.now(),
    }),
  );
  // 标记 plan card 为 done
  updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({ ...p, status: 'done' }));
}

function updatePlanCard(
  get: GetState,
  set: SetState,
  convId: ID,
  msgId: ID,
  _planId: ID,
  mapper: (p: OrchestratorPlan) => OrchestratorPlan,
) {
  set(s =>
    patchMsg(s, convId, msgId, m => {
      if (m.content.kind !== 'plan') return m;
      return { ...m, content: { kind: 'plan', plan: mapper(m.content.plan) } };
    }),
  );
}

function handleChunkInto(
  get: GetState,
  set: SetState,
  convId: ID,
  msgId: ID,
  chunk: AgentChunk,
  agentId: ID,
  task?: SubTask,
): void {
  if (chunk.type === 'text') {
    set(s =>
      patchMsg(s, convId, msgId, m => {
        if (m.content.kind !== 'text') return m;
        return { ...m, content: { kind: 'text', text: m.content.text + chunk.delta } };
      }),
    );
  } else if (chunk.type === 'code') {
    // 把 code 作为单独一条新消息追加
    set(s =>
      addMsg(s, convId, {
        id: uid('msg'),
        conversationId: convId,
        senderType: 'agent',
        senderId: agentId,
        content: {
          kind: 'code',
          language: chunk.language,
          code: chunk.code,
          filename: chunk.filename,
        },
        createdAt: Date.now(),
      }),
    );
  } else if (chunk.type === 'artifact-draft') {
    // 创建 / 更新 artifact 并发一条 artifact card 消息
    const existing = get().artifacts.find(a => a.conversationId === convId && a.name === chunk.name);
    let artifact: Artifact;
    if (existing) {
      const newVer: ArtifactVersion = {
        id: uid('ver'),
        artifactId: existing.id,
        version: existing.versions.length + 1,
        content: chunk.content,
        authorAgentId: agentId,
        commitMessage: chunk.commitMessage,
        createdAt: Date.now(),
      };
      const updated: Artifact = { ...existing, versions: [...existing.versions, newVer], latestVersionId: newVer.id };
      set(s => upsertArtifact(s, updated));
      artifact = updated;
      // 同步发 diff card
      const prev = existing.versions[existing.versions.length - 1];
      set(s =>
        addMsg(s, convId, {
          id: uid('msg'),
          conversationId: convId,
          senderType: 'agent',
          senderId: agentId,
          content: {
            kind: 'diff',
            diff: {
              artifactId: existing.id,
              fromVersionId: prev.id,
              toVersionId: newVer.id,
              hunks: diffLines(prev.content, chunk.content).slice(0, 200),
            },
          },
          createdAt: Date.now(),
        }),
      );
    } else {
      const artId = uid('art');
      const verId = uid('ver');
      artifact = {
        id: artId,
        conversationId: convId,
        type: chunk.artifactType as ArtifactType,
        name: chunk.name,
        language: chunk.language,
        latestVersionId: verId,
        versions: [
          {
            id: verId,
            artifactId: artId,
            version: 1,
            content: chunk.content,
            authorAgentId: agentId,
            commitMessage: chunk.commitMessage,
            createdAt: Date.now(),
          },
        ],
        createdBy: agentId,
        createdAt: Date.now(),
      };
      set(s => upsertArtifact(s, artifact));
    }
    // artifact card
    set(s =>
      addMsg(s, convId, {
        id: uid('msg'),
        conversationId: convId,
        senderType: 'agent',
        senderId: agentId,
        content: {
          kind: 'artifact',
          artifactId: artifact.id,
          versionId: artifact.latestVersionId,
          title: artifact.name,
          preview: chunk.content.slice(0, 180),
        },
        createdAt: Date.now(),
      }),
    );
    if (task) {
      task.producedArtifactId = artifact.id;
    }
  }
}
