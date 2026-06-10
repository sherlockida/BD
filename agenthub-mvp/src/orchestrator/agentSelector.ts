/**
 * AgentSelector — Dynamic agent selection based on load, capability, and history.
 *
 * Replaces the old "findByCapability" global search with a weighted multi-factor
 * selection algorithm. Agents are scored on:
 *   1. Capability match (primary)
 *   2. Current load (fewer active tasks = higher score)
 *   3. Historical success rate (from AgentPerformanceRecord)
 *   4. Recency bonus (recently used agents are preferred for continuity)
 */
import type {
  Agent,
  AgentCapability,
  AgentPerformanceRecord,
  SubTask,
} from '../types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface AgentSelectionContext {
  availableAgents: Agent[];
  requiredCapabilities: AgentCapability[];
  activeTaskCounts: Map<string, number>;   // agentId → currently running tasks
  performanceHistory: AgentPerformanceRecord[];
  currentPlanTasks?: SubTask[];            // Already assigned tasks in this plan
  /** Map of agentId → failure count for degradation penalty */
  failurePenaltyMap?: Map<string, number>;
}

export interface SelectionResult {
  selectedAgentId: string;
  fallbackAgentId: string;
  score: number;
  reasoning: string;
}

// ────────────────────────────────────────────────────────────
// Weight Configuration
// ────────────────────────────────────────────────────────────

const WEIGHTS = {
  capabilityMatch: 0.35,    // Primary: does the agent have the right skills?
  specialization: 0.10,     // Bonus for agents specialized in exactly this capability
  loadBalance: 0.20,        // Prefer less busy agents
  successRate: 0.20,        // Prefer agents with good track record
  recency: 0.10,            // Small bonus for recently active agents
  diversity: 0.05,          // Prefer different agents from already-assigned tasks
};

const FALLBACK_AGENT_ID = 'agent_claude_code';

// ────────────────────────────────────────────────────────────
// Scoring Functions
// ────────────────────────────────────────────────────────────

function scoreCapability(agent: Agent, required: AgentCapability[]): number {
  if (required.length === 0) return 1.0;
  const matched = required.filter(c => agent.capabilities.includes(c));
  return matched.length / required.length;
}

/**
 * Specialization bonus: agents with FEWER extra capabilities get higher score.
 * This prefers a specialist over a generalist when capability match is equal.
 * E.g., for a 'doc' task, DocAgent (only 'doc') beats Claude Code (has 'doc' plus others).
 */
function scoreSpecialization(agent: Agent, required: AgentCapability[]): number {
  if (required.length === 0) return 0.5;
  // How many of the agent's capabilities are relevant to this task?
  const relevant = agent.capabilities.filter(c => required.includes(c)).length;
  const total = agent.capabilities.length;
  if (total === 0) return 0;
  // Higher score = more focused (relevant / total ratio)
  // But also check that agent has all required capabilities
  const hasAllRequired = required.every(c => agent.capabilities.includes(c));
  const ratio = relevant / total;
  return hasAllRequired ? (0.5 + 0.5 * ratio) : ratio * 0.5;
}

function scoreLoad(agentId: string, activeTaskCounts: Map<string, number>): number {
  const count = activeTaskCounts.get(agentId) ?? 0;
  if (count === 0) return 1.0;
  if (count === 1) return 0.7;
  if (count === 2) return 0.4;
  return 0.1; // 3+ tasks → heavily loaded
}

function scoreSuccessRate(agentId: string, history: AgentPerformanceRecord[]): number {
  const record = history.find(r => r.agentId === agentId);
  if (!record || record.totalCount === 0) return 0.5; // Neutral for unknown agents
  return record.successCount / record.totalCount;
}

function scoreRecency(agentId: string, history: AgentPerformanceRecord[]): number {
  const record = history.find(r => r.agentId === agentId);
  if (!record) return 0.5;
  const hoursSinceLastUse = (Date.now() - record.lastUsedAt) / (1000 * 60 * 60);
  if (hoursSinceLastUse < 1) return 1.0;
  if (hoursSinceLastUse < 6) return 0.7;
  if (hoursSinceLastUse < 24) return 0.4;
  return 0.2;
}

function scoreDiversity(
  agentId: string,
  alreadyAssigned: SubTask[],
): number {
  if (alreadyAssigned.length === 0) return 0.5; // Neutral
  const alreadyUsed = alreadyAssigned.some(t =>
    t.assignedAgentId === agentId || t.fallbackAgentId === agentId,
  );
  return alreadyUsed ? 0.3 : 0.8; // Prefer unused agents
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Select the best agent for a task based on multi-factor scoring.
 */
export function selectAgent(
  context: AgentSelectionContext,
): SelectionResult {
  const { availableAgents, requiredCapabilities, activeTaskCounts, performanceHistory, currentPlanTasks, failurePenaltyMap } = context;

  if (availableAgents.length === 0) {
    return {
      selectedAgentId: FALLBACK_AGENT_ID,
      fallbackAgentId: FALLBACK_AGENT_ID,
      score: 0,
      reasoning: 'No agents available, using hardcoded fallback',
    };
  }

  const alreadyAssigned = currentPlanTasks ?? [];
  const scores = availableAgents.map(agent => {
    const capScore = scoreCapability(agent, requiredCapabilities);
    const specScore = scoreSpecialization(agent, requiredCapabilities);
    const loadScore = scoreLoad(agent.id, activeTaskCounts);
    const successScore = scoreSuccessRate(agent.id, performanceHistory);
    const recencyScore = scoreRecency(agent.id, performanceHistory);
    const diversityScore = scoreDiversity(agent.id, alreadyAssigned);

    let total =
      capScore * WEIGHTS.capabilityMatch +
      specScore * WEIGHTS.specialization +
      loadScore * WEIGHTS.loadBalance +
      successScore * WEIGHTS.successRate +
      recencyScore * WEIGHTS.recency +
      diversityScore * WEIGHTS.diversity;

    // Apply degradation penalty for frequently-failing agents
    if (failurePenaltyMap) {
      const failures = failurePenaltyMap.get(agent.id) ?? 0;
      if (failures >= 3) {
        total *= 0.5; // Heavily penalize degraded agents (3+ failures)
      } else if (failures >= 1) {
        total *= Math.max(0.3, 1 - failures * 0.2); // Mild penalty for 1-2 failures
      }
    }

    return { agent, total, breakdown: { capScore, specScore, loadScore, successScore, recencyScore, diversityScore } };
  });

  // Sort by total score descending
  scores.sort((a, b) => b.total - a.total);

  const best = scores[0]!;
  const fallback = scores.length > 1 ? scores[1]!.agent.id : best.agent.id;

  const reasoning = [
    `Selected ${best.agent.name} (${best.agent.id})`,
    `Score: ${best.total.toFixed(3)}`,
    `Cap:${best.breakdown.capScore.toFixed(2)} Load:${best.breakdown.loadScore.toFixed(2)}`,
    `Success:${best.breakdown.successScore.toFixed(2)} Recency:${best.breakdown.recencyScore.toFixed(2)}`,
    `Diversity:${best.breakdown.diversityScore.toFixed(2)}`,
  ].join(' | ');

  return {
    selectedAgentId: best.agent.id,
    fallbackAgentId: fallback,
    score: best.total,
    reasoning,
  };
}

/**
 * Select agents for all tasks in a plan. Uses greedy assignment
 * to avoid assigning the same agent to parallel tasks.
 */
export function selectAgentsForPlan(
  tasks: Array<{ title: string; description: string; capabilities: AgentCapability[] }>,
  context: Omit<AgentSelectionContext, 'requiredCapabilities'>,
): Map<string, SelectionResult> {
  const assignments = new Map<string, SelectionResult>();
  const assignedSoFar: SubTask[] = [];

  // Sort tasks: ones with deps first (they block others), then by capability count
  const sorted = [...tasks].sort((a, b) => b.capabilities.length - a.capabilities.length);

  for (const task of sorted) {
    const result = selectAgent({
      ...context,
      requiredCapabilities: task.capabilities,
      currentPlanTasks: assignedSoFar,
    });
    assignments.set(task.title, result);

    // Track assignment for diversity scoring in subsequent selections
    assignedSoFar.push({
      id: '',
      title: task.title,
      description: task.description,
      assignedAgentId: result.selectedAgentId,
      fallbackAgentId: result.fallbackAgentId,
      dependsOn: [],
      status: 'pending',
    });
  }

  return assignments;
}

/**
 * Get the load status of all agents for monitoring.
 */
export function getAgentLoadSnapshot(
  activeTaskCounts: Map<string, number>,
  totalAgents: number,
): Record<string, { active: number; utilization: number }> {
  const snapshot: Record<string, { active: number; utilization: number }> = {};
  for (const [agentId, count] of activeTaskCounts) {
    snapshot[agentId] = {
      active: count,
      utilization: Math.min(count / 3, 1.0), // Cap at 100% (3+ tasks)
    };
  }
  return snapshot;
}
