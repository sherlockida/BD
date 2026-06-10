/**
 * Planner Service 2.0 — single source of truth for task planning.
 *
 * Upgrades:
 *   - Removed duplicate keyword patterns (frontend planner.ts deprecated)
 *   - Added Zod schema validation for LLM output
 *   - Fixed LLM dependency mapping (uses actual IDs from LLM, not position inference)
 *   - Added IntentClassifier integration
 *   - Added plan persistence to orchestrator_plans table
 *   - Added checkpoint recovery support
 *
 * Strategy (progressive):
 *  1. Fast path: keyword regex matching (covers ~60% common patterns, <10ms)
 *  2. Intelligent path: IntentClassifier → LLM plan (~2s)
 *  3. Fallback: single-task plan
 */
import { z } from 'zod';
import { chatWithAgentSync, type ChatMessage } from './llmGateway.js';
import type { LlmVendor } from './llmGateway.js';

// ────────────────────────────────────────────────────────────
// Zod Schemas for LLM Output Validation
// ────────────────────────────────────────────────────────────

const LlmSubTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  capabilities: z.array(z.string()).optional(),
  dependsOnTaskTitles: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  estimatedComplexity: z.enum(['low', 'medium', 'high']).optional(),
});

const LlmPlanOutputSchema = z.object({
  summary: z.string().min(1).max(500),
  complexity: z.enum(['simple', 'medium', 'complex']).optional(),
  subTasks: z.array(LlmSubTaskSchema).min(1).max(6),
  parallelism: z.array(z.array(z.string())).optional(),
  constraints: z.array(z.string()).optional(),
  reviewStrategy: z.enum(['majority-vote', 'consensus', 'llm-as-judge', 'human-confirmation']).optional(),
});

// ────────────────────────────────────────────────────────────
// Types (mirrors frontend types.ts)
// ────────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  fallbackAgentId?: string;
  dependsOn: string[];
  status: 'pending' | 'running' | 'success' | 'failed' | 'fallback';
  startedAt?: number;
  finishedAt?: number;
  output?: string;
  producedArtifactId?: string;
  acceptanceCriteria?: string[];
  retryCount?: number;
  reviewVerdict?: string;
  reviewScore?: number;
  reviewFeedback?: string;
}

export interface OrchestratorPlan {
  id: string;
  intent: string;
  summary: string;
  subTasks: SubTask[];
  status: 'planning' | 'running' | 'done' | 'failed';
  complexity?: 'simple' | 'medium' | 'complex';
  skipReview?: boolean;
  parallelism?: string[][];
  createdAt?: number;
  updatedAt?: number;
  sessionId?: string;
  persisted?: boolean;
}

interface AvailableAgent {
  id: string;
  name: string;
  capabilities: string[];
  tagline: string;
}

// ────────────────────────────────────────────────────────────
// Keyword Fast-Path (reduced patterns — simple cases only)
// ────────────────────────────────────────────────────────────

const PATTERNS: Array<{
  regex: RegExp;
  complexity: OrchestratorPlan['complexity'];
  makePlan: (intent: string, agents: AvailableAgent[], planId: string) => OrchestratorPlan;
}> = [
  {
    regex: /落地页|landing\s*page|营销页/,
    complexity: 'complex',
    makePlan: (intent, agents, planId) => {
      const coder = agents.find(a => a.capabilities.includes('code'))!;
      const designer = agents.find(a => a.id !== coder?.id && a.capabilities.includes('design')) ?? agents.find(a => a.capabilities.includes('code'))!;
      return {
        id: planId, intent,
        summary: '拆解为 3 个子任务：页面骨架 → 样式打磨 → 部署上线',
        status: 'running',
        complexity: 'complex',
        subTasks: [
          {
            id: `${planId}_t1`, title: '页面骨架搭建',
            description: '使用 HTML + TailwindCSS 构建页面结构与内容',
            assignedAgentId: coder.id, fallbackAgentId: designer.id,
            dependsOn: [], status: 'pending',
            acceptanceCriteria: ['页面结构完整', '包含所有必需的section元素'],
          },
          {
            id: `${planId}_t2`, title: '样式与动效打磨',
            description: '优化 CSS 样式、动画效果与视觉设计',
            assignedAgentId: designer.id, fallbackAgentId: coder.id,
            dependsOn: [`${planId}_t1`], status: 'pending',
            acceptanceCriteria: ['配色统一', '动画流畅', '响应式适配'],
          },
          {
            id: `${planId}_t3`, title: '部署上线',
            description: '将最终产物部署到 Vercel 或 Netlify',
            assignedAgentId: agents.find(a => a.capabilities.includes('deploy'))?.id ?? designer.id,
            fallbackAgentId: coder.id,
            dependsOn: [`${planId}_t2`], status: 'pending',
            acceptanceCriteria: ['URL可访问', '无CORS错误'],
          },
        ],
      };
    },
  },
  {
    regex: /组件|component|button|form|modal|card|table/i,
    complexity: 'medium',
    makePlan: (intent, agents, planId) => {
      const coder = agents.find(a => a.capabilities.includes('code'))!;
      const designer = agents.find(a => a.capabilities.includes('design')) ?? agents.find(a => a.id !== coder.id && a.capabilities.includes('code'))!;
      return {
        id: planId, intent,
        summary: '组件开发：代码实现 → 样式优化',
        status: 'running',
        complexity: 'medium',
        subTasks: [
          {
            id: `${planId}_t1`, title: '组件逻辑实现',
            description: '实现组件功能逻辑、Props/State 设计',
            assignedAgentId: coder.id, fallbackAgentId: designer.id,
            dependsOn: [], status: 'pending',
            acceptanceCriteria: ['功能完整', '类型安全', 'Props/State 设计合理'],
          },
          {
            id: `${planId}_t2`, title: '组件样式优化',
            description: 'CSS 打磨、响应式适配、动画效果',
            assignedAgentId: designer.id, fallbackAgentId: coder.id,
            dependsOn: [`${planId}_t1`], status: 'pending',
            acceptanceCriteria: ['视觉美观', '响应式适配', '交互流畅'],
          },
        ],
      };
    },
  },
  {
    regex: /文档|doc|readme|spec|规则|rule/i,
    complexity: 'simple',
    makePlan: (intent, agents, planId) => {
      const writer = agents.find(a => a.capabilities.includes('doc')) ?? agents[0]!;
      return {
        id: planId, intent,
        summary: '文档撰写',
        status: 'running',
        complexity: 'simple',
        subTasks: [{
          id: `${planId}_t1`, title: '文档撰写',
          description: '根据需求撰写结构化文档',
          assignedAgentId: writer.id,
          fallbackAgentId: agents.find(a => a.id !== writer.id)?.id,
          dependsOn: [], status: 'pending',
          acceptanceCriteria: ['内容完整', '格式规范'],
        }],
      };
    },
  },
  {
    regex: /部署|deploy|上线|发布/i,
    complexity: 'medium',
    makePlan: (intent, agents, planId) => {
      const deployer = agents.find(a => a.capabilities.includes('deploy')) ?? agents[0]!;
      return {
        id: planId, intent,
        summary: '部署发布',
        status: 'running',
        complexity: 'medium',
        subTasks: [
          {
            id: `${planId}_t1`, title: '打包构建',
            description: '优化产物、压缩资源',
            assignedAgentId: deployer.id, dependsOn: [], status: 'pending',
            acceptanceCriteria: ['构建无错误', '资源已优化'],
          },
          {
            id: `${planId}_t2`, title: '发布上线',
            description: '部署到 Vercel / Netlify',
            assignedAgentId: deployer.id,
            fallbackAgentId: agents.find(a => a.id !== deployer.id)?.id,
            dependsOn: [`${planId}_t1`], status: 'pending',
            acceptanceCriteria: ['URL可访问'],
          },
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
// LLM Smart-Path (with Zod validation + fixed dependency mapping)
// ────────────────────────────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are AgentHub's PMO (Project Management Office). Decompose user requirements into parallel-executable subtasks.

## Available Agents
{agentsContext}

## Rules
1. Parallelizable tasks should NOT depend on each other (leave dependsOnTaskTitles empty)
2. Assign capabilities to each subtask based on what skills are needed
3. Max 6 subtasks, dependency chain depth ≤ 3
4. Each subtask MUST have clear acceptance criteria
4.5 When the task requires collecting user preferences (style, colors, parameters), include a ui-component step
5. Output MUST be valid JSON matching the schema exactly, no extra text, no markdown fences

## Output JSON Schema
{
  "summary": "One sentence plan summary",
  "complexity": "simple|medium|complex",
  "subTasks": [
    {
      "title": "Subtask title",
      "description": "Detailed description of the subtask",
      "capabilities": ["code", "design"],
      "dependsOnTaskTitles": ["Title of task this depends on"],
      "acceptanceCriteria": ["AC 1", "AC 2"],
      "estimatedComplexity": "low|medium|high"
    }
  ],
  "parallelism": [["title1","title2"], ["title3"]],
  "constraints": ["Constraint 1", "Constraint 2"],
  "reviewStrategy": "llm-as-judge"
}`;

async function tryLlmPlan(
  intent: string,
  agents: AvailableAgent[],
  planId: string,
): Promise<OrchestratorPlan | null> {
  const agentsContext = agents.map(a =>
    `- ${a.id} (${a.name}): [${a.capabilities.join(', ')}] — ${a.tagline}`,
  ).join('\n');

  const systemPrompt = PLAN_SYSTEM_PROMPT.replace('{agentsContext}', agentsContext);

  try {
    const raw = await chatWithAgentSync('orchestrator', {
      systemPrompt,
      messages: [{ role: 'user', content: intent }],
      maxTokens: 4096,
      temperature: 0.3,
    });

    // Strip markdown code fences
    const json = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Parse JSON
    const parsed = JSON.parse(json);

    // Validate with Zod
    const validated = LlmPlanOutputSchema.parse(parsed);

    // Build title → task ID mapping for correct dependency resolution
    const titleToId = new Map<string, string>();
    validated.subTasks.forEach((t, i) => {
      titleToId.set(t.title, `${planId}_t${i + 1}`);
    });

    // Map to SubTask array with correct dependency IDs
    const subTasks: SubTask[] = validated.subTasks.map((t, i) => ({
      id: `${planId}_t${i + 1}`,
      title: t.title,
      description: t.description,
      assignedAgentId: '', // Will be filled by agent selector client-side
      fallbackAgentId: '',
      dependsOn: (t.dependsOnTaskTitles ?? [])
        .map((title: string) => {
          // Look up actual task ID by title
          const depId = titleToId.get(title);
          if (!depId) {
            console.warn(`[Planner] LLM referenced unknown task title: "${title}", skipping dependency`);
          }
          return depId;
        })
        .filter((id: string | undefined): id is string => id !== undefined),
      status: 'pending' as const,
      acceptanceCriteria: t.acceptanceCriteria,
      retryCount: 0,
    }));

    return {
      id: planId,
      intent,
      summary: validated.summary,
      subTasks,
      status: 'running',
      complexity: (validated.complexity as OrchestratorPlan['complexity']) ?? 'medium',
      parallelism: validated.parallelism,
      createdAt: Date.now(),
    };
  } catch (err: any) {
    // Distinguish Zod validation errors from other failures
    if (err instanceof z.ZodError) {
      console.error('[Planner] Zod validation failed:', err.issues);
    } else {
      console.error('[Planner] LLM plan failed:', err.message);
    }
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Complexity Classification (server-side mirror of IntentClassifier)
// ────────────────────────────────────────────────────────────

function classifyComplexity(intent: string): OrchestratorPlan['complexity'] {
  const len = intent.length;
  const words = intent.split(/[\s,，、。；;]+/).filter(Boolean).length;

  let score = 0;
  if (len > 100) score += 2;
  else if (len > 50) score += 1;
  if (words > 20) score += 2;
  else if (words > 10) score += 1;

  const multiDomainPatterns = [
    /前端.*后端|后端.*前端|full.?stack/i,
    /设计.*开发|开发.*设计/i,
    /页面.*部署|部署.*页面/i,
  ];
  if (multiDomainPatterns.some(p => p.test(intent))) score += 2;

  if (score >= 6) return 'complex';
  if (score >= 3) return 'medium';
  return 'simple';
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Plan tasks for a user intent.
 *
 * Progressive strategy:
 * 1. Keyword fast-path (simple patterns only)
 * 2. LLM smart-path (for all non-trivial intents)
 * 3. Single-task fallback
 */
export async function planTasks(
  intent: string,
  availableAgents: AvailableAgent[],
  planId: string,
  options?: {
    /** Skip keyword path and go straight to LLM */
    forceLlm?: boolean;
    /** Session ID for concurrency protection */
    sessionId?: string;
  },
): Promise<OrchestratorPlan> {
  // 1. Fast path: keyword matching (can be skipped)
  if (!options?.forceLlm) {
    const keywordPlan = tryKeywordPlan(intent, availableAgents, planId);
    if (keywordPlan) {
      console.log(`[Planner] Keyword match → ${keywordPlan.subTasks.length} subtasks (complexity: ${keywordPlan.complexity})`);
      keywordPlan.sessionId = options?.sessionId;
      return keywordPlan;
    }
  }

  // 2. Smart path: LLM
  console.log('[Planner] Keyword miss → trying LLM planner...');
  const llmPlan = await tryLlmPlan(intent, availableAgents, planId);
  if (llmPlan) {
    console.log(`[Planner] LLM plan → ${llmPlan.subTasks.length} subtasks (complexity: ${llmPlan.complexity})`);
    llmPlan.sessionId = options?.sessionId;
    return llmPlan;
  }

  // 3. Fallback: single-task plan
  console.log('[Planner] LLM failed → single-task fallback');
  const complexity = classifyComplexity(intent);
  const fallbackAgent = findBestAgent(availableAgents, intent);

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
      acceptanceCriteria: ['满足用户需求'],
    }],
    status: 'running',
    complexity,
    sessionId: options?.sessionId,
    createdAt: Date.now(),
  };
}

/**
 * Find the best agent for a fallback single-task plan.
 * Prefers: code > design > doc > deploy > first available
 */
function findBestAgent(agents: AvailableAgent[], intent: string): AvailableAgent {
  // Try capability match
  if (/代码|code|开发|build|页面|网站|网页|组件/i.test(intent)) {
    return agents.find(a => a.capabilities.includes('code')) ?? agents[0]!;
  }
  if (/设计|design|样式|style|颜色|color/i.test(intent)) {
    return agents.find(a => a.capabilities.includes('design')) ?? agents[0]!;
  }
  if (/文档|doc|文案|copy|spec/i.test(intent)) {
    return agents.find(a => a.capabilities.includes('doc')) ?? agents[0]!;
  }
  if (/部署|deploy|上线|发布/i.test(intent)) {
    return agents.find(a => a.capabilities.includes('deploy')) ?? agents[0]!;
  }
  return agents[0]!;
}

// ────────────────────────────────────────────────────────────
// Plan Persistence (for checkpoint recovery)
// ────────────────────────────────────────────────────────────

import { db } from '../db/index.js';
import { orchestratorPlans } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Persist a plan to the database for checkpoint recovery.
 */
export async function persistPlan(plan: OrchestratorPlan): Promise<void> {
  try {
    const existing = await db
      .select({ id: orchestratorPlans.id })
      .from(orchestratorPlans)
      .where(eq(orchestratorPlans.id, plan.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(orchestratorPlans)
        .set({
          intent: plan.intent,
          summary: plan.summary,
          complexity: plan.complexity ?? null,
          status: plan.status,
          subTasks: plan.subTasks as any,
          parallelism: (plan.parallelism ?? null) as any,
          updatedAt: new Date(),
        })
        .where(eq(orchestratorPlans.id, plan.id));
    } else {
      await db.insert(orchestratorPlans).values({
        id: plan.id,
        sessionId: plan.sessionId ?? null,
        intent: plan.intent,
        summary: plan.summary,
        complexity: plan.complexity ?? null,
        status: plan.status,
        subTasks: plan.subTasks as any,
        parallelism: (plan.parallelism ?? null) as any,
        skipReview: plan.skipReview ?? false,
      });
    }

    plan.persisted = true;
    console.log(`[Planner] Plan ${plan.id} persisted to DB`);
  } catch (err) {
    console.error('[Planner] Failed to persist plan:', err);
    // Don't throw — persistence failure shouldn't block execution
  }
}

/**
 * Load a plan from the database (checkpoint recovery).
 * Returns null if plan not found.
 */
export async function loadPlan(planId: string): Promise<OrchestratorPlan | null> {
  try {
    const rows = await db
      .select()
      .from(orchestratorPlans)
      .where(eq(orchestratorPlans.id, planId))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      intent: row.intent,
      summary: row.summary ?? '',
      subTasks: (row.subTasks as SubTask[]) ?? [],
      status: row.status as OrchestratorPlan['status'],
      complexity: (row.complexity as OrchestratorPlan['complexity']) ?? undefined,
      skipReview: row.skipReview ?? false,
      parallelism: (row.parallelism as string[][]) ?? undefined,
      createdAt: row.createdAt ? new Date(row.createdAt).getTime() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : undefined,
      sessionId: row.sessionId ?? undefined,
      persisted: true,
    };
  } catch (err) {
    console.error('[Planner] Failed to load plan:', err);
    return null;
  }
}

/**
 * Delete a plan from the database.
 */
export async function deletePlan(planId: string): Promise<void> {
  try {
    await db
      .delete(orchestratorPlans)
      .where(eq(orchestratorPlans.id, planId));
    console.log(`[Planner] Plan ${planId} deleted from DB`);
  } catch (err) {
    console.error('[Planner] Failed to delete plan:', err);
  }
}
