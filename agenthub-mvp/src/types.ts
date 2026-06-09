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

// ────── Orchestrator ──────
export type SubTaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'fallback';

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
}

export interface OrchestratorPlan {
  id: ID;
  intent: string;            // 用户意图原文
  summary: string;           // PMO 一句话总结
  subTasks: SubTask[];
  status: 'planning' | 'running' | 'done' | 'failed';
}

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
}

export type AgentChunk =
  | { type: 'text'; delta: string }
  | { type: 'code'; language: string; filename?: string; code: string }
  | { type: 'artifact-draft'; artifactType: ArtifactType; name: string; language?: string; content: string; commitMessage: string }
  | { type: 'tool-call'; tool: string; args: any }
  | { type: 'done' }
  | { type: 'error'; error: string };

export interface IAgent {
  meta: Agent;
  chat(input: AgentInput): AsyncIterable<AgentChunk>;
  healthCheck(): Promise<boolean>;
}
