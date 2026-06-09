import { create } from 'zustand';
import {
  createCustomAgent as apiCreateCustomAgent,
  createConversation as apiCreateConversation,
  postMessage as apiPostMessage,
  createArtifact as apiCreateArtifact,
  addArtifactVersion as apiAddArtifactVersion,
  rollbackArtifact as apiRollbackArtifact,
  deleteArtifact as apiDeleteArtifact,
  deleteArtifactVersion as apiDeleteArtifactVersion,
  createSkill as apiCreateSkill,
  triggerDeploy as apiTriggerDeploy,
  getDeployStatus as apiGetDeployStatus,
  listConversations as apiListConversations,
  listMessages as apiListMessages,
  listArtifacts as apiListArtifacts,
  getArtifact as apiGetArtifact,
  listSkills as apiListSkills,
} from '../api/client';
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
import { uid, sleep, genUuid } from '../utils/id';
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
  newAgentModalOpen: boolean;
  newAgentPrefill: string;
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
  sendUserMessage(convId: ID, text: string, mentions: ID[], replyToMessageId?: ID, attachedArtifactIds?: ID[]): Promise<void>;
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
    async sendUserMessage(convId, text, mentions, replyToMessageId, attachedArtifactIds) {
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

      // Persist user message (fire-and-forget)
      apiPostMessage(convId, {
        id: userMsg.id,
        senderType: 'user',
        senderId: 'user',
        content: userMsg.content,
        mentions,
        replyToMessageId,
      } as any).catch(err => console.warn('[persist] user message failed:', err.message));

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
          conversations: convs.sort((a, b) => b.lastActivityAt - a.lastActivityAt),
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

  // Persist final agent message to DB (fire-and-forget)
  const finalMsg = get().messagesByConv[convId]?.find(m => m.id === msgId);
  if (finalMsg && finalMsg.content.kind === 'text' && finalMsg.content.text) {
    apiPostMessage(convId, {
      id: finalMsg.id,
      senderType: 'agent',
      senderId: agentId,
      content: finalMsg.content,
    } as any).catch(err => console.warn('[persist] agent message failed:', err.message));
  }
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
    id: genUuid(),
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
      id: genUuid(),
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

// ── 流式文字缓冲器：累积 text delta 批量更新，减少 Zustand re-render ──
const textBuffer = new Map<ID, string>();
let flushScheduled = false;

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
    const existing = get().artifacts.find(a => a.conversationId === convId && a.name === chunk.name);
    let artifact: Artifact;
    if (existing) {
      const newVer: ArtifactVersion = {
        id: genUuid(),
        artifactId: existing.id,
        version: existing.versions.length + 1,
        content: chunk.content,
        authorAgentId: agentId,
        commitMessage: chunk.commitMessage,
        createdAt: Date.now(),
      };
      const updated: Artifact = { ...existing, versions: [...existing.versions, newVer], latestVersionId: newVer.id, _persistStatus: 'saving' };
      set(s => upsertArtifact(s, updated));
      artifact = updated;

      // Persist new artifact version to DB with status tracking
      apiAddArtifactVersion(existing.id, {
        id: newVer.id,
        content: newVer.content,
        authorAgentId: newVer.authorAgentId,
        commitMessage: newVer.commitMessage,
      } as any)
        .then(() => {
          const latest = get().artifacts.find(a => a.id === existing.id);
          if (latest) set(s => upsertArtifact(s, { ...latest, _persistStatus: 'saved' }));
        })
        .catch(err => {
          console.warn('[persist] artifact version failed:', err.message);
          const latest = get().artifacts.find(a => a.id === existing.id);
          if (latest) set(s => upsertArtifact(s, { ...latest, _persistStatus: 'error' }));
        });
      // 同步发 diff card
      const prev = existing.versions[existing.versions.length - 1];
      set(s =>
        addMsg(s, convId, {
          id: genUuid(),
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
      const artId = genUuid();
      const verId = genUuid();
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
              content: { kind: 'system', text: `⚠️ 产物 "${chunk.name}" 保存数据库失败：${err.message}。刷新页面后可能丢失。` },
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
