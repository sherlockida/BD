/**
 * Orchestrator Supervisor — LLM-powered dynamic orchestrator.
 *
 * Replaces the static scheduler with intelligent task decomposition,
 * agent assignment, progress monitoring, and dynamic replanning.
 *
 * Key responsibilities:
 *   - Plan: Dynamic task decomposition via LLM (not keyword templates)
 *   - Assign: Load-aware agent selection with history tracking
 *   - Monitor: Real-time progress tracking + stall detection
 *   - Intervene: Replan on stall/low quality
 *   - Coordinate: Blackboard-based agent communication
 */
import type {
  OrchestratorPlan,
  SubTask,
  Agent,
  AgentCapability,
  AgentPerformanceRecord,
  IntentClassification,
} from '../types';
import { classifyIntent, type ClassifyResult } from './classifier';
import { selectAgent, selectAgentsForPlan, type AgentSelectionContext } from './agentSelector';
import { createBlackboard, addFact, addDecision, addConstraint, updateProgress, generateBlackboardSummary } from './blackboard';
import { recordTrace, withTrace } from './trace';
import { startTracking, recordTokenOutput, recordArtifactOutput, checkStall, stopTracking } from './stallDetector';
import { registerSagaOperation, markSagaExecuted, compensate } from './saga';

// ────────────────────────────────────────────────────────────
// Supervisor System Prompt
// ────────────────────────────────────────────────────────────

export const SUPERVISOR_SYSTEM_PROMPT = `You are the Orchestrator Supervisor of a multi-agent team (PMO).

## Your Capabilities
- Decompose user requirements into parallel-executable subtasks
- Assign tasks to agents based on their expertise
- Monitor execution progress and adjust plans when needed
- Synthesize multi-stream results and resolve conflicts

## Your Constraints
- Maximum 6 subtasks (prevent over-decomposition)
- Dependency chain depth ≤ 3
- Prioritize parallel execution of independent subtasks
- Every subtask MUST have clear Acceptance Criteria (AC)
- Each subtask must specify required capabilities

## Available Agents
{agentsContext}

## Output Format (JSON only, no markdown fences)
{
  "summary": "One-sentence plan summary",
  "complexity": "simple|medium|complex",
  "subTasks": [
    {
      "title": "Task title",
      "description": "Detailed task description",
      "capabilities": ["code", "design"],
      "dependsOnTaskTitles": [],
      "acceptanceCriteria": ["AC1", "AC2"],
      "estimatedComplexity": "low|medium|high"
    }
  ],
  "parallelism": [["title1","title2"], ["title3"]],
  "constraints": ["Must work on mobile", "Use brand color #6B8E23"],
  "reviewStrategy": "llm-as-judge"
}`;

// ────────────────────────────────────────────────────────────
// Supervisor State
// ────────────────────────────────────────────────────────────

export interface SupervisorState {
  planId: string;
  sessionId: string;
  classification: IntentClassification;
  availableAgents: Agent[];
  performanceHistory: AgentPerformanceRecord[];
  activeTaskCounts: Map<string, number>;
  plan?: OrchestratorPlan;
  isRunning: boolean;
  startedAt: number;
  maxRevisionRounds: number;
  currentRevisionRound: number;
}

// ────────────────────────────────────────────────────────────
// LLM-based Plan Generation
// ────────────────────────────────────────────────────────────

interface LlmPlanInput {
  title: string;
  description: string;
  capabilities: string[];
  dependsOnTaskTitles: string[];
  acceptanceCriteria: string[];
  estimatedComplexity: string;
}

interface LlmPlanOutput {
  summary: string;
  complexity: string;
  subTasks: LlmPlanInput[];
  parallelism: string[][];
  constraints: string[];
  reviewStrategy: string;
}

/**
 * Generate a plan via LLM. The llmCall parameter abstracts the actual LLM invocation.
 */
export async function generatePlanViaLlm(
  intent: string,
  agents: Agent[],
  planId: string,
  llmCall: (systemPrompt: string, userMessage: string, maxTokens: number) => Promise<string>,
): Promise<OrchestratorPlan | null> {
  const agentsContext = agents.map(a =>
    `- ${a.id} (${a.name}): [${a.capabilities.join(', ')}] — ${a.tagline}`,
  ).join('\n');

  const systemPrompt = SUPERVISOR_SYSTEM_PROMPT.replace('{agentsContext}', agentsContext);

  try {
    const raw = await llmCall(systemPrompt, intent, 4096);
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed: LlmPlanOutput = JSON.parse(cleaned);

    // Map task title → task ID for dependsOn resolution
    const titleToId = new Map<string, string>();
    parsed.subTasks.forEach((_, i) => {
      titleToId.set(parsed.subTasks[i]!.title, `${planId}_t${i + 1}`);
    });

    const subTasks: SubTask[] = parsed.subTasks.map((t, i) => ({
      id: `${planId}_t${i + 1}`,
      title: t.title ?? `Task ${i + 1}`,
      description: t.description ?? '',
      assignedAgentId: '', // Will be filled by selectAgentsForPlan
      fallbackAgentId: '',
      dependsOn: (t.dependsOnTaskTitles ?? []).map(title => titleToId.get(title) ?? ''),
      status: 'pending' as const,
      acceptanceCriteria: t.acceptanceCriteria ?? [],
      retryCount: 0,
    }));

    return {
      id: planId,
      intent,
      summary: parsed.summary ?? `Plan with ${subTasks.length} subtasks`,
      subTasks,
      status: 'running',
      complexity: (parsed.complexity as OrchestratorPlan['complexity']) ?? 'medium',
      parallelism: parsed.parallelism,
      createdAt: Date.now(),
    };
  } catch (err) {
    console.error('[Supervisor] LLM plan generation failed:', err);
    recordTrace({
      planId,
      step: 'LLM plan generation failed',
      phase: 'error',
      metadata: { error: String(err) },
      durationMs: 0,
    });
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Supervisor Runtime
// ────────────────────────────────────────────────────────────

/**
 * Initialize supervisor for a new orchestration session.
 */
export function initSupervisor(
  planId: string,
  sessionId: string,
  classification: IntentClassification,
  availableAgents: Agent[],
  performanceHistory: AgentPerformanceRecord[] = [],
  activeTaskCounts: Map<string, number> = new Map(),
): SupervisorState {
  // Create blackboard
  createBlackboard(planId, 0); // Task count will be updated after planning

  // Add initial facts from classification
  addFact(planId, `Intent classified as: ${classification.complexity} complexity`, 'supervisor');
  addFact(planId, `Strategy: ${classification.suggestedStrategy}`, 'supervisor');
  addFact(planId, `Domains: ${classification.domains.join(', ')}`, 'supervisor');

  return {
    planId,
    sessionId,
    classification,
    availableAgents,
    performanceHistory,
    activeTaskCounts,
    isRunning: false,
    startedAt: Date.now(),
    maxRevisionRounds: 2,
    currentRevisionRound: 0,
  };
}

/**
 * Assign agents to all tasks in a plan using dynamic selection.
 */
export function assignAgents(
  state: SupervisorState,
  plan: OrchestratorPlan,
): OrchestratorPlan {
  const context: AgentSelectionContext = {
    availableAgents: state.availableAgents,
    requiredCapabilities: [], // Will be set per task
    activeTaskCounts: state.activeTaskCounts,
    performanceHistory: state.performanceHistory,
    currentPlanTasks: [],
  };

  const assigedSoFar: SubTask[] = [];

  for (const task of plan.subTasks) {
    // Determine required capabilities from task description
    const requiredCaps = inferCapabilities(task);

    const result = selectAgent({
      ...context,
      requiredCapabilities: requiredCaps,
      currentPlanTasks: assigedSoFar,
    });

    task.assignedAgentId = result.selectedAgentId;
    task.fallbackAgentId = result.fallbackAgentId;

    assigedSoFar.push(task);

    recordTrace({
      planId: plan.id,
      taskId: task.id,
      step: `Agent selected: ${result.selectedAgentId}`,
      phase: 'planning',
      output: result,
      durationMs: 0,
    });
  }

  // Update blackboard task count (import at top of file)
  updateProgress(plan.id, { totalTasks: plan.subTasks.length });

  return plan;
}

/**
 * Infer required capabilities from task description and acceptance criteria.
 * Exported so the store can assign agents for LLM-generated plans (which
 * come back from the backend with empty assignedAgentId).
 */
export function inferCapabilities(task: SubTask): AgentCapability[] {
  const text = `${task.title} ${task.description} ${(task.acceptanceCriteria ?? []).join(' ')}`.toLowerCase();
  const caps: AgentCapability[] = [];

  if (/代码|code|实现|implement|build|开发|function|component|html|css|js|react|vue/.test(text)) caps.push('code');
  if (/设计|design|样式|style|动画|animation|颜色|color|布局|layout|视觉|美学/.test(text)) caps.push('design');
  if (/文档|文案|doc|说明|copy|内容|write|blog|文字/.test(text)) caps.push('doc');
  if (/数据|sql|data|分析|统计|chart|图/.test(text)) caps.push('data');
  if (/部署|deploy|上线|发布|vercel|publish/.test(text)) caps.push('deploy');

  return caps.length > 0 ? caps : ['code']; // Default to code
}

// ────────────────────────────────────────────────────────────
// Progress Monitoring
// ────────────────────────────────────────────────────────────

export interface MonitorResult {
  shouldReplan: boolean;
  reason?: string;
  stalledTasks: string[];
  progressPercent: number;
  phase: string;
}

/**
 * Monitor plan execution progress. Returns replan signal if needed.
 */
export function monitorProgress(
  state: SupervisorState,
  plan: OrchestratorPlan,
): MonitorResult {
  const total = plan.subTasks.length;
  const completed = plan.subTasks.filter(t =>
    t.status === 'success' || t.status === 'fallback',
  ).length;
  const failed = plan.subTasks.filter(t => t.status === 'failed').length;
  const running = plan.subTasks.filter(t => t.status === 'running').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Check for stalled tasks
  const stalledTasks: string[] = [];
  for (const task of plan.subTasks) {
    if (task.status !== 'running') continue;
    const stall = checkStall(task.id);
    if (stall.isStalled) {
      stalledTasks.push(task.id);
    }
  }

  // Determine phase
  let phase: string;
  if (percent === 0) phase = 'planning';
  else if (percent < 30) phase = 'building';
  else if (percent < 70) phase = 'styling';
  else if (percent < 100) phase = 'reviewing';
  else phase = 'done';

  // Replan conditions
  let shouldReplan = false;
  let reason: string | undefined;

  if (stalledTasks.length > 0 && state.currentRevisionRound < state.maxRevisionRounds) {
    shouldReplan = true;
    reason = `${stalledTasks.length} task(s) stalled`;
  }

  if (failed > 0 && completed === 0 && state.currentRevisionRound < state.maxRevisionRounds) {
    shouldReplan = true;
    reason = 'All tasks failed, replanning needed';
  }

  return { shouldReplan, reason, stalledTasks, progressPercent: percent, phase };
}

// ────────────────────────────────────────────────────────────
// Dynamic Replanning
// ────────────────────────────────────────────────────────────

/**
 * Replan: adjust strategy when tasks fail or stall.
 * May reassign agents, split tasks, or simplify requirements.
 */
export function replan(
  state: SupervisorState,
  plan: OrchestratorPlan,
  reason: string,
): OrchestratorPlan {
  state.currentRevisionRound++;

  addDecision(
    plan.id,
    `Replan round ${state.currentRevisionRound}: ${reason}`,
    'supervisor',
    `Triggered by: ${reason}`,
  );

  recordTrace({
    planId: plan.id,
    step: `Replan #${state.currentRevisionRound}`,
    phase: 'planning',
    metadata: { reason },
    durationMs: 0,
  });

  // For each failed/stalled task: reassign to fallback agent
  for (const task of plan.subTasks) {
    if (task.status === 'failed' || task.status === 'pending') {
      // Swap to fallback agent
      const currentAgent = task.assignedAgentId;
      task.assignedAgentId = task.fallbackAgentId ?? findAlternativeAgent(state, currentAgent);
      task.fallbackAgentId = currentAgent;
      task.status = 'pending';
      task.retryCount = (task.retryCount ?? 0) + 1;

      stopTracking(task.id);
    }
  }

  return plan;
}

function findAlternativeAgent(state: SupervisorState, excludeId: string): string {
  const alternatives = state.availableAgents.filter(a => a.id !== excludeId);
  if (alternatives.length === 0) return state.availableAgents[0]?.id ?? 'agent_claude_code';
  return alternatives[0]!.id;
}

// ────────────────────────────────────────────────────────────
// Session Concurrency Protection
// ────────────────────────────────────────────────────────────

const activeSessions = new Map<string, string>(); // sessionId → planId

export function acquireSessionLock(sessionId: string, planId: string): boolean {
  if (activeSessions.has(sessionId)) {
    console.warn(`[Supervisor] Session ${sessionId} already has active plan ${activeSessions.get(sessionId)}`);
    return false;
  }
  activeSessions.set(sessionId, planId);
  return true;
}

export function releaseSessionLock(sessionId: string): void {
  activeSessions.delete(sessionId);
}

export function isSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

// ────────────────────────────────────────────────────────────
// Timeout Management
// ────────────────────────────────────────────────────────────

export const DEFAULT_TIMEOUTS = {
  perTask: 120_000,     // 2 minutes per task
  totalPlan: 600_000,   // 10 minutes total
  criticReview: 30_000, // 30 seconds for review
};

export function createTimeout(ms: number, label: string): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
  });
  return {
    promise,
    clear: () => clearTimeout(timer),
  };
}

export function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const timeout = createTimeout(ms, label);
  return Promise.race([promise, timeout.promise]).finally(timeout.clear);
}

// ────────────────────────────────────────────────────────────
// Blackboard Context Injection
// ────────────────────────────────────────────────────────────

/**
 * Generate a context string for injection into agent system prompts.
 * Gives each agent awareness of the shared blackboard state.
 */
export function getAgentContextInjection(planId: string, agentId: string): string {
  const summary = generateBlackboardSummary(planId);
  if (!summary) return '';
  return `\n${summary}\n\nYou are Agent "${agentId}". Use the Blackboard context above to coordinate with other agents. If you have concerns, express them — the Supervisor will route them appropriately.`;
}
