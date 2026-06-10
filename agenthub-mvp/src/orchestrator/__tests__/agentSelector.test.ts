/**
 * Agent Selector Tests — validates multi-factor agent selection.
 */
import { describe, it, expect } from 'vitest';
import { selectAgent, selectAgentsForPlan } from '../agentSelector';
import type { Agent, AgentPerformanceRecord } from '../../types';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_test',
    name: 'Test Agent',
    avatarEmoji: '🤖',
    avatarColor: 'bg-gray-500',
    vendor: 'claude-code',
    capabilities: ['code'],
    tagline: 'Test agent',
    online: true,
    ...overrides,
  };
}

const AGENTS: Agent[] = [
  makeAgent({ id: 'agent_claude_code', name: 'Claude Code', capabilities: ['code', 'plan', 'doc', 'design'] }),
  makeAgent({ id: 'agent_codex', name: 'Codex', capabilities: ['code', 'design'] }),
  makeAgent({ id: 'agent_open_code', name: 'OpenCode', capabilities: ['code', 'deploy'] }),
  makeAgent({ id: 'agent_doc', name: 'DocAgent', capabilities: ['doc'] }),
];

const EMPTY_HISTORY: AgentPerformanceRecord[] = [];

describe('Agent Selector - Basic Selection', () => {
  it('selects the best capability match (specialist preferred over generalist)', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code', 'design'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    // Codex specializes in code+design (only 2 capabilities)
    // Claude Code is a generalist (4 capabilities including code+design)
    // Specialization bonus should prefer Codex
    expect(result.selectedAgentId).toBe('agent_codex');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('selects deploy-capable agent for deploy tasks', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['deploy'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(result.selectedAgentId).toBe('agent_open_code');
  });

  it('selects doc-capable agent for documentation tasks', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['doc'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(result.selectedAgentId).toBe('agent_doc');
  });

  it('provides a fallback agent ID', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(result.fallbackAgentId).toBeDefined();
    expect(result.fallbackAgentId).not.toBe(result.selectedAgentId);
  });
});

describe('Agent Selector - Load Balancing', () => {
  it('prefers less loaded agents', () => {
    const busyMap = new Map<string, number>([
      ['agent_claude_code', 3],
      ['agent_codex', 0],
    ]);

    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code', 'design'],
      activeTaskCounts: busyMap,
      performanceHistory: EMPTY_HISTORY,
    });

    // Codex has code+design and is unloaded, should beat busy Claude
    expect(result.selectedAgentId).toBe('agent_codex');
  });
});

describe('Agent Selector - Performance History', () => {
  it('prefers agents with higher success rate', () => {
    const history: AgentPerformanceRecord[] = [
      { agentId: 'agent_claude_code', taskType: 'code', successCount: 5, totalCount: 10, avgDurationMs: 5000, lastUsedAt: Date.now(), criticScoreAvg: 0.7 },
      { agentId: 'agent_codex', taskType: 'code', successCount: 9, totalCount: 10, avgDurationMs: 3000, lastUsedAt: Date.now(), criticScoreAvg: 0.9 },
    ];

    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: history,
    });

    // Codex has better success rate, should score higher
    expect(result.selectedAgentId).toBe('agent_codex');
  });

  it('handles agents with no history (neutral score)', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.selectedAgentId).toBeDefined();
  });
});

describe('Agent Selector - Diversity', () => {
  it('prefers unused agents for plan diversity', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
      currentPlanTasks: [
        { id: 't1', title: 'Task 1', description: '', assignedAgentId: 'agent_claude_code', dependsOn: [], status: 'pending' },
      ],
    });

    // Should prefer an agent not already assigned
    expect(result.selectedAgentId).not.toBe('agent_claude_code');
  });
});

describe('Agent Selector - Edge Cases', () => {
  it('returns fallback when no agents available', () => {
    const result = selectAgent({
      availableAgents: [],
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(result.selectedAgentId).toBe('agent_claude_code');
    expect(result.score).toBe(0);
  });

  it('handles empty capabilities (selects any agent)', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: [],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(result.selectedAgentId).toBeDefined();
  });

  it('scores are deterministic', () => {
    const r1 = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    const r2 = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(r1.selectedAgentId).toBe(r2.selectedAgentId);
    expect(r1.score).toBe(r2.score);
  });
});

describe('Agent Selector - Batch Assignment', () => {
  it('assigns different agents to parallel tasks', () => {
    const tasks = [
      { title: 'HTML骨架', description: 'Build HTML', capabilities: ['code'] as const },
      { title: 'CSS样式', description: 'Style the page', capabilities: ['design'] as const },
      { title: '品牌文案', description: 'Write copy', capabilities: ['doc'] as const },
    ];

    const result = selectAgentsForPlan(tasks, {
      availableAgents: AGENTS,
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });

    expect(result.size).toBe(3);

    // All three tasks should ideally be assigned to different agents
    const assigned = Array.from(result.values()).map(r => r.selectedAgentId);
    const uniqueAgents = new Set(assigned);
    // At minimum 2 different agents, ideally 3
    expect(uniqueAgents.size).toBeGreaterThanOrEqual(2);
  });
});
