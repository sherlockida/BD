/**
 * Blackboard Tests — validates shared knowledge space operations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBlackboard,
  addFact,
  addDecision,
  addArtifactRef,
  addConstraint,
  updateProgress,
  markTaskComplete,
  markTaskStalled,
  unmarkTaskStalled,
  getFacts,
  getDecisions,
  getArtifactRefs,
  getConstraints,
  getProgress,
  getOrCreatePrivateSpace,
  addConcern,
  proposeChange,
  generateBlackboardSummary,
  serializeBlackboard,
  deserializeBlackboard,
  destroyBlackboard,
  updateArtifactStatus,
} from '../blackboard';

const PLAN_ID = 'test_plan_1';

beforeEach(() => {
  // Clean up any leftover board
  destroyBlackboard(PLAN_ID);
});

describe('Blackboard - Creation', () => {
  it('creates a new blackboard with initial state', () => {
    const board = createBlackboard(PLAN_ID, 4);
    expect(board.planId).toBe(PLAN_ID);
    expect(board.public.progress.totalTasks).toBe(4);
    expect(board.public.progress.completed).toBe(0);
    expect(board.public.progress.currentPhase).toBe('planning');
    expect(board.public.facts).toHaveLength(0);
    expect(board.public.decisions).toHaveLength(0);
    expect(board.public.artifacts).toHaveLength(0);
    expect(board.public.constraints).toHaveLength(0);
  });
});

describe('Blackboard - Facts', () => {
  beforeEach(() => createBlackboard(PLAN_ID, 3));

  it('adds and retrieves facts', () => {
    addFact(PLAN_ID, '项目名：茶饮品牌', 'agent_doc', 1.0);
    addFact(PLAN_ID, '主色调：抹茶绿 #6B8E23', 'agent_codex', 0.9);

    const facts = getFacts(PLAN_ID);
    expect(facts).toHaveLength(2);
    expect(facts[0]!.content).toBe('项目名：茶饮品牌');
    expect(facts[1]!.confidence).toBe(0.9);
  });

  it('generates unique IDs for each fact', () => {
    const f1 = addFact(PLAN_ID, 'Fact 1', 'agent_1');
    const f2 = addFact(PLAN_ID, 'Fact 2', 'agent_1');
    expect(f1.id).not.toBe(f2.id);
  });
});

describe('Blackboard - Decisions', () => {
  beforeEach(() => createBlackboard(PLAN_ID, 2));

  it('adds decisions with rationale', () => {
    addDecision(PLAN_ID, '使用 React + TailwindCSS', 'supervisor', '团队技术栈统一');
    addDecision(PLAN_ID, '颜色改为深绿', 'agent_codex', '品牌方要求', 'dec_1');

    const decisions = getDecisions(PLAN_ID);
    expect(decisions).toHaveLength(2);
    expect(decisions[1]!.overrides).toBe('dec_1'); // Not actual ID, just checking the field
  });
});

describe('Blackboard - Artifacts', () => {
  beforeEach(() => createBlackboard(PLAN_ID, 2));

  it('adds and tracks artifact references', () => {
    addArtifactRef(PLAN_ID, 'art_1', 'index.html', 'webpage', 'agent_claude_code');
    addArtifactRef(PLAN_ID, 'art_2', 'theme.css', 'code', 'agent_codex');

    const refs = getArtifactRefs(PLAN_ID);
    expect(refs).toHaveLength(2);
    expect(refs[0]!.status).toBe('draft');
  });

  it('updates artifact status', () => {
    addArtifactRef(PLAN_ID, 'art_1', 'index.html', 'webpage', 'agent_claude_code');
    updateArtifactStatus(PLAN_ID, 'art_1', 'reviewed');

    const refs = getArtifactRefs(PLAN_ID);
    expect(refs[0]!.status).toBe('reviewed');

    updateArtifactStatus(PLAN_ID, 'art_1', 'final');
    expect(getArtifactRefs(PLAN_ID)[0]!.status).toBe('final');
  });
});

describe('Blackboard - Constraints', () => {
  beforeEach(() => createBlackboard(PLAN_ID, 1));

  it('adds and retrieves constraints', () => {
    addConstraint(PLAN_ID, '必须在移动端可用');
    addConstraint(PLAN_ID, '加载时间 < 3秒');

    expect(getConstraints(PLAN_ID)).toHaveLength(2);
  });
});

describe('Blackboard - Progress', () => {
  beforeEach(() => createBlackboard(PLAN_ID, 3));

  it('tracks progress updates', () => {
    markTaskComplete(PLAN_ID);
    expect(getProgress(PLAN_ID)!.completed).toBe(1);

    markTaskComplete(PLAN_ID);
    markTaskComplete(PLAN_ID);
    expect(getProgress(PLAN_ID)!.completed).toBe(3);
    expect(getProgress(PLAN_ID)!.currentPhase).toBe('done');
  });

  it('tracks stalled tasks', () => {
    markTaskStalled(PLAN_ID, 'task_1');
    markTaskStalled(PLAN_ID, 'task_2');
    expect(getProgress(PLAN_ID)!.stalledTasks).toHaveLength(2);
    expect(getProgress(PLAN_ID)!.stalledTasks).toContain('task_1');

    unmarkTaskStalled(PLAN_ID, 'task_1');
    expect(getProgress(PLAN_ID)!.stalledTasks).toHaveLength(1);
    expect(getProgress(PLAN_ID)!.stalledTasks).not.toContain('task_1');
  });

  it('updates phase', () => {
    updateProgress(PLAN_ID, { currentPhase: 'building' });
    expect(getProgress(PLAN_ID)!.currentPhase).toBe('building');
  });
});

describe('Blackboard - Private Spaces', () => {
  beforeEach(() => createBlackboard(PLAN_ID, 2));

  it('creates private space for agent on demand', () => {
    const space = getOrCreatePrivateSpace(PLAN_ID, 'agent_claude_code');
    expect(space.agentId).toBe('agent_claude_code');
    expect(space.concerns).toHaveLength(0);
    expect(space.proposedChanges).toHaveLength(0);
  });

  it('adds concerns to private space', () => {
    addConcern(PLAN_ID, 'agent_claude_code', 'Codex的CSS中使用了fixed定位，可能导致移动端问题');
    const space = getOrCreatePrivateSpace(PLAN_ID, 'agent_claude_code');
    expect(space.concerns).toHaveLength(1);
  });

  it('adds proposed changes between agents', () => {
    proposeChange(PLAN_ID, 'agent_claude_code', 'art_2', 'agent_codex',
      '建议使用CSS变量统一管理颜色', 'medium');
    const space = getOrCreatePrivateSpace(PLAN_ID, 'agent_claude_code');
    expect(space.proposedChanges).toHaveLength(1);
    expect(space.proposedChanges[0]!.priority).toBe('medium');
  });
});

describe('Blackboard - Summary Generation', () => {
  beforeEach(() => {
    createBlackboard(PLAN_ID, 3);
    addFact(PLAN_ID, '品牌色：抹茶绿', 'agent_doc', 1.0);
    addDecision(PLAN_ID, '使用TailwindCSS', 'supervisor', '团队标准');
    addConstraint(PLAN_ID, '移动端优先');
    markTaskComplete(PLAN_ID);
  });

  it('generates a readable summary for agent context injection', () => {
    const summary = generateBlackboardSummary(PLAN_ID);
    expect(summary).toContain('Shared Blackboard Context');
    expect(summary).toContain('品牌色：抹茶绿');
    expect(summary).toContain('使用TailwindCSS');
    expect(summary).toContain('移动端优先');
    expect(summary).toContain('1/3');
  });
});

describe('Blackboard - Serialization', () => {
  beforeEach(() => {
    createBlackboard(PLAN_ID, 2);
    addFact(PLAN_ID, 'Test fact', 'agent_1');
  });

  it('serializes and deserializes correctly', () => {
    const json = serializeBlackboard(PLAN_ID);
    const restored = deserializeBlackboard(json);

    expect(restored.planId).toBe(PLAN_ID);
    expect(restored.public.facts).toHaveLength(1);
    expect(restored.public.facts[0]!.content).toBe('Test fact');
  });
});

describe('Blackboard - Cleanup', () => {
  it('destroys blackboard and frees memory', () => {
    createBlackboard(PLAN_ID, 1);
    expect(getFacts(PLAN_ID)).toHaveLength(0);

    destroyBlackboard(PLAN_ID);
    // After destroy, getFacts should return empty array (not throw)
    expect(getFacts(PLAN_ID)).toHaveLength(0);
  });
});
