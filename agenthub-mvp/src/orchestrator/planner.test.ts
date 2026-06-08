/**
 * Unit tests for the frontend planner (keyword-based task decomposition).
 */
import { describe, it, expect } from 'vitest';
import { plan } from '../orchestrator/planner';
import { agentRegistry } from '../agents/registry';
import type { Agent } from '../types';

function mockAgents(): Agent[] {
  return agentRegistry.allMeta().filter(a => a.id !== 'agent_orchestrator');
}

describe('planner (frontend keyword matching)', () => {
  it('matches 落地页 pattern and creates 4 subtasks', () => {
    const result = plan('做一个茶饮品牌落地页', mockAgents());
    expect(result.subTasks.length).toBe(4);
    expect(result.status).toBe('planning');
    expect(result.summary).toContain('拆解');
  });

  it('matches 官网 pattern', () => {
    const result = plan('做一个公司官网', mockAgents());
    expect(result.subTasks.length).toBe(4);
  });

  it('matches 组件 pattern and creates 2 subtasks', () => {
    const result = plan('写一个登录表单组件', mockAgents());
    expect(result.subTasks.length).toBe(2);
    expect(result.summary).toContain('组件');
  });

  it('matches 部署 pattern and creates 1 subtask', () => {
    const result = plan('部署到线上', mockAgents());
    expect(result.subTasks.length).toBe(1);
    expect(result.subTasks[0].title).toContain('部署');
  });

  it('matches 文档 pattern and creates 1 subtask', () => {
    const result = plan('写一份产品PRD文档', mockAgents());
    expect(result.subTasks.length).toBe(1);
    expect(result.subTasks[0].title).toContain('文档');
  });

  it('confirms spec matches 文档 pattern', () => {
    const result = plan('确认 spec', mockAgents());
    expect(result.subTasks.length).toBe(1);
  });

  it('default pattern falls back to single agent task', () => {
    const result = plan('xyzzy flurb whatever nonsense', mockAgents());
    expect(result.subTasks.length).toBe(1);
    expect(result.status).toBe('planning');
  });

  it('every subtask has a non-empty assignedAgentId', () => {
    const agents = mockAgents();
    const result = plan('做个产品主页', agents);
    for (const t of result.subTasks) {
      expect(t.assignedAgentId).toBeTruthy();
      // Verify the assigned agent actually exists
      expect(agents.some(a => a.id === t.assignedAgentId)).toBe(true);
    }
  });

  it('plan ID is unique across calls', () => {
    const agents = mockAgents();
    const r1 = plan('test 1', agents);
    const r2 = plan('test 2', agents);
    expect(r1.id).not.toBe(r2.id);
  });
});
