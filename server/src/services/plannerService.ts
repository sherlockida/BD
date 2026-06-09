/**
 * LLM-driven Planner — decomposes user intent into a DAG of subtasks.
 *
 * Strategy (progressive):
 * 1. Fast path: keyword regex matching (covers ~80% common patterns, <100ms)
 * 2. Smart path: LLM with JSON Schema constrained output (~2s, handles novel intents)
 *
 * The OrchestratorPlan format matches the frontend types.ts for zero-transform consumption.
 */
import { chatWithAgentSync, type ChatMessage } from './llmGateway.js';
import type { LlmVendor } from './llmGateway.js';

// ────────────────────────────────────────────────────────────
// Types (mirrors frontend types.ts)
// ────────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  fallbackAgentId?: string;
  dependsOn: string[];          // DAG edges
  status: 'pending' | 'running' | 'success' | 'failed' | 'fallback';
  startedAt?: number;
  finishedAt?: number;
  output?: string;
  producedArtifactId?: string;
}

export interface OrchestratorPlan {
  id: string;
  intent: string;
  summary: string;
  subTasks: SubTask[];
  status: 'planning' | 'running' | 'done' | 'failed';
}

interface AvailableAgent {
  id: string;
  name: string;
  capabilities: string[];
  tagline: string;
}

// ────────────────────────────────────────────────────────────
// Keyword fast-path (from MVP, kept as fallback)
// ────────────────────────────────────────────────────────────

const PATTERNS: Array<{
  regex: RegExp;
  makePlan: (intent: string, agents: AvailableAgent[], planId: string) => OrchestratorPlan;
}> = [
  {
    regex: /落地页|landing\s*page|营销页|官网|首页/,
    makePlan: (intent, agents, planId) => {
      const claude = agents.find(a => a.capabilities.includes('code'))!;
      const codex = agents.find(a => a.id !== claude?.id && a.capabilities.includes('design')) ?? agents.find(a => a.capabilities.includes('code'))!;
      return {
        id: planId, intent, summary: '拆解为 3 个子任务：页面骨架 → 样式打磨 → 部署上线',
        status: 'running',
        subTasks: [
          { id: `${planId}_t1`, title: '页面骨架搭建', description: '使用 HTML + TailwindCSS 构建页面结构与内容', assignedAgentId: claude.id, fallbackAgentId: codex.id, dependsOn: [], status: 'pending' },
          { id: `${planId}_t2`, title: '样式与动效打磨', description: '优化 CSS 样式、动画效果与视觉设计', assignedAgentId: codex.id, fallbackAgentId: claude.id, dependsOn: [`${planId}_t1`], status: 'pending' },
        ],
      };
    },
  },
  {
    regex: /组件|component|react|button|form|modal|card|table/i,
    makePlan: (intent, agents, planId) => {
      const coder = agents.find(a => a.capabilities.includes('code'))!;
      return {
        id: planId, intent, summary: '单组件开发：代码实现 → 样式优化',
        status: 'running',
        subTasks: [
          { id: `${planId}_t1`, title: '组件逻辑实现', description: '实现组件功能逻辑、Props/State 设计', assignedAgentId: coder.id, fallbackAgentId: agents.find(a => a.id !== coder.id)!.id, dependsOn: [], status: 'pending' },
          { id: `${planId}_t2`, title: '组件样式优化', description: 'CSS 打磨、响应式适配', assignedAgentId: agents.find(a => a.capabilities.includes('design'))?.id ?? coder.id, fallbackAgentId: coder.id, dependsOn: [`${planId}_t1`], status: 'pending' },
        ],
      };
    },
  },
  {
    regex: /文档|doc|readme|spec|规则|rule/i,
    makePlan: (intent, agents, planId) => {
      const writer = agents.find(a => a.capabilities.includes('doc')) ?? agents[0]!;
      return {
        id: planId, intent, summary: '文档撰写',
        status: 'running',
        subTasks: [
          { id: `${planId}_t1`, title: '文档撰写', description: '根据需求撰写结构化文档', assignedAgentId: writer.id, dependsOn: [], status: 'pending' },
        ],
      };
    },
  },
  {
    regex: /部署|deploy|上线|发布/i,
    makePlan: (intent, agents, planId) => {
      const deployer = agents.find(a => a.capabilities.includes('deploy')) ?? agents[0]!;
      return {
        id: planId, intent, summary: '部署发布',
        status: 'running',
        subTasks: [
          { id: `${planId}_t1`, title: '打包构建', description: '优化产物、压缩资源', assignedAgentId: deployer.id, dependsOn: [], status: 'pending' },
          { id: `${planId}_t2`, title: '发布上线', description: '部署到 Vercel / Netlify', assignedAgentId: deployer.id, dependsOn: [`${planId}_t1`], status: 'pending' },
        ],
      };
    },
  },
];

function tryKeywordPlan(intent: string, agents: AvailableAgent[], planId: string): OrchestratorPlan | null {
  for (const { regex, makePlan } of PATTERNS) {
    if (regex.test(intent)) {
      return makePlan(intent, agents, planId);
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// LLM smart-path
// ────────────────────────────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `你是 AgentHub 的 PMO (项目总管)，负责将用户需求拆解为可并行执行的子任务 DAG。

## 可用 Agent
{agentsContext}

## 规则
1. 能并行的任务不要串行（dependsOn 留空数组）
2. 每个子任务指定一个 assignedAgentId，必须从上述可用 Agent 中选择
3. 每个子任务指定一个 fallbackAgentId（任意另一个 Agent）
4. 最多拆 6 个子任务，DAG 深度 ≤ 3
4.5 当任务需要收集用户偏好（如风格、颜色、数值参数）时，可在 plan 中包含 ui-component 步骤，让用户通过交互组件做选择而非反复打字
5. 每个子任务的 capability 必须是可用 Agent 实际拥有的
6. 输出严格符合 JSON 格式，不要包含任何额外文字

## 输出 JSON 格式
{
  "summary": "一句话总结任务拆解思路",
  "subTasks": [
    {
      "title": "子任务标题",
      "description": "子任务详细描述",
      "assignedAgentId": "agent_xxx",
      "fallbackAgentId": "agent_yyy",
      "dependsOn": []
    }
  ]
}`;

async function tryLlmPlan(
  intent: string,
  agents: AvailableAgent[],
  planId: string,
): Promise<OrchestratorPlan | null> {
  const agentsContext = agents.map(a =>
    `- ${a.id} (${a.name}): ${a.capabilities.join(', ')} — ${a.tagline}`,
  ).join('\n');

  const systemPrompt = PLAN_SYSTEM_PROMPT.replace('{agentsContext}', agentsContext);

  try {
    const raw = await chatWithAgentSync('orchestrator', {
      systemPrompt,
      messages: [{ role: 'user', content: intent }],
      maxTokens: 2048,
      temperature: 0.3,
    });

    // Parse JSON from LLM response (strip markdown code fences if present)
    const json = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const parsed = JSON.parse(json);

    const subTasks: SubTask[] = (parsed.subTasks ?? []).map((t: any, i: number) => ({
      id: `${planId}_t${i + 1}`,
      title: t.title ?? `Task ${i + 1}`,
      description: t.description ?? '',
      assignedAgentId: t.assignedAgentId ?? agents[0]!.id,
      fallbackAgentId: t.fallbackAgentId ?? agents.find(a => a.id !== t.assignedAgentId)?.id,
      dependsOn: (t.dependsOn ?? []).map((d: string, di: number) => `${planId}_t${di + 1}`),
      status: 'pending' as const,
    }));

    return {
      id: planId,
      intent,
      summary: parsed.summary ?? `已将意图拆解为 ${subTasks.length} 个子任务`,
      subTasks,
      status: 'running',
    };
  } catch (err: any) {
    console.error('[Planner] LLM plan failed:', err.message);
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Plan tasks for a user intent.
 * Tries keyword fast-path first, falls back to LLM smart-path.
 */
export async function planTasks(
  intent: string,
  availableAgents: AvailableAgent[],
  planId: string,
): Promise<OrchestratorPlan> {
  // 1. Fast path: keyword matching
  const keywordPlan = tryKeywordPlan(intent, availableAgents, planId);
  if (keywordPlan) {
    console.log(`[Planner] Keyword match → ${keywordPlan.subTasks.length} subtasks`);
    return keywordPlan;
  }

  // 2. Smart path: LLM
  console.log('[Planner] Keyword miss → trying LLM planner...');
  const llmPlan = await tryLlmPlan(intent, availableAgents, planId);
  if (llmPlan) {
    console.log(`[Planner] LLM plan → ${llmPlan.subTasks.length} subtasks`);
    return llmPlan;
  }

  // 3. Fallback: single-task plan
  console.log('[Planner] LLM failed → single-task fallback');
  const fallbackAgent = availableAgents[0]!;
  return {
    id: planId,
    intent,
    summary: `LLM 规划暂不可用，已将任务直接分配给 ${fallbackAgent.name}`,
    subTasks: [{
      id: `${planId}_t1`,
      title: '执行用户需求',
      description: intent,
      assignedAgentId: fallbackAgent.id,
      fallbackAgentId: availableAgents.find(a => a.id !== fallbackAgent.id)?.id,
      dependsOn: [],
      status: 'pending',
    }],
    status: 'running',
  };
}
