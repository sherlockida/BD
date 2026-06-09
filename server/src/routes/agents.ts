import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { chatWithAgent, availableProviders, type LlmVendor } from '../services/llmGateway.js';
import { planTasks } from '../services/plannerService.js';
import { db, agents as agentsTable, loadCustomAgents, messages, conversations } from '../db/index.js';

export const agentsRouter = Router();

// ── Agent meta type ──
interface AgentMeta {
  id: string;
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  vendor: string;
  capabilities: string[];
  tagline: string;
  systemPrompt?: string;
  isCustom?: boolean;
  online: boolean;
}

// ── Built-in agents (hardcoded — never stored in DB) ──
const BUILT_IN_AGENTS: AgentMeta[] = [
  {
    id: 'agent_orchestrator',
    name: 'PMO',
    avatarEmoji: '📋',
    avatarColor: 'bg-blue-600',
    vendor: 'orchestrator',
    capabilities: ['plan'],
    tagline: '项目总管，负责拆解任务、分派调度、汇总复盘',
    systemPrompt: '你是 PMO，负责理解用户需求、拆解任务、在群聊中汇报进度。回复简洁、结构化、使用中文。',
    online: true,
  },
  {
    id: 'agent_claude_code',
    name: 'Claude Code',
    avatarEmoji: '🧠',
    avatarColor: 'bg-orange-500',
    vendor: 'claude-code',
    capabilities: ['code', 'plan', 'doc', 'design'],
    tagline: '严谨的全栈工程师，擅长 React/TS 组件设计与可维护代码',
    systemPrompt: '你是一位资深全栈工程师。写代码时：1) 使用现代最佳实践 2) 代码带注释 3) 输出完整可直接运行的文件 4) 先解释思路再写代码。',
    online: true,
  },
  {
    id: 'agent_codex',
    name: 'Codex',
    avatarEmoji: '🎨',
    avatarColor: 'bg-purple-500',
    vendor: 'codex',
    capabilities: ['code', 'design'],
    tagline: 'CSS 与动效高手，擅长样式打磨与视觉设计',
    systemPrompt: '你是一位 UI/UX 设计专家，擅长 CSS、动画与响应式设计。写样式时：1) 优先使用 TailwindCSS 2) 注重细节和交互体验 3) 确保移动端适配。',
    online: true,
  },
  {
    id: 'agent_open_code',
    name: 'OpenCode',
    avatarEmoji: '🔧',
    avatarColor: 'bg-green-500',
    vendor: 'open-code',
    capabilities: ['code', 'deploy'],
    tagline: 'DevOps 全栈，擅长部署流水线、CI/CD 配置',
    systemPrompt: '你是一位 DevOps 工程师，擅长部署、CI/CD、自动化脚本。回复简洁实用，给出可直接运行的配置和命令。',
    online: true,
  },
];

// ── In-memory agent registry: built-in + DB-loaded custom agents ──
const CUSTOM_AGENTS: AgentMeta[] = [];

/** Return merged agent list (built-in + custom) */
function allAgents(): AgentMeta[] {
  return [...BUILT_IN_AGENTS, ...CUSTOM_AGENTS];
}

/** Preload custom agents from DB into memory — call at startup */
export async function preloadCustomAgents(): Promise<void> {
  const loaded = await loadCustomAgents();
  CUSTOM_AGENTS.length = 0;
  CUSTOM_AGENTS.push(...loaded);
  console.log(`[Agents] Preloaded ${loaded.length} custom agents from DB`);
}

// GET /api/agents — list all available agents (built-in + DB custom)
agentsRouter.get('/', (_req, res) => {
  res.json(allAgents());
});

// GET /api/agents/providers — must be BEFORE /:id route
agentsRouter.get('/providers', (_req, res) => {
  res.json({ providers: availableProviders() });
});

// GET /api/agents/:id — get single agent meta
agentsRouter.get('/:id', (req, res) => {
  const agent = allAgents().find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// POST /api/agents/custom — create a custom agent (persisted to DB)
agentsRouter.post('/custom', async (req, res) => {
  try {
    const { name, tagline, capabilities, systemPrompt, avatarEmoji, avatarColor, userId } = req.body;
    if (!name || !tagline) {
      return res.status(400).json({ error: 'name and tagline are required' });
    }
    const id = `agent_custom_${uuid().slice(0, 8)}`;
    const agent: AgentMeta = {
      id,
      name,
      avatarEmoji: avatarEmoji ?? '🤖',
      avatarColor: avatarColor ?? 'bg-gray-500',
      vendor: 'custom' as const,
      capabilities: capabilities ?? ['code', 'doc'],
      tagline,
      systemPrompt: systemPrompt ?? '',
      isCustom: true,
      online: true,
    };

    // Persist to DB
    try {
      await db.insert(agentsTable).values({
        id: agent.id,
        name: agent.name,
        avatarEmoji: agent.avatarEmoji,
        avatarColor: agent.avatarColor,
        vendor: agent.vendor,
        capabilities: agent.capabilities,
        tagline: agent.tagline,
        systemPrompt: agent.systemPrompt ?? '',
        isCustom: true,
      }).onConflictDoUpdate({
        target: agentsTable.id,
        set: {
          name: agent.name,
          avatarEmoji: agent.avatarEmoji,
          avatarColor: agent.avatarColor,
          capabilities: agent.capabilities,
          tagline: agent.tagline,
          systemPrompt: agent.systemPrompt ?? '',
        },
      });
    } catch (dbErr: any) {
      console.warn('[Agents] DB persist failed (table may not exist yet):', dbErr.message);
    }

    // Add to in-memory registry
    CUSTOM_AGENTS.push(agent);
    res.status(201).json(agent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/chat — SSE streaming chat (real LLM)
agentsRouter.post('/chat', async (req, res) => {
  const { agentId, messages, userPrompt, systemPrompt } = req.body;

  // Validate agent exists
  const agentMeta = allAgents().find(a => a.id === agentId);
  if (!agentMeta) {
    res.status(404).json({ error: `Agent not found: ${agentId}` });
    return;
  }

  // Build message list
  const chatMessages = (messages ?? []).map((m: any) => ({
    role: m.role ?? (m.senderType === 'user' ? 'user' : 'assistant'),
    content: m.content?.text ?? m.content ?? '',
  }));

  // If userPrompt provided, append it
  if (userPrompt && chatMessages.length === 0) {
    chatMessages.push({ role: 'user', content: userPrompt });
  }

  if (chatMessages.length === 0) {
    res.status(400).json({ error: 'No messages or userPrompt provided' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // disable nginx buffering
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const vendor = agentMeta.vendor as LlmVendor;
    console.log(`[Chat] ${agentId} (${vendor}) ← "${userPrompt?.slice(0, 80) ?? chatMessages[0]?.content?.slice(0, 80)}"`);

    for await (const chunk of chatWithAgent(vendor, {
      systemPrompt: systemPrompt ?? agentMeta.systemPrompt,
      messages: chatMessages,
    })) {
      send(chunk);
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }
  } catch (err: any) {
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// POST /api/agents/plan — trigger PMO planning (LLM-driven)
agentsRouter.post('/plan', async (req, res) => {
  try {
    const { intent } = req.body;
    if (!intent) return res.status(400).json({ error: 'intent is required' });

    const availableAgents = allAgents()
      .filter(a => a.id !== 'agent_orchestrator')
      .map(a => ({
        id: a.id,
        name: a.name,
        capabilities: a.capabilities,
        tagline: a.tagline,
      }));

    const planId = uuid();
    const plan = await planTasks(intent, availableAgents, planId);

    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/ui-input — handle GenUI component user interaction
agentsRouter.post('/ui-input', async (req, res) => {
  try {
    const { conversationId, componentId, value } = req.body;
    if (!conversationId || !componentId) {
      return res.status(400).json({ error: 'conversationId and componentId are required' });
    }

    // Generate wakeup message
    const wakeupContent = `用户已对交互组件 ${componentId} 做出选择: ${JSON.stringify(value)}。请根据用户的选择继续完成未完成的任务。`;

    // Insert system message into conversation history
    await db.insert(messages).values({
      id: uuid(),
      conversationId,
      senderType: 'system',
      senderId: 'system',
      content: { kind: 'system', text: wakeupContent },
      createdAt: new Date(),
    });

    // Update conversation lastActivityAt
    await db.update(conversations)
      .set({ lastActivityAt: new Date() })
      .where(eq(conversations.id, conversationId));

    res.json({ success: true, message: 'UI input recorded, agent will resume' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
