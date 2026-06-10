import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ────────────────────────────────────────────────────────────
// Drizzle ORM Schema — mirrors plan §5.5.2
// ────────────────────────────────────────────────────────────

// ── users ──
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).unique(),
  avatarUrl: text('avatar_url'),
  apiKeys: jsonb('api_keys').$type<Record<string, string>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── projects ──
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  conversationIds: uuid('conversation_ids').array().default([]),
  specId: uuid('spec_id'),
  rulesId: uuid('rules_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── conversations ──
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id),
  type: varchar('type', { length: 10 }).notNull(), // 'single' | 'group'
  title: varchar('title', { length: 200 }).notNull(),
  memberAgentIds: text('member_agent_ids').array().notNull().default([]),
  pinnedMessageIds: text('pinned_message_ids').array().default([]),
  archived: boolean('archived').default(false),
  pinned: boolean('pinned').default(false),
  createdBy: uuid('created_by').references(() => users.id),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  typeCheck: check('conversation_type_check', sql`"type" IN ('single', 'group')`),
}));

// ── messages ──
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  senderType: varchar('sender_type', { length: 10 }).notNull(), // 'user' | 'agent' | 'system'
  senderId: varchar('sender_id', { length: 100 }).notNull(),
  content: jsonb('content').notNull().$type<Record<string, unknown>>(),
  mentions: text('mentions').array().default([]),
  replyToMessageId: uuid('reply_to_message_id'),
  streaming: boolean('streaming').default(false),
  pinned: boolean('pinned').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  senderTypeCheck: check('sender_type_check', sql`"sender_type" IN ('user', 'agent', 'system')`),
  convTimeIdx: index('idx_messages_conv_created').on(table.conversationId, table.createdAt.desc()),
  replyFk: foreignKey({
    columns: [table.replyToMessageId],
    foreignColumns: [table.id],
  }),
}));

// ── artifacts ──
export const artifacts = pgTable('artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  type: varchar('type', { length: 20 }).notNull(), // 'code' | 'webpage' | 'doc' | 'ppt'
  name: varchar('name', { length: 255 }).notNull(),
  language: varchar('language', { length: 50 }),
  latestVersionId: uuid('latest_version_id'),
  createdBy: varchar('created_by', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── artifact_versions ──
export const artifactVersions = pgTable('artifact_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  artifactId: uuid('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  authorAgentId: varchar('author_agent_id', { length: 100 }).notNull(),
  commitMessage: varchar('commit_message', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueVersion: uniqueIndex('idx_artifact_version').on(table.artifactId, table.version),
}));

// ── skills ──
export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  triggerCondition: text('trigger_condition').notNull(),
  description: text('description'),
  steps: jsonb('steps').$type<string[]>().default([]),
  source: varchar('source', { length: 20 }).default('manual'), // 'manual' | 'auto-distilled'
  conversationId: uuid('conversation_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── agents (custom agents persisted to DB; built-in agents stay in code) ──
export const agents = pgTable('agents', {
  id: varchar('id', { length: 100 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  avatarEmoji: varchar('avatar_emoji', { length: 10 }).default('🤖'),
  avatarColor: varchar('avatar_color', { length: 50 }).default('bg-gray-500'),
  vendor: varchar('vendor', { length: 20 }).notNull().default('custom'),
  capabilities: text('capabilities').array().default([]),
  tagline: varchar('tagline', { length: 200 }),
  systemPrompt: text('system_prompt'),
  isCustom: boolean('is_custom').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── orchestrator_plans ──
export const orchestratorPlans = pgTable('orchestrator_plans', {
  id: varchar('id', { length: 100 }).primaryKey(),
  sessionId: varchar('session_id', { length: 100 }),
  intent: text('intent').notNull(),
  summary: text('summary'),
  complexity: varchar('complexity', { length: 20 }), // 'simple' | 'medium' | 'complex'
  status: varchar('status', { length: 20 }).notNull().default('planning'), // 'planning' | 'running' | 'done' | 'failed'
  subTasks: jsonb('sub_tasks').notNull().$type<Array<{
    id: string;
    title: string;
    description: string;
    assignedAgentId: string;
    fallbackAgentId?: string;
    dependsOn: string[];
    status: string;
    startedAt?: number;
    finishedAt?: number;
    output?: string;
    producedArtifactId?: string;
    acceptanceCriteria?: string[];
    retryCount?: number;
    reviewVerdict?: string;
    reviewScore?: number;
    reviewFeedback?: string;
  }>>(),
  parallelism: jsonb('parallelism').$type<string[][]>(),
  skipReview: boolean('skip_review').default(false),
  sessionId2: varchar('session_id_2', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sessionIdx: index('idx_plan_session').on(table.sessionId),
  statusIdx: index('idx_plan_status').on(table.status),
}));

// ── execution_traces ──
export const executionTraces = pgTable('execution_traces', {
  id: uuid('id').defaultRandom().primaryKey(),
  planId: varchar('plan_id', { length: 100 }).notNull(),
  taskId: varchar('task_id', { length: 100 }),
  step: varchar('step', { length: 200 }).notNull(),
  phase: varchar('phase', { length: 20 }).notNull(), // 'planning' | 'execution' | 'review' | 'synthesis' | 'error'
  input: jsonb('input'),
  output: jsonb('output'),
  durationMs: integer('duration_ms').default(0),
  metadata: jsonb('metadata'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
}, (table) => ({
  planIdx: index('idx_trace_plan').on(table.planId),
  taskIdx: index('idx_trace_task').on(table.taskId),
  phaseIdx: index('idx_trace_phase').on(table.phase),
}));

// ── deploys ──
export const deploys = pgTable('deploys', {
  id: uuid('id').defaultRandom().primaryKey(),
  artifactId: uuid('artifact_id')
    .notNull()
    .references(() => artifacts.id),
  step: varchar('step', { length: 20 }).notNull(), // 'building' | 'uploading' | 'live' | 'failed'
  progress: integer('progress').default(0),
  url: text('url'),
  message: text('message'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});
