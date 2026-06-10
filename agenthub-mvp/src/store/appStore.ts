import { create } from 'zustand';
import {
  createCustomAgent as apiCreateCustomAgent,
  createConversation as apiCreateConversation,
  postMessage as apiPostMessage,
  createArtifact as apiCreateArtifact,
  addArtifactVersion as apiAddArtifactVersion,
  rollbackArtifact as apiRollbackArtifact,
  deleteArtifact as apiDeleteArtifact,
  deleteConversation as apiDeleteConversation,
  deleteArtifactVersion as apiDeleteArtifactVersion,
  createSkill as apiCreateSkill,
  triggerDeploy as apiTriggerDeploy,
  getDeployStatus as apiGetDeployStatus,
  listConversations as apiListConversations,
  listMessages as apiListMessages,
  listArtifacts as apiListArtifacts,
  getArtifact as apiGetArtifact,
  listSkills as apiListSkills,
  planTasks as apiPlanTasks,
  updateConversation as apiUpdateConversation,
} from '../api/client';
import type {
  Conversation,
  Message,
  Agent,
  Artifact,
  ArtifactVersion,
  Skill,
  ID,
  SelectionContext,
  OrchestratorPlan,
  SubTask,
  AgentChunk,
  ArtifactType,
  DeployStatus,
} from '../types';
import { uid, sleep, genUuid } from '../utils/id';
import { diffLines } from '../utils/diff';
import { agentRegistry } from '../agents/registry';
import { schedule, resumePausedTask, summarize, ORCHESTRATOR_META, inferCapabilities, reviewTask, generateCriticReport, getBlackboard, createBlackboard } from '../orchestrator';
import { selectAgent } from '../orchestrator/agentSelector';
import type { AgentSelectionContext } from '../orchestrator/agentSelector';
import type { ReviewResult } from '../orchestrator';

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
  newAgentModalOpen: boolean;
  newAgentPrefill: string;
  conflictModal: null | { artifactId: ID; baseVersionId: ID; theirVersionId: ID };

  // ── Actions: conversations ──
  createConversation(opts: { type: 'single' | 'group'; memberAgentIds: ID[]; title?: string }): Conversation;
  setActiveConversation(id: ID): void;
  archiveConversation(id: ID): void;
  pinConversation(id: ID): void;
  renameConversation(id: ID, title: string): void;
  deleteConversation(id: ID): void;
  togglePinMessage(messageId: ID): void;
  setArtifactPanelOpen(open: boolean): void;
  openArtifact(id: ID): void;
  setAgentMarketOpen(open: boolean): void;
  setSkillsDrawerOpen(open: boolean): void;
  setNewAgentModalOpen(open: boolean, prefill?: string): void;

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
  sendUserMessage(convId: ID, text: string, mentions: ID[], replyToMessageId?: ID, attachedArtifactIds?: ID[], selectionContext?: SelectionContext): Promise<void>;
  regenerateLastAgentMessage(convId: ID, agentId: ID): Promise<void>;
  triggerSlash(convId: ID, command: string): Promise<void>;

  // ── Actions: artifact ──
  rollbackArtifact(artifactId: ID, versionId: ID): void;
  applyDiff(artifactId: ID, fromVersionId: ID, toVersionId: ID): void;
  deleteArtifact(artifactId: ID): Promise<void>;
  deleteArtifactVersion(artifactId: ID, versionId: ID): Promise<void>;
  deployArtifact(artifactId: ID, convId: ID): Promise<void>;

  // ── Actions: skill ──
  distillSkill(opts: { name: string; trigger: string; description: string; steps: string[]; conversationId?: ID }): Skill;
  removeSkill(id: ID): void;

  // ── Actions: hydration ──
  hydrateFromBackend(): Promise<void>;

  // ── Actions: WebSocket event handlers ──
  handleWSMessage(convId: ID, raw: any): void;
  handleWSArtifact(artifactId: ID, version: any): void;
  handleWSDeployProgress(deployId: string, step: string, progress: number, url?: string): void;
}

// ── 内部：addMessage 工具 ──
const addMsg = (state: AppState, convId: ID, msg: Message): AppState => {
  // Fire-and-forget: persist to DB (skip streaming messages — they get persisted when streaming ends)
  if (!msg.streaming) {
    apiPostMessage(convId, {
      id: msg.id,
      senderType: msg.senderType,
      senderId: msg.senderId,
      content: msg.content,
      mentions: msg.mentions ?? [],
      replyToMessageId: msg.replyToMessageId,
    } as any).catch(err => console.warn('[persist] addMsg failed:', err.message));
  }

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

  // Detect streaming: true → false transition (before mutation, for TS clarity)
  const original = list.find(m => m.id === msgId);
  const wasStreaming = !!original?.streaming;

  const newList = list.map(m => (m.id === msgId ? patch(m) : m));

  // Fire-and-forget: when a streaming message transitions to non-streaming, persist final content
  if (wasStreaming) {
    const patched = newList.find(m => m.id === msgId);
    if (patched && !patched.streaming) {
      apiPostMessage(convId, {
        id: patched.id,
        senderType: patched.senderType,
        senderId: patched.senderId,
        content: patched.content,
        mentions: patched.mentions ?? [],
        replyToMessageId: patched.replyToMessageId,
      } as any).catch(err => console.warn('[persist] final message failed:', err.message));
    }
  }

  return {
    ...state,
    messagesByConv: {
      ...state.messagesByConv,
      [convId]: newList,
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
  const demoConvId = genUuid();
  const demoGroupConvId = genUuid();

  const welcomeMsgs: Message[] = [
    {
      id: genUuid(),
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
          id: genUuid(),
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
        id: genUuid(),
        name: '先 Spec 后 Code',
        trigger: '当任务包含"做一个 / 实现 / 开发"时',
        description: '在编码前先输出 Spec（背景/目标/验收标准），用户 Review 后再 Code，可减少 60% 返工。',
        steps: ['理解用户原始意图', '输出 Spec 草案', '用户 Review / 修订', '基于 Spec Code'],
        createdAt: Date.now(),
        source: 'manual',
      },
      {
        id: genUuid(),
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
    newAgentModalOpen: false,
    newAgentPrefill: '',
    conflictModal: null,

    // ─────────────────────────────────────────────────────
    createConversation({ type, memberAgentIds, title }) {
      const id = genUuid();   // real UUID — accepted by both frontend & backend
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
              id: genUuid(),
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
      // Persist to backend with our UUID — no ID swap needed
      apiCreateConversation({ type, title: titleAuto, memberAgentIds: members, id } as any)
        .catch(err => console.warn('[persist] createConversation failed:', err.message));
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

    pinConversation(id) {
      const conv = get().conversations.find(c => c.id === id);
      if (!conv) return;
      const newPinned = !conv.pinned;
      set(s => ({
        conversations: s.conversations.map(c =>
          c.id === id ? { ...c, pinned: newPinned } : c,
        ),
      }));
      apiUpdateConversation(id, { pinned: newPinned }).catch(err => {
        console.warn('[persist] pinConversation failed:', err.message);
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === id ? { ...c, pinned: !newPinned } : c,
          ),
        }));
        if (get().messagesByConv[id]) {
          set(s => addMsg(s, id, {
            id: genUuid(),
            conversationId: id,
            senderType: 'system',
            senderId: 'system',
            content: { kind: 'system', text: `⚠️ 置顶操作失败：${err.message}` },
            createdAt: Date.now(),
          }));
        }
      });
    },

    renameConversation(id, title) {
      const conv = get().conversations.find(c => c.id === id);
      if (!conv || !title.trim()) return;
      const oldTitle = conv.title;
      set(s => ({
        conversations: s.conversations.map(c =>
          c.id === id ? { ...c, title: title.trim() } : c,
        ),
      }));
      apiUpdateConversation(id, { title: title.trim() }).catch(err => {
        console.warn('[persist] renameConversation failed:', err.message);
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === id ? { ...c, title: oldTitle } : c,
          ),
        }));
      });
    },

    deleteConversation(id) {
      const conv = get().conversations.find(c => c.id === id);
      if (!conv) return;
      const snapshot = { conv, messages: get().messagesByConv[id] ?? [] };
      const wasActive = get().activeConversationId === id;
      set(s => {
        const { [id]: _, ...restMessages } = s.messagesByConv;
        const sorted = s.conversations.filter(c => c.id !== id).sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.lastActivityAt - a.lastActivityAt;
        });
        return {
          ...s,
          conversations: sorted,
          messagesByConv: restMessages,
          activeConversationId: wasActive ? (sorted[0]?.id ?? null) : s.activeConversationId,
        };
      });
      apiDeleteConversation(id).catch(err => {
        console.warn('[persist] deleteConversation failed:', err.message);
        set(s => ({
          conversations: [...s.conversations, snapshot.conv].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.lastActivityAt - a.lastActivityAt;
          }),
          messagesByConv: { ...s.messagesByConv, [id]: snapshot.messages },
          activeConversationId: s.activeConversationId ?? (wasActive ? id : s.activeConversationId),
        }));
        if (get().messagesByConv[id]) {
          set(s => addMsg(s, id, {
            id: genUuid(),
            conversationId: id,
            senderType: 'system',
            senderId: 'system',
            content: { kind: 'system', text: `⚠️ 删除对话失败：${err.message}` },
            createdAt: Date.now(),
          }));
        }
      });
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
    setNewAgentModalOpen(open, prefill) {
      set({ newAgentModalOpen: open, newAgentPrefill: prefill ?? '' });
    },

    // ─────────────────────────────────────────────────────
    createCustomAgent(opts) {
      const meta = agentRegistry.createCustom(opts);
      set(s => ({ agents: [...s.agents, meta] }));
      // Persist to backend (fire-and-forget, doesn't block UI)
      apiCreateCustomAgent({
        name: opts.name,
        tagline: opts.tagline,
        capabilities: opts.capabilities,
        systemPrompt: opts.systemPrompt,
        avatarEmoji: opts.avatarEmoji,
        avatarColor: opts.avatarColor,
      }).catch(e => console.warn('[AgentHub] Failed to persist custom agent to backend:', e));
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
              id: genUuid(),
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
    async sendUserMessage(convId, text, mentions, replyToMessageId, attachedArtifactIds, selectionContext) {
      const userMsg: Message = {
        id: genUuid(),
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
        await runSingleAgent(get, set, convId, targetAgentId, text, attachedArtifactIds, selectionContext);
      } else {
        await runOrchestrated(get, set, convId, text, attachedArtifactIds, selectionContext);
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
            id: genUuid(),
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
        const arg = cmd.replace(/^\/new-agent\s*/, '').trim();
        // Open modal pre-filled with the slash arg as a name hint;
        // user fills in tagline/capabilities/avatar/systemPrompt and confirms
        get().setNewAgentModalOpen(true, arg);
        return;
      }
      if (cmd.startsWith('/deploy')) {
        // 找最近一个 webpage artifact
        const convArts = get().artifacts.filter(a => a.conversationId === convId);
        const target = [...convArts].reverse().find(a => a.type === 'webpage') ?? convArts[convArts.length - 1];
        if (!target) {
          set(s =>
            addMsg(s, convId, {
              id: genUuid(),
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
          id: genUuid(),
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
        id: genUuid(),
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

      // Persist rollback to DB (server creates the new version with the target version's content)
      apiRollbackArtifact(artifactId, versionId)
        .catch(err => console.warn('[persist] rollbackArtifact failed:', err.message));
      // 在对应对话里追加一条系统消息
      set(s =>
        addMsg(s, art.conversationId, {
          id: genUuid(),
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

    async deleteArtifact(artifactId) {
      const art = get().artifacts.find(a => a.id === artifactId);
      if (!art) return;

      // Optimistic delete
      set(s => ({
        ...s,
        artifacts: s.artifacts.filter(a => a.id !== artifactId),
        activeArtifactId: s.activeArtifactId === artifactId ? null : s.activeArtifactId,
      }));

      try {
        await apiDeleteArtifact(artifactId);
      } catch (err: any) {
        // Rollback: restore artifact to state
        console.error('[persist] deleteArtifact failed:', err.message);
        set(s => upsertArtifact(s, { ...art, _persistStatus: 'error' }));
        set(s => addMsg(s, art.conversationId, {
          id: genUuid(),
          conversationId: art.conversationId,
          senderType: 'system',
          senderId: 'system',
          content: { kind: 'system', text: `⚠️ 删除产物 "${art.name}" 失败：${err.message}` },
          createdAt: Date.now(),
        }));
      }
    },

    async deleteArtifactVersion(artifactId, versionId) {
      const art = get().artifacts.find(a => a.id === artifactId);
      if (!art) return;
      const oldVersions = [...art.versions];

      // Optimistic delete
      const newVersions = art.versions.filter(v => v.id !== versionId);
      const newLatestId = newVersions.length > 0
        ? newVersions.reduce((a, b) => a.version > b.version ? a : b).id
        : '';
      set(s => upsertArtifact(s, { ...art, versions: newVersions, latestVersionId: newLatestId }));

      try {
        await apiDeleteArtifactVersion(artifactId, versionId);
      } catch (err: any) {
        // Rollback
        console.error('[persist] deleteArtifactVersion failed:', err.message);
        set(s => upsertArtifact(s, { ...art, versions: oldVersions }));
      }
    },

    async deployArtifact(artifactId, convId) {
      const art = get().artifacts.find(a => a.id === artifactId);
      if (!art) return;

      // Create initial deploy message card
      const msgId = genUuid();
      const msg: Message = {
        id: msgId,
        conversationId: convId,
        senderType: 'agent',
        senderId: 'agent_open_code',
        content: {
          kind: 'deploy',
          deploy: {
            id: '', // will be filled by backend response
            artifactId,
            step: 'building',
            progress: 5,
            message: '正在连接部署服务...',
            startedAt: Date.now(),
          },
        },
        createdAt: Date.now(),
      };
      set(s => addMsg(s, convId, msg));

      try {
        // Trigger real deployment via backend API
        const deployResult = await apiTriggerDeploy(artifactId);

        // Update deploy card with real deploy ID — WS handler will take over from here
        set(s =>
          patchMsg(s, convId, msgId, m => {
            if (m.content.kind !== 'deploy') return m;
            return {
              ...m,
              content: {
                ...m.content,
                deploy: {
                  ...m.content.deploy,
                  id: deployResult.id,
                  step: deployResult.step as DeployStatus['step'],
                  progress: deployResult.progress,
                  message: deployResult.message ?? '部署已启动',
                  ...(deployResult.url ? { url: deployResult.url } : {}),
                },
              },
            };
          }),
        );

        // Poll for final status as fallback (in case WS is not connected)
        // The WS handler will update in real-time; this is a safety net
        pollDeployStatus(deployResult.id, convId, msgId, set, get);

      } catch (err: any) {
        set(s =>
          patchMsg(s, convId, msgId, m => {
            if (m.content.kind !== 'deploy') return m;
            return {
              ...m,
              content: {
                ...m.content,
                deploy: {
                  ...m.content.deploy,
                  step: 'failed',
                  progress: 0,
                  message: `部署失败: ${err.message}`,
                  finishedAt: Date.now(),
                },
              },
            };
          }),
        );
      }
    },

    distillSkill(opts) {
      const sk: Skill = {
        id: genUuid(),
        name: opts.name,
        trigger: opts.trigger,
        description: opts.description,
        steps: opts.steps,
        createdAt: Date.now(),
        source: 'auto-distilled',
        conversationId: opts.conversationId,
      };
      set(s => ({ skills: [sk, ...s.skills] }));

      // Persist to DB (note: server schema uses triggerCondition, not trigger)
      apiCreateSkill({
        name: sk.name,
        triggerCondition: sk.trigger,
        description: sk.description,
        steps: sk.steps,
        source: 'auto-distilled',
        conversationId: opts.conversationId,
        id: sk.id,
      } as any).catch(err => console.warn('[persist] distillSkill failed:', err.message));

      return sk;
    },

    removeSkill(id) {
      set(s => ({ skills: s.skills.filter(x => x.id !== id) }));
    },

    // ─────────────────────────────────────────────────────
    // Hydration — pull existing data from backend on app mount
    async hydrateFromBackend() {
      try {
        const [serverConvs, serverArts, serverSkills] = await Promise.all([
          apiListConversations().catch(() => []),
          apiListArtifacts().catch(() => []),
          apiListSkills().catch(() => []),
        ]);

        if (!serverConvs || serverConvs.length === 0) {
          console.log('[hydrate] no conversations on backend, persisting local demo state to DB');

          // Persist local demo conversations to DB so artifact FK constraints pass
          const localConvs = get().conversations;
          if (localConvs.length > 0) {
            const persistResults = await Promise.allSettled(
              localConvs.map(c =>
                apiCreateConversation({
                  id: c.id,
                  type: c.type,
                  title: c.title,
                  memberAgentIds: c.memberAgentIds,
                } as any)
              ),
            );
            const succeeded = persistResults.filter(r => r.status === 'fulfilled').length;
            console.log(`[hydrate] persisted ${succeeded}/${localConvs.length} conversations to DB`);
          }

          // Mark existing local artifacts for persistence retry
          const localArts = get().artifacts;
          if (localArts.length > 0) {
            for (const art of localArts) {
              const latestVer = art.versions.reduce((a, b) => a.version > b.version ? a : b);
              apiCreateArtifact({
                id: art.id,
                versionId: latestVer.id,
                conversationId: art.conversationId,
                type: art.type,
                name: art.name,
                language: art.language,
                content: latestVer.content,
                authorAgentId: latestVer.authorAgentId,
                commitMessage: latestVer.commitMessage,
              } as any)
                .then(() => {
                  set(s => upsertArtifact(s, { ...get().artifacts.find(a => a.id === art.id)!, _persistStatus: 'saved' } as Artifact));
                })
                .catch(err => console.warn('[hydrate] artifact persist failed:', err.message));
            }
          }

          return;
        }

        // Map server conversations to local format
        const convs: Conversation[] = serverConvs.map(c => ({
          id: c.id,
          type: c.type as 'single' | 'group',
          title: c.title,
          memberAgentIds: c.memberAgentIds ?? [],
          pinnedMessageIds: c.pinnedMessageIds ?? [],
          archived: !!c.archived,
          lastActivityAt: new Date(c.lastActivityAt).getTime(),
          unread: 0,
        }));

        // Fetch messages for each conversation in parallel
        const messagesEntries = await Promise.all(
          convs.map(async c => {
            const r = await apiListMessages(c.id).catch(() => ({ messages: [] }));
            const msgs: Message[] = (r.messages ?? []).map(m => ({
              id: m.id,
              conversationId: m.conversationId,
              senderType: m.senderType,
              senderId: m.senderId,
              content: m.content as any,
              mentions: m.mentions ?? [],
              replyToMessageId: m.replyToMessageId ?? undefined,
              streaming: false,
              pinned: !!m.pinned,
              createdAt: new Date(m.createdAt).getTime(),
            }));
            return [c.id, msgs] as const;
          }),
        );

        // Hydrate artifacts (full version chains)
        const artsFull = await Promise.all(
          serverArts.map(async a => {
            const full = await apiGetArtifact(a.id).catch(() => null);
            if (!full) return null;
            const art: Artifact = {
              id: full.id,
              conversationId: full.conversationId ?? '',
              type: full.type as ArtifactType,
              name: full.name,
              language: full.language ?? undefined,
              latestVersionId: full.latestVersionId ?? '',
              versions: (full.versions ?? []).map(v => ({
                id: v.id,
                artifactId: v.artifactId,
                version: v.version,
                content: v.content,
                authorAgentId: v.authorAgentId,
                commitMessage: v.commitMessage,
                createdAt: new Date(v.createdAt).getTime(),
              })),
              createdBy: full.createdBy ?? 'unknown',
              createdAt: new Date(full.createdAt).getTime(),
            };
            return art;
          }),
        );

        const skillsLocal: Skill[] = serverSkills.map(s => ({
          id: s.id,
          name: s.name,
          trigger: s.triggerCondition,
          description: s.description ?? '',
          steps: s.steps ?? [],
          createdAt: new Date(s.createdAt).getTime(),
          source: (s.source as 'manual' | 'auto-distilled') ?? 'manual',
          conversationId: s.conversationId ?? undefined,
        }));

        set(s => ({
          conversations: convs.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.lastActivityAt - a.lastActivityAt;
          }),
          messagesByConv: Object.fromEntries(messagesEntries),
          artifacts: artsFull.filter(Boolean) as Artifact[],
          skills: skillsLocal.length > 0 ? skillsLocal : s.skills,
          activeConversationId: convs[0]?.id ?? null,
        }));

        console.log(`[hydrate] loaded ${convs.length} conversations, ${artsFull.length} artifacts, ${skillsLocal.length} skills`);
      } catch (err: any) {
        console.warn('[hydrate] failed:', err.message);
      }
    },

    // ─────────────────────────────────────────────────────
    // WebSocket event handlers — zero-intrusion real-time sync
    // ─────────────────────────────────────────────────────

    handleWSMessage(convId, raw) {
      const state = get();
      // Only process if this conversation is loaded (not stale)
      if (!state.messagesByConv[convId]) return;

      // Case 1: streaming delta (message.streaming event)
      if (raw.streaming && raw.delta) {
        set(s =>
          patchMsg(s, convId, raw.id, m => {
            if (m.content.kind !== 'text') return m;
            return {
              ...m,
              streaming: true,
              content: { kind: 'text', text: m.content.text + raw.delta },
            };
          }),
        );
        return;
      }

      // Case 2: full message (message.new event)
      if (raw.id && raw.senderType) {
        const msg: Message = {
          id: raw.id,
          conversationId: convId,
          senderType: raw.senderType,
          senderId: raw.senderId,
          content: raw.content as any,
          mentions: raw.mentions ?? [],
          replyToMessageId: raw.replyToMessageId ?? undefined,
          streaming: false,
          pinned: !!raw.pinned,
          createdAt: raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now(),
        };

        // Dedup — skip if already present
        const existing = state.messagesByConv[convId] ?? [];
        if (existing.some(m => m.id === msg.id)) return;

        set(s => addMsg(s, convId, msg));
        return;
      }
    },

    handleWSArtifact(artifactId, version) {
      // Refresh artifacts list from backend when a new version comes in
      // This is lazy: just re-fetch the full artifact to get the latest version chain
      apiGetArtifact(artifactId).then(full => {
        if (!full) return;
        const art: Artifact = {
          id: full.id,
          conversationId: full.conversationId ?? '',
          type: full.type as ArtifactType,
          name: full.name,
          language: full.language ?? undefined,
          latestVersionId: full.latestVersionId ?? '',
          versions: (full.versions ?? []).map(v => ({
            id: v.id,
            artifactId: v.artifactId,
            version: v.version,
            content: v.content,
            authorAgentId: v.authorAgentId,
            commitMessage: v.commitMessage,
            createdAt: new Date(v.createdAt).getTime(),
          })),
          createdBy: full.createdBy ?? 'unknown',
          createdAt: new Date(full.createdAt).getTime(),
        };
        set(s => upsertArtifact(s, art));

        // Auto-advance: if artifact panel is open and this artifact is the active one,
        // keep it highlighted so user sees the update
        const currentActive = get().activeArtifactId;
        if (currentActive === artifactId && get().artifactPanelOpen) {
          set(s => ({ ...s, activeArtifactId: artifactId }));
        }
      }).catch(err => console.warn('[WS] artifact refresh failed:', err.message));
    },

    handleWSDeployProgress(deployId, step, progress, url) {
      // Find the deploy message across all conversations and patch it
      const allConvs = get().messagesByConv;
      for (const [convId, msgs] of Object.entries(allConvs)) {
        const deployMsg = msgs.find(
          m => m.content.kind === 'deploy' && m.content.deploy.id === deployId,
        );
        if (!deployMsg || deployMsg.content.kind !== 'deploy') continue;

        set(s =>
          patchMsg(s, convId, deployMsg.id, m => {
            if (m.content.kind !== 'deploy') return m;
            return {
              ...m,
              content: {
                ...m.content,
                deploy: {
                  ...m.content.deploy,
                  step: step as DeployStatus['step'],
                  progress,
                  ...(url ? { url } : {}),
                  ...(step === 'live' || step === 'failed' ? { finishedAt: Date.now() } : {}),
                },
              },
            };
          }),
        );
        break; // only patch the first match (deploy IDs are unique)
      }
    },
  };
});

// ── Polling fallback for deploy status (when WS is not connected) ──
async function pollDeployStatus(
  deployId: string,
  convId: ID,
  msgId: ID,
  set: SetState,
  get: GetState,
): Promise<void> {
  const maxPolls = 30; // 1 minute at 2s intervals
  for (let i = 0; i < maxPolls; i++) {
    await sleep(2000);
    try {
      const status = await apiGetDeployStatus(deployId);
      set(s =>
        patchMsg(s, convId, msgId, m => {
          if (m.content.kind !== 'deploy') return m;
          return {
            ...m,
            content: {
              ...m.content,
              deploy: {
                ...m.content.deploy,
                step: status.step as DeployStatus['step'],
                progress: status.progress,
                message: status.message ?? m.content.deploy.message,
                ...(status.url ? { url: status.url } : {}),
                ...(status.step === 'live' || status.step === 'failed'
                  ? { finishedAt: status.finishedAt ? new Date(status.finishedAt).getTime() : Date.now() }
                  : {}),
              },
            },
          };
        }),
      );
      if (status.step === 'live' || status.step === 'failed') break;
    } catch {
      // continue polling on transient errors
    }
  }
}

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
  attachedArtifactIds?: ID[],
  selectionContext?: SelectionContext,
): Promise<void> {
  const agent = agentRegistry.get(agentId);
  if (!agent) return;

  // 创建一条流式 agent 消息
  const msgId = genUuid();
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

  // Build context artifacts from attached artifact IDs
  const contextArtifacts: Artifact[] | undefined = attachedArtifactIds?.length
    ? attachedArtifactIds.map(id => get().artifacts.find(a => a.id === id)).filter((a): a is Artifact => !!a)
    : undefined;

  // Enhance userPrompt with selection context marker
  let userPrompt = userText;
  if (selectionContext && contextArtifacts?.length) {
    const art = contextArtifacts[0];
    userPrompt += `\n\n## 用户已选择修改此产物 \`${art.name}\`\n` +
      `用户已选中以下区域，请重点修改此处:\n\`\`\`\n${selectionContext.selectedText.slice(0, 500)}\n\`\`\`\n` +
      `请输出完整文件，不要只输出修改的部分。`;
  }

  try {
    for await (const chunk of agent.chat({ conversation: conv, history, userPrompt, contextArtifacts })) {
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

async function runOrchestrated(
  get: GetState, set: SetState, convId: ID, userText: string,
  attachedArtifactIds?: ID[],
  selectionContext?: SelectionContext,
): Promise<void> {
  const conv = get().conversations.find(c => c.id === convId)!;
  const availableAgents = conv.memberAgentIds
    .map(id => get().agents.find(a => a.id === id))
    .filter((x): x is Agent => !!x && x.id !== 'agent_orchestrator');

  if (availableAgents.length === 0) {
    console.warn('[Orchestrator] No available agents for orchestration');
    return;
  }

  // Fix C: 构建上下文 artifacts + 增强 intent（选区标记）
  let contextArtifacts: Artifact[] | undefined;
  let enhancedIntent = userText;
  if (attachedArtifactIds?.length) {
    contextArtifacts = attachedArtifactIds
      .map(id => get().artifacts.find(a => a.id === id))
      .filter((a): a is Artifact => !!a);
  }
  if (selectionContext) {
    enhancedIntent += `\n\n> 用户框选了产物 "${selectionContext.artifactId}" 中的以下区域（偏移 ${selectionContext.startOffset ?? '?'}-${selectionContext.endOffset ?? '?'}）:\n> "${selectionContext.selectedText.slice(0, 300)}"\n> 请重点修改此处，输出完整文件，不要只输出修改的部分。`;
  }

  // 1) Plan via backend API (keyword fast-path + LLM smart-path, single source of truth)
  let plan: OrchestratorPlan;
  try {
    const raw = await apiPlanTasks(enhancedIntent);
    plan = raw as OrchestratorPlan;
    console.log(`[Orchestrator] Backend plan: ${plan.subTasks.length} tasks, complexity=${plan.complexity ?? 'unknown'}`);
  } catch (err) {
    console.warn('[Orchestrator] Backend planner unavailable, using local fallback:', err);
    const capResult = selectAgent({
      availableAgents,
      requiredCapabilities: [],
      activeTaskCounts: new Map(),
      performanceHistory: [],
      failurePenaltyMap: agentFailureCounts,
    });
    plan = {
      id: genUuid(),
      intent: userText,
      summary: '后端规划暂不可用，单Agent直接执行',
      subTasks: [{
        id: genUuid(),
        title: '响应用户请求',
        description: userText,
        assignedAgentId: capResult.selectedAgentId,
        fallbackAgentId: capResult.fallbackAgentId,
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: ['满足用户需求'],
        retryCount: 0,
      }],
      status: 'running',
      complexity: 'simple',
      createdAt: Date.now(),
    };
    // Notify user of degraded planning
    set(s => addMsg(s, convId, {
      id: genUuid(),
      conversationId: convId,
      senderType: 'system',
      senderId: 'system',
      content: { kind: 'system', text: '⚠️ 后端规划暂不可用，使用本地简化规划' },
      createdAt: Date.now(),
    }));
  }

  // 2) Fill in missing agent assignments
  const activeCounts = new Map<string, number>();
  const assignedSoFar: SubTask[] = [];
  for (const task of plan.subTasks) {
    const agentExists = task.assignedAgentId && availableAgents.some(a => a.id === task.assignedAgentId);
    if (!agentExists) {
      const caps = (plan.complexity === 'simple' || plan.complexity === undefined)
        ? []
        : inferCapabilities(task);
      const result = selectAgent({
        availableAgents,
        requiredCapabilities: caps.length > 0 ? caps : ['code'],
        activeTaskCounts: activeCounts,
        performanceHistory: [],
        currentPlanTasks: assignedSoFar,
        failurePenaltyMap: agentFailureCounts,
      });
      task.assignedAgentId = result.selectedAgentId;
      task.fallbackAgentId = result.fallbackAgentId;
      activeCounts.set(result.selectedAgentId, (activeCounts.get(result.selectedAgentId) ?? 0) + 1);
    }
    assignedSoFar.push(task);
  }

  // 3) PMO sends plan card to chat
  const planMsg: Message = {
    id: genUuid(),
    conversationId: convId,
    senderType: 'agent',
    senderId: 'agent_orchestrator',
    content: { kind: 'plan', plan: { ...plan, status: 'running' } },
    createdAt: Date.now(),
  };
  set(s => addMsg(s, convId, planMsg));

  // Track task → message mapping
  const taskToMsgId = new Map<string, ID>();
  // Phase 3: track paused tasks (taskId → UI component info)
  const pausedTasks = new Map<string, { agentId: string; component: string; props: Record<string, unknown> }>();
  // Phase 3: user inputs collected during session
  const userInputs = new Map<string, string>();
  // Track streaming char counts per task for real-time indicator
  const streamedCharCount = new Map<string, number>();

  // Fix C: include contextArtifacts so each Agent sees the full file being modified
  const scheduleCtx = {
    conversation: conv,
    history: get().messagesByConv[convId] ?? [],
    contextArtifacts,
  };

  // Init blackboard for this plan so snapshot is available later
  createBlackboard(plan.id, plan.subTasks.length);

  await schedule(plan, scheduleCtx, {
    onTaskStart(task: SubTask) {
      const m: Message = {
        id: genUuid(),
        conversationId: convId,
        senderType: 'agent',
        senderId: task.assignedAgentId,
        content: { kind: 'text', text: '' },
        createdAt: Date.now(),
        streaming: true,
      };
      taskToMsgId.set(task.id, m.id);
      set(s => addMsg(s, convId, m));
      updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
        ...p,
        subTasks: p.subTasks.map(t => (t.id === task.id ? { ...t, status: 'running', startedAt: Date.now() } : t)),
      }));
    },
    onTaskChunk(task: SubTask, chunk: AgentChunk) {
      const mid = taskToMsgId.get(task.id);
      if (!mid) return;
      if (chunk.type === 'text') {
        const prev = streamedCharCount.get(task.id) ?? 0;
        const next = prev + chunk.delta.length;
        streamedCharCount.set(task.id, next);
        // Throttle plan card updates for char count (every 15 chars)
        if (prev === 0 || next % 15 < chunk.delta.length || next - prev > 50) {
          updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
            ...p,
            subTasks: p.subTasks.map(t =>
              t.id === task.id ? { ...t, streamedChars: next } : t,
            ),
          }));
        }
      }
      handleChunkInto(get, set, convId, mid, chunk, task.assignedAgentId, task);
    },
    onTaskDone(task: SubTask, success: boolean, errMsg?: string) {
      const mid = taskToMsgId.get(task.id);
      if (mid) {
        set(s => patchMsg(s, convId, mid, m => ({ ...m, streaming: false })));
      }
      // Track agent failures for per-agent degradation
      if (!success && task.assignedAgentId) {
        agentFailureCounts.set(task.assignedAgentId, (agentFailureCounts.get(task.assignedAgentId) ?? 0) + 1);
        console.warn(`[Degradation] Agent ${task.assignedAgentId} failures: ${agentFailureCounts.get(task.assignedAgentId)}`);
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
      set(s =>
        addMsg(s, convId, {
          id: genUuid(),
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

    // ── Phase 3: GenUI pause handler ──
    onUiPause(task: SubTask, chunk: AgentChunk) {
      if (chunk.type !== 'ui-component') return;
      pausedTasks.set(task.id, {
        agentId: task.assignedAgentId,
        component: chunk.component,
        props: chunk.props,
      });
      // End streaming on the task's message so the UI component renders cleanly
      const mid = taskToMsgId.get(task.id);
      if (mid) {
        set(s => patchMsg(s, convId, mid, m => ({ ...m, streaming: false })));
      }
      // Update plan card to show waiting status
      updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
        ...p,
        subTasks: p.subTasks.map(t =>
          t.id === task.id ? { ...t, status: 'pending', output: `⏸️ 等待用户选择: ${chunk.component}` } : t,
        ),
      }));
      console.log(`[Orchestrator] Task "${task.title}" paused — awaiting user input (${chunk.component})`);
    },

    // ── Phase 3: GenUI resume handler ──
    onUiResume(task: SubTask, userInput: string) {
      // Restart streaming message
      const mid = taskToMsgId.get(task.id);
      if (mid) {
        set(s => patchMsg(s, convId, mid, m => ({ ...m, streaming: true, content: { kind: 'text', text: m.content.kind === 'text' ? m.content.text + `\n\n> 用户选择: ${userInput}\n\n` : `> 用户选择: ${userInput}\n\n` } })));
      }
      updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
        ...p,
        subTasks: p.subTasks.map(t =>
          t.id === task.id ? { ...t, status: 'running', output: undefined } : t,
        ),
      }));
    },
  });

  // ── Phase 3: Handle paused tasks — wait for user input then resume ──
  if (pausedTasks.size > 0) {
    console.log(`[Orchestrator] ${pausedTasks.size} task(s) paused, waiting for user input...`);

    // Build a user-friendly prompt asking for input on all paused tasks
    const pauseInfos: string[] = [];
    for (const [taskId, info] of pausedTasks) {
      const task = plan.subTasks.find(t => t.id === taskId);
      if (!task) continue;
      const componentMsg = formatUiComponentPrompt(info.component, info.props);
      pauseInfos.push(`**${task.title}** (${info.agentId}):\n${componentMsg}`);
    }

    // Post a system message asking user to respond
    const pauseMsg: Message = {
      id: genUuid(),
      conversationId: convId,
      senderType: 'system',
      senderId: 'system',
      content: {
        kind: 'system',
        text: `🔄 **多Agent协作暂停** — ${pausedTasks.size} 个任务需要你的决策：\n\n${pauseInfos.join('\n\n')}\n\n> 请直接回复你的选择，我会将你的决定传递给对应的Agent继续工作。`,
      },
      createdAt: Date.now(),
    };
    set(s => addMsg(s, convId, pauseMsg));

    // Set up a one-time listener for user reply
    // We store the pre-pause message count to detect new user messages
    const prePauseMsgIds = new Set((get().messagesByConv[convId] ?? []).map(m => m.id));

    // Poll for user response (max 30 min timeout for user interaction)
    const USER_INPUT_TIMEOUT_MS = 30 * 60 * 1000;
    const pollStart = Date.now();
    const POLL_INTERVAL_MS = 2000;

    while (pausedTasks.size > 0 && Date.now() - pollStart < USER_INPUT_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const currentMsgs = get().messagesByConv[convId] ?? [];
      const newUserMsgs = currentMsgs.filter(
        m => m.senderType === 'user' && m.content.kind === 'text' && !prePauseMsgIds.has(m.id),
      );

      if (newUserMsgs.length > 0) {
        // Collect user input from all new messages
        const userReply = newUserMsgs.map(m => m.content.kind === 'text' ? m.content.text : '').join('\n');
        prePauseMsgIds.add(newUserMsgs[0]!.id); // Mark as processed

        // Apply user input to all paused tasks (first reply unblocks all)
        const resumedTasks: SubTask[] = [];
        for (const [taskId] of pausedTasks) {
          const task = plan.subTasks.find(t => t.id === taskId);
          if (!task) continue;
          userInputs.set(taskId, userReply);
          resumedTasks.push(task);
        }

        // Resume each paused task with user input
        for (const task of resumedTasks) {
          pausedTasks.delete(task.id);
          console.log(`[Orchestrator] Resuming task "${task.title}" with user input: "${userReply.slice(0, 80)}"`);

          const ok = await resumePausedTask(
            task, plan, scheduleCtx, userReply,
            {
              onTaskStart(t) {}, // Already started
              onTaskChunk(t, chunk) {
                const mid = taskToMsgId.get(t.id);
                if (!mid) return;
                if (chunk.type === 'text') {
                  const prev = streamedCharCount.get(t.id) ?? 0;
                  const next = prev + chunk.delta.length;
                  streamedCharCount.set(t.id, next);
                  if (prev === 0 || next % 15 < chunk.delta.length || next - prev > 50) {
                    updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
                      ...p,
                      subTasks: p.subTasks.map(st =>
                        st.id === t.id ? { ...st, streamedChars: next } : st,
                      ),
                    }));
                  }
                }
                handleChunkInto(get, set, convId, mid, chunk, t.assignedAgentId, t);
              },
              onTaskDone(t, success, errMsg) {
                const mid = taskToMsgId.get(t.id);
                if (mid) {
                  set(s => patchMsg(s, convId, mid, m => ({ ...m, streaming: false })));
                }
                if (!success && t.assignedAgentId) {
                  agentFailureCounts.set(t.assignedAgentId, (agentFailureCounts.get(t.assignedAgentId) ?? 0) + 1);
                }
                updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({                  ...p,
                  subTasks: p.subTasks.map(st =>
                    st.id === t.id
                      ? { ...st, status: success ? 'success' : 'failed', finishedAt: Date.now(), output: errMsg }
                      : st,
                  ),
                }));
              },
              onFallback() {},
              onUiResume(t, input) {
                updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
                  ...p,
                  subTasks: p.subTasks.map(st =>
                    st.id === t.id ? { ...st, status: 'running', output: `用户选择: ${input.slice(0, 100)}` } : st,
                  ),
                }));
              },
            },
          );

          if (ok) {
            // Now run downstream tasks that were waiting on this one
            const readyDownstream = plan.subTasks.filter(t =>
              t.status === 'pending' &&
              t.dependsOn.every(d => plan.subTasks.find(st => st.id === d)?.status === 'success' ||
                                     plan.subTasks.find(st => st.id === d)?.status === 'fallback'),
            );
            for (const dt of readyDownstream) {
              const dtAgent = agentRegistry.get(dt.assignedAgentId);
              if (!dtAgent) continue;
              console.log(`[Orchestrator] Triggering downstream task "${dt.title}" after resume`);

              // Create message for this downstream task
              const dm: Message = {
                id: genUuid(),
                conversationId: convId,
                senderType: 'agent',
                senderId: dt.assignedAgentId,
                content: { kind: 'text', text: '' },
                createdAt: Date.now(),
                streaming: true,
              };
              taskToMsgId.set(dt.id, dm.id);
              set(s => addMsg(s, convId, dm));
              updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
                ...p,
                subTasks: p.subTasks.map(st => (st.id === dt.id ? { ...st, status: 'running', startedAt: Date.now() } : st)),
              }));

              // Run the downstream task
              await schedule(
                { ...plan, subTasks: [dt], status: 'running' },
                scheduleCtx,
                {
                  onTaskStart() {},
                  onTaskChunk(t, chunk) {
                    const mid = taskToMsgId.get(t.id);
                    if (!mid) return;
                    handleChunkInto(get, set, convId, mid, chunk, t.assignedAgentId, t);
                  },
                  onTaskDone(t, success, errMsg) {
                    const mid = taskToMsgId.get(t.id);
                    if (mid) set(s => patchMsg(s, convId, mid, m => ({ ...m, streaming: false })));
                    if (!success && t.assignedAgentId) {
                      agentFailureCounts.set(t.assignedAgentId, (agentFailureCounts.get(t.assignedAgentId) ?? 0) + 1);
                    }
                    updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
                      ...p,
                      subTasks: p.subTasks.map(st =>
                        st.id === t.id
                          ? { ...st, status: success ? 'success' : 'failed', finishedAt: Date.now(), output: errMsg }
                          : st,
                      ),
                    }));
                  },
                  onFallback() {},
                },
                { taskTimeoutMs: 120000, planTimeoutMs: 600000 },
              );
            }
          }
        }
        break; // Processed user input — exit poll loop
      }
    }

    // Handle timeout: auto-proceed with defaults
    if (pausedTasks.size > 0) {
      for (const [taskId] of pausedTasks) {
        const task = plan.subTasks.find(t => t.id === taskId);
        if (!task) continue;
        const defaultChoice = '默认选项';
        userInputs.set(taskId, defaultChoice);
        // Mark as degraded — auto-proceeded
        updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
          ...p,
          subTasks: p.subTasks.map(st =>
            st.id === task.id ? { ...st, status: 'fallback', output: '⏰ 用户超时无响应，自动使用默认选项继续' } : st,
          ),
        }));
        set(s =>
          addMsg(s, convId, {
            id: genUuid(),
            conversationId: convId,
            senderType: 'system',
            senderId: 'system',
            content: { kind: 'system', text: `⏰ 等待超时 — "${task.title}" 将使用默认选项自动继续。` },
            createdAt: Date.now(),
          }),
        );
      }
    }
  }

  // 4) PMO writes summary (Phase 3: handle paused status in summary)
  const final = get().messagesByConv[convId]?.find(m => m.id === planMsg.id);
  const planAfter =
    final && final.content.kind === 'plan'
      ? final.content.plan
      : { ...plan, status: 'done' as const };

  // ── Phase 4: Critic Review ──
  // Review all completed tasks' outputs against acceptance criteria
  const reviewResults: ReviewResult[] = [];
  for (const task of planAfter.subTasks) {
    if (task.status !== 'success' && task.status !== 'fallback') continue;

    let output = task.output ?? '';
    let artifactContent: string | undefined;
    let artifactType: ArtifactType | undefined;

    if (task.producedArtifactId) {
      const artifact = get().artifacts.find(a => a.id === task.producedArtifactId);
      if (artifact) {
        const latestVer = artifact.versions[artifact.versions.length - 1];
        if (latestVer) {
          artifactContent = latestVer.content;
          artifactType = artifact.type;
          output = output || latestVer.content.slice(0, 500);
        }
      }
    }

    if (!output && !artifactContent) continue;

    try {
      const result = await reviewTask(plan.id, task, output, {
        artifactContent,
        artifactType,
      });

      reviewResults.push(result);

      // Store review verdicts back into the plan card
      updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
        ...p,
        subTasks: p.subTasks.map(t =>
          t.id === task.id
            ? { ...t, reviewVerdict: result.verdict, reviewScore: result.score, reviewFeedback: result.feedback }
            : t,
        ),
      }));
    } catch (e: any) {
      console.warn(`[Critic] Review failed for task "${task.title}":`, e?.message ?? e);
    }
  }

  // Generate critic report from all reviews
  const criticReport = reviewResults.length > 0 ? generateCriticReport(reviewResults) : undefined;

  // ── Summary ──
  const hasPaused = planAfter.subTasks.some(t => t.status === 'paused' || t.status === 'pending');
  const summary = summarize({
    ...planAfter,
    status: hasPaused ? 'running' : planAfter.status,
  });

  // Build critic section for summary message
  let criticSection = '';
  if (criticReport) {
    const lines: string[] = [
      `\n\n📊 **质量评审** — 综合评分: ${(criticReport.overallScore * 100).toFixed(0)}%`,
    ];
    if (criticReport.codeQuality !== undefined) {
      lines.push(`  · 代码质量: ${(criticReport.codeQuality * 100).toFixed(0)}%`);
    }
    if (criticReport.security !== undefined) {
      lines.push(`  · 安全检查: ${criticReport.security}`);
    }
    if (criticReport.suggestions.length > 0) {
      lines.push(`  · 改进建议:`);
      criticReport.suggestions.slice(0, 3).forEach(s => lines.push(`    - ${s.split('\n')[0]}`));
    }
    if (criticReport.overallScore < 0.5) {
      const rejectList = reviewResults.filter(r => r.verdict === 'rejected' || r.score < 0.5);
      lines.push(`\n⚠️ **需要人工介入** — 以下产物未通过审查:`);
      rejectList.forEach(r => {
        const taskName = planAfter.subTasks.find(t => t.id === r.taskId)?.title ?? r.taskId;
        lines.push(`  · **${taskName}** (${(r.score * 100).toFixed(0)}分)`);
        lines.push(`    ${r.feedback.slice(0, 120)}`);
      });
    }
    criticSection = lines.join('\n');
  }

  const summaryPrefix = hasPaused
    ? '⏸️ **部分任务等待用户决策** — 请回复你的选择后 Agent 将继续工作。\n\n'
    : '';

  set(s =>
    addMsg(s, convId, {
      id: genUuid(),
      conversationId: convId,
      senderType: 'agent',
      senderId: 'agent_orchestrator',
      content: { kind: 'text', text: `🧭 **PMO 周报**\n\n${summaryPrefix}${summary}${criticSection}` },
      createdAt: Date.now(),
    }),
  );
  // Update plan card status
  updatePlanCard(get, set, convId, planMsg.id, plan.id, p => ({
    ...p,
    status: hasPaused ? 'running' : (planAfter.subTasks.every(t => t.status === 'success' || t.status === 'fallback') ? 'done' : 'failed'),
  }));

  // Post blackboard snapshot as an inline chat card
  const board = getBlackboard(plan.id);
  if (board) {
    set(s =>
      addMsg(s, convId, {
        id: genUuid(),
        conversationId: convId,
        senderType: 'agent',
        senderId: 'agent_orchestrator',
        content: { kind: 'blackboard', board },
        createdAt: Date.now(),
      }),
    );
  }
}

/** Format a GenUI component into a human-readable prompt */
function formatUiComponentPrompt(component: string, props: Record<string, unknown>): string {
  const title = (props.title as string) ?? '请选择';
  const options = (props.options as Array<{ id: string; label: string; description?: string }>) ?? [];
  const lines = [`> ${title}`];
  for (const opt of options) {
    lines.push(`  • **${opt.label}** — ${opt.description ?? ''}`);
  }
  return lines.join('\n');
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

// ── 流式文字缓冲器：累积 text delta 批量更新，减少 Zustand re-render ──
const textBuffer = new Map<ID, string>();
let flushScheduled = false;

// ── Per-agent degradation tracking ──
const agentFailureCounts = new Map<string, number>();

function flushTextBuffer(set: SetState, convId: ID, msgId: ID) {
  const delta = textBuffer.get(msgId);
  if (delta === undefined || delta === '') return;
  textBuffer.delete(msgId);
  set(s =>
    patchMsg(s, convId, msgId, m => {
      if (m.content.kind !== 'text') return m;
      return { ...m, content: { kind: 'text', text: m.content.text + delta } };
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
    // 缓冲 text delta，rAF 批量刷新（最多 16ms 延迟 = 60fps）
    const existing = textBuffer.get(msgId) ?? '';
    textBuffer.set(msgId, existing + chunk.delta);
    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(() => {
        flushScheduled = false;
        // 刷新所有缓冲的消息
        for (const [mid] of textBuffer) {
          flushTextBuffer(set, convId, mid);
        }
      });
    }
  } else {
    // 非 text chunk 到达前先 flush 文字缓冲
    flushTextBuffer(set, convId, msgId);
    if (chunk.type === 'code') {
    // 把 code 作为单独一条新消息追加
    set(s =>
      addMsg(s, convId, {
        id: genUuid(),
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
    let dedupName: string | undefined;
    const existing = get().artifacts.find(a => a.conversationId === convId && a.name === chunk.name);

    // Fix D: 同轮去重 — 同一 orchestration round 内不同Agent产生同名artifact时用后缀区分
    // 而不是追加版本（避免 v6→v11 版本激增）
    if (existing) {
      const isRecentDuplicate = Date.now() - existing.createdAt < 5 * 60 * 1000;
      const isDifferentAgent = existing.createdBy !== agentId;
      if (isRecentDuplicate && isDifferentAgent && existing.versions.length <= 2) {
        const dotIdx = chunk.name.lastIndexOf('.');
        const base = dotIdx > 0 ? chunk.name.slice(0, dotIdx) : chunk.name;
        const ext = dotIdx > 0 ? chunk.name.slice(dotIdx) : '';
        const agentSuffix = agentId.replace('agent_', '').replace(/_/g, '-');
        dedupName = `${base}-${agentSuffix}${ext}`;
      }
    }

    // If dedup is active, check for existing under the dedup name too
    const matchName = dedupName ?? chunk.name;
    const matchedExisting = dedupName
      ? (get().artifacts.find(a => a.conversationId === convId && a.name === dedupName) ?? existing)
      : existing;

    let artifact: Artifact;
    if (matchedExisting && (matchedExisting.name === chunk.name || matchedExisting.name === dedupName)) {
      const newVer: ArtifactVersion = {
        id: genUuid(),
        artifactId: matchedExisting.id,
        version: matchedExisting.versions.length + 1,
        content: chunk.content,
        authorAgentId: agentId,
        commitMessage: chunk.commitMessage,
        createdAt: Date.now(),
      };
      const updated: Artifact = { ...matchedExisting, versions: [...matchedExisting.versions, newVer], latestVersionId: newVer.id, _persistStatus: 'saving' };
      set(s => upsertArtifact(s, updated));
      artifact = updated;

      // Persist new artifact version to DB with status tracking
      apiAddArtifactVersion(matchedExisting.id, {
        id: newVer.id,
        content: newVer.content,
        authorAgentId: newVer.authorAgentId,
        commitMessage: newVer.commitMessage,
      } as any)
        .then(() => {
          const latest = get().artifacts.find(a => a.id === matchedExisting.id);
          if (latest) set(s => upsertArtifact(s, { ...latest, _persistStatus: 'saved' }));
        })
        .catch(err => {
          console.warn('[persist] artifact version failed:', err.message);
          const latest = get().artifacts.find(a => a.id === matchedExisting.id);
          if (latest) set(s => upsertArtifact(s, { ...latest, _persistStatus: 'error' }));
        });
      // 同步发 diff card
      const prev = matchedExisting.versions[matchedExisting.versions.length - 1];
      set(s =>
        addMsg(s, convId, {
          id: genUuid(),
          conversationId: convId,
          senderType: 'agent',
          senderId: agentId,
          content: {
            kind: 'diff',
            diff: {
              artifactId: matchedExisting.id,
              fromVersionId: prev.id,
              toVersionId: newVer.id,
              hunks: diffLines(prev.content, chunk.content).slice(0, 200),
            },
          },
          createdAt: Date.now(),
        }),
      );
    } else {
      const artId = genUuid();
      const verId = genUuid();
      artifact = {
        id: artId,
        conversationId: convId,
        type: chunk.artifactType as ArtifactType,
        name: matchName,
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
        _persistStatus: 'saving' as const,
      };
      set(s => upsertArtifact(s, artifact));

      // Persist new artifact + initial version to DB with status tracking
      apiCreateArtifact({
        id: artId,
        versionId: verId,
        conversationId: convId,
        type: chunk.artifactType,
        name: chunk.name,
        language: chunk.language,
        content: chunk.content,
        authorAgentId: agentId,
        commitMessage: chunk.commitMessage,
      } as any)
        .then(() => {
          const art = get().artifacts.find(a => a.id === artId);
          if (art) set(s => upsertArtifact(s, { ...art, _persistStatus: 'saved' }));
        })
        .catch(err => {
          console.warn('[persist] artifact create failed:', err.message);
          const art = get().artifacts.find(a => a.id === artId);
          if (art) {
            set(s => upsertArtifact(s, { ...art, _persistStatus: 'error' }));
            set(s => addMsg(s, convId, {
              id: genUuid(),
              conversationId: convId,
              senderType: 'system',
              senderId: 'system',
              content: { kind: 'system', text: `⚠️ 产物 "${matchName}" 保存数据库失败：${err.message}。刷新页面后可能丢失。` },
              createdAt: Date.now(),
            }));
          }
        });
    }
    // artifact card
    set(s =>
      addMsg(s, convId, {
        id: genUuid(),
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
    // 自动打开右侧面板 + 定位到这个 artifact，
    // 否则用户要手动找"产物 (N)" 按钮才能看到代码/Diff/预览（T4/T5/T6）
    set(s => ({
      ...s,
      activeArtifactId: artifact.id,
      artifactPanelOpen: true,
    }));
    if (task) {
      task.producedArtifactId = artifact.id;
    }
  }
  }
}
