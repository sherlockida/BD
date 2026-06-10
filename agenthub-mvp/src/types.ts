// ────────────────────────────────────────────────────────────
// Core domain types shared across UI / agents / orchestrator
// ────────────────────────────────────────────────────────────

export type ID = string;

// ────── Agent ──────
export type AgentCapability =
  | 'code'        // 写代码
  | 'design'      // UI / 视觉
  | 'doc'         // 文档/文案
  | 'data'        // SQL / 数据分析
  | 'deploy'      // 部署
  | 'plan';       // 任务编排（PMO 专属）

export type AgentVendor =
  | 'claude-code'
  | 'codex'
  | 'open-code'
  | 'custom'
  | 'orchestrator';

export interface Agent {
  id: ID;
  name: string;
  avatarEmoji: string;       // 用 emoji 当头像，零依赖
  avatarColor: string;       // tailwind bg color
  vendor: AgentVendor;
  capabilities: AgentCapability[];
  tagline: string;           // 一句话简介
  systemPrompt?: string;     // 自建 agent 才有
  isCustom?: boolean;
  online: boolean;
}

// ────── Conversation & Message ──────
export type ConversationType = 'single' | 'group';

export interface Conversation {
  id: ID;
  type: ConversationType;
  title: string;
  memberAgentIds: ID[];      // 群内 agent
  pinnedMessageIds: ID[];
  archived?: boolean;
  lastActivityAt: number;
  unread?: number;
}

export type MessageSenderType = 'user' | 'agent' | 'system';

export type MessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'code'; language: string; code: string; filename?: string }
  | { kind: 'plan'; plan: OrchestratorPlan }
  | { kind: 'artifact'; artifactId: ID; versionId: ID; title: string; preview?: string }
  | { kind: 'deploy'; deploy: DeployStatus }
  | { kind: 'diff'; diff: DiffPayload }
  | { kind: 'blackboard'; board: BlackboardData }
  | { kind: 'system'; text: string };

export interface Message {
  id: ID;
  conversationId: ID;
  senderType: MessageSenderType;
  senderId: ID;              // agent id or 'user'
  content: MessageContent;
  mentions?: ID[];           // 被 @ 的 agent ids
  replyToMessageId?: ID;
  createdAt: number;
  streaming?: boolean;       // 流式中
  pinned?: boolean;
}

// ────── Orchestrator 2.0 ──────
export type SubTaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'fallback' | 'paused';
export type ReviewVerdict = 'accepted' | 'revised' | 'rejected';
export type IntentComplexity = 'simple' | 'medium' | 'complex';

export interface SubTask {
  id: ID;
  title: string;
  description: string;
  assignedAgentId: ID;
  fallbackAgentId?: ID;
  dependsOn: ID[];           // dag
  status: SubTaskStatus;
  startedAt?: number;
  finishedAt?: number;
  output?: string;           // 简单总结
  producedArtifactId?: ID;
  /** Acceptance criteria for the task */
  acceptanceCriteria?: string[];
  /** Retry count with backoff */
  retryCount?: number;
  /** Review verdict from Critic */
  reviewVerdict?: ReviewVerdict;
  /** Review score from Critic (0-1) */
  reviewScore?: number;
  /** Review feedback if revised/rejected */
  reviewFeedback?: string;
  /** Live character count while streaming (for real-time indicator) */
  streamedChars?: number;
}

export interface OrchestratorPlan {
  id: ID;
  intent: string;            // 用户意图原文
  summary: string;           // PMO 一句话总结
  subTasks: SubTask[];
  status: 'planning' | 'running' | 'done' | 'failed';
  /** Complexity classification */
  complexity?: IntentComplexity;
  /** Whether this plan should skip Critic review */
  skipReview?: boolean;
  /** Parallel execution groups: each inner array = tasks that can run in parallel */
  parallelism?: ID[][];
  /** Created timestamp */
  createdAt?: number;
  /** Updated timestamp */
  updatedAt?: number;
  /** Session ID for concurrency protection */
  sessionId?: string;
  /** Whether plan is persisted to DB */
  persisted?: boolean;
}

/** Intent classification result */
export interface IntentClassification {
  complexity: IntentComplexity;
  domains: AgentCapability[];
  suggestedStrategy: 'direct' | 'single-agent' | 'supervisor-worker';
  confidence: number;         // 0-1
  reasoning: string;
}

/** Blackboard — shared knowledge space for agents */
export interface BlackboardData {
  planId: ID;
  public: {
    facts: BlackboardFact[];
    decisions: BlackboardDecision[];
    artifacts: BlackboardArtRef[];
    constraints: string[];
    progress: BlackboardProgress;
  };
  private: Record<ID, BlackboardPrivateSpace>;
}

export interface BlackboardFact {
  id: ID;
  content: string;
  addedBy: ID;               // agent id
  addedAt: number;
  confidence: number;        // 0-1
}

export interface BlackboardDecision {
  id: ID;
  content: string;
  madeBy: ID;
  madeAt: number;
  rationale: string;
  overrides?: ID;            // overrides previous decision id
}

export interface BlackboardArtRef {
  artifactId: ID;
  name: string;
  type: ArtifactType;
  producedBy: ID;
  producedAt: number;
  status: 'draft' | 'reviewed' | 'final';
}

export interface BlackboardProgress {
  totalTasks: number;
  completed: number;
  currentPhase: 'planning' | 'building' | 'styling' | 'reviewing' | 'deploying' | 'done';
  startedAt: number;
  estimatedCompletion?: number;
  stalledTasks: ID[];
}

export interface BlackboardPrivateSpace {
  agentId: ID;
  drafts: unknown[];
  concerns: string[];
  proposedChanges: ProposedChange[];
}

export interface ProposedChange {
  targetArtifactId: ID;
  targetAgentId: ID;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
}

/** Agent performance tracking for dynamic selection */
export interface AgentPerformanceRecord {
  agentId: ID;
  taskType: string;
  successCount: number;
  totalCount: number;
  avgDurationMs: number;
  lastUsedAt: number;
  criticScoreAvg: number;
}

/** Stall detection configuration */
export interface StallConfig {
  checkIntervalMs: number;    // How often to check (default 10s)
  maxSilentRounds: number;    // Max rounds without artifact before stall (default 3)
  minTokenRate: number;       // Min tokens per check interval to be "active" (default 5)
}

/** Execution trace entry */
export interface TraceEntry {
  id: ID;
  planId: ID;
  taskId?: ID;
  step: string;
  phase: 'planning' | 'execution' | 'review' | 'synthesis' | 'error';
  input?: unknown;
  output?: unknown;
  durationMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Saga compensation operation */
export interface SagaOperation {
  taskId: ID;
  action: string;
  compensate: () => Promise<void> | void;
  status: 'pending' | 'executed' | 'compensated' | 'failed';
}

/** PMO Report (upgraded aggregator output) */
export interface PMOReport {
  planId: ID;
  intent: string;
  completed: TaskReportItem[];
  degraded: TaskReportItem[];
  failed: TaskReportItem[];
  criticReview: CriticReport;
  totalDurationMs: number;
  totalTokens: number;
  artifacts: string[];
}

export interface TaskReportItem {
  taskId: ID;
  title: string;
  agentName: string;
  artifactName?: string;
  artifactSize?: string;
  durationMs: number;
}

export interface CriticReport {
  overallScore: number;
  codeQuality?: number;
  security?: string;
  suggestions: string[];
  reviewStrategy: ReviewStrategy;
}

export type ReviewStrategy = 'majority-vote' | 'consensus' | 'llm-as-judge' | 'human-confirmation';

// ────── Artifact ──────
export type ArtifactType = 'code' | 'webpage' | 'doc' | 'ppt';

export interface ArtifactVersion {
  id: ID;
  artifactId: ID;
  version: number;
  content: string;
  authorAgentId: ID;
  commitMessage: string;
  createdAt: number;
}

export interface Artifact {
  id: ID;
  conversationId: ID;
  type: ArtifactType;
  name: string;              // 如 index.html
  language?: string;         // code 类型
  latestVersionId: ID;
  versions: ArtifactVersion[];
  createdBy: ID;
  createdAt: number;
  /** 持久化状态：saved=已落盘, saving=保存中, error=保存失败, local-only=仅本地 */
  _persistStatus?: 'saved' | 'saving' | 'error' | 'local-only';
}

// ────── Deploy ──────
export interface DeployStatus {
  id: ID;
  artifactId: ID;
  step: 'building' | 'uploading' | 'live' | 'failed';
  progress: number;          // 0~100
  url?: string;
  message?: string;
  startedAt: number;
  finishedAt?: number;
}

// ────── Diff ──────
export interface DiffPayload {
  artifactId: ID;
  fromVersionId: ID;
  toVersionId: ID;
  hunks: DiffHunk[];
}
export interface DiffHunk {
  type: 'add' | 'remove' | 'context';
  line: string;
  oldLineNo?: number;
  newLineNo?: number;
}

// ────── Skill ──────
export interface Skill {
  id: ID;
  name: string;
  trigger: string;
  description: string;
  steps: string[];
  createdAt: number;
  source: 'manual' | 'auto-distilled';
  conversationId?: ID;
}

// ────── Agent IO contract (streaming) ──────
export interface AgentInput {
  conversation: Conversation;
  history: Message[];
  userPrompt: string;
  task?: SubTask;             // 当被 orchestrator 派单时携带
  contextArtifacts?: Artifact[];
  /** Upstream task outputs for context-aware execution (Phase 2) */
  upstreamContext?: string;
}

export type AgentChunk =
  | { type: 'text'; delta: string }
  | { type: 'code'; language: string; filename?: string; code: string }
  | { type: 'artifact-draft'; artifactType: ArtifactType; name: string; language?: string; content: string; commitMessage: string }
  | { type: 'tool-call'; tool: string; args: any }
  | { type: 'ui-component'; component: string; props: Record<string, unknown>; taskId?: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

export interface IAgent {
  meta: Agent;
  chat(input: AgentInput): AsyncIterable<AgentChunk>;
  healthCheck(): Promise<boolean>;
}

// ────── Orchestrator Session (Phase 2: stateful orchestration) ──────
export type OrchestratorSessionState =
  | 'planning'
  | 'executing'
  | 'waiting_user'
  | 'merging'
  | 'done';

export interface OrchestratorSession {
  planId: string;
  state: OrchestratorSessionState;
  blackboardPlanId: string;
  /** Set of task IDs that are waiting for user input */
  waitingTasks: Set<string>;
  /** Map of taskId → resolve function for pending user input */
  pendingResolvers: Map<string, (value: string) => void>;
  /** Accumulated user inputs keyed by taskId */
  userInputs: Map<string, string>;
}
