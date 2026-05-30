export { plan as planTasks } from './planner';
export { schedule } from './scheduler';
export { summarize } from './aggregator';

import type { Agent } from '../types';

export const ORCHESTRATOR_META: Agent = {
  id: 'agent_orchestrator',
  name: 'PMO',
  avatarEmoji: '🧭',
  avatarColor: 'bg-feishu-accent',
  vendor: 'orchestrator',
  capabilities: ['plan'],
  tagline: '主 Agent · 拆任务、并行调度、失败降级、结果聚合',
  online: true,
};
