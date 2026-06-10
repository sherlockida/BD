// ────────────────────────────────────────────────────────────
// Orchestrator 2.0 — Unified exports
// ────────────────────────────────────────────────────────────

// Legacy (deprecated — kept for backward compatibility during Strangler Fig migration)
/** @deprecated Use classifyIntent from './classifier' instead */
export { plan as planTasks } from './planner';
/** @deprecated Use Supervisor + new scheduler instead */
export { schedule, resumePausedTask } from './scheduler';
/** @deprecated Use PMO Synthesizer instead */
export { summarize } from './aggregator';

// 2.0 Modules
export { classifyIntent, classifySync, stage3LlmClassify } from './classifier';
export type { ClassifyResult } from './classifier';

export { selectAgent, selectAgentsForPlan, getAgentLoadSnapshot } from './agentSelector';
export type { AgentSelectionContext, SelectionResult } from './agentSelector';

export {
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
  getBlackboard,
} from './blackboard';

export {
  reviewTask,
  selectReviewStrategy,
  generateCriticReport,
} from './criticAgent';
export type { ReviewResult, ReviewDimensions } from './criticAgent';

export {
  initSupervisor,
  generatePlanViaLlm,
  assignAgents,
  inferCapabilities,
  monitorProgress,
  replan,
  acquireSessionLock,
  releaseSessionLock,
  isSessionActive,
  raceWithTimeout,
  getAgentContextInjection,
  createTimeout,
  SUPERVISOR_SYSTEM_PROMPT,
  DEFAULT_TIMEOUTS,
} from './supervisor';
export type { SupervisorState, MonitorResult } from './supervisor';

export {
  synthesize,
  formatReportAsMarkdown,
  formatBriefSummary,
  detectConflicts,
} from './pmoSynthesizer';
export type { SynthesisContext, ArtifactConflict } from './pmoSynthesizer';

export {
  recordTrace,
  tracePlan,
  traceExecution,
  traceReview,
  traceError,
  withTrace,
  getTracesByPlan,
  getTracesByTask,
  getErrorTraces,
  getPlanTimeline,
  clearTraces,
} from './trace';

export {
  startTracking,
  recordTokenOutput,
  recordArtifactOutput,
  checkStall,
  checkAllStalls,
  stopTracking,
  clearAllTracking,
} from './stallDetector';

export {
  registerSagaOperation,
  markSagaExecuted,
  compensate,
  getCompensatableOperations,
  clearSaga,
} from './saga';

// ────────────────────────────────────────────────────────────
// Orchestrator Agent Meta
// ────────────────────────────────────────────────────────────

import type { Agent } from '../types';

export const ORCHESTRATOR_META: Agent = {
  id: 'agent_orchestrator',
  name: 'PMO',
  avatarEmoji: '🧭',
  avatarColor: 'bg-feishu-accent',
  vendor: 'orchestrator',
  capabilities: ['plan'],
  tagline: '智能编排 · 动态拆任务 · 并行调度 · 质量评审 · 产物交付',
  online: true,
};
