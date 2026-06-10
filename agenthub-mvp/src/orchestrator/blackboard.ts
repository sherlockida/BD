/**
 * Shared Blackboard — central knowledge repository for multi-agent collaboration.
 *
 * Based on the bMAS (2025) paper: public/private space separation enables
 * both collaboration (shared facts) and debate (private critiques).
 *
 * Key design decisions:
 * - In-memory Map for Phase 3, serializable to JSON for PG persistence
 * - Public space: facts, decisions, artifact refs, constraints, progress
 * - Private space: per-agent drafts, concerns, proposed changes
 * - Thread-safe: all mutations go through controlled methods
 */
import type {
  BlackboardData,
  BlackboardFact,
  BlackboardDecision,
  BlackboardArtRef,
  BlackboardProgress,
  BlackboardPrivateSpace,
  ProposedChange,
  ArtifactType,
} from '../types';

// ────────────────────────────────────────────────────────────
// Singleton Blackboard Store
// ────────────────────────────────────────────────────────────

const boards = new Map<string, BlackboardData>();

// ────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────

let idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}_${++idCounter}_${Date.now()}`;
}

export function createBlackboard(planId: string, totalTasks: number): BlackboardData {
  const board: BlackboardData = {
    planId,
    public: {
      facts: [],
      decisions: [],
      artifacts: [],
      constraints: [],
      progress: {
        totalTasks,
        completed: 0,
        currentPhase: 'planning',
        startedAt: Date.now(),
        stalledTasks: [],
      },
    },
    private: {},
  };
  boards.set(planId, board);
  return board;
}

// ────────────────────────────────────────────────────────────
// Public: Facts
// ────────────────────────────────────────────────────────────

export function addFact(
  planId: string,
  content: string,
  addedBy: string,
  confidence = 1.0,
): BlackboardFact {
  const board = boards.get(planId);
  if (!board) throw new Error(`Blackboard not found: ${planId}`);

  const fact: BlackboardFact = {
    id: uid('fact'),
    content,
    addedBy,
    addedAt: Date.now(),
    confidence,
  };

  board.public.facts.push(fact);
  return fact;
}

export function getFacts(planId: string): BlackboardFact[] {
  return boards.get(planId)?.public.facts ?? [];
}

// ────────────────────────────────────────────────────────────
// Public: Decisions
// ────────────────────────────────────────────────────────────

export function addDecision(
  planId: string,
  content: string,
  madeBy: string,
  rationale: string,
  overrides?: string,
): BlackboardDecision {
  const board = boards.get(planId);
  if (!board) throw new Error(`Blackboard not found: ${planId}`);

  const decision: BlackboardDecision = {
    id: uid('dec'),
    content,
    madeBy,
    madeAt: Date.now(),
    rationale,
    overrides,
  };

  board.public.decisions.push(decision);
  return decision;
}

export function getDecisions(planId: string): BlackboardDecision[] {
  return boards.get(planId)?.public.decisions ?? [];
}

// ────────────────────────────────────────────────────────────
// Public: Artifact Refs
// ────────────────────────────────────────────────────────────

export function addArtifactRef(
  planId: string,
  artifactId: string,
  name: string,
  type: ArtifactType,
  producedBy: string,
): BlackboardArtRef {
  const board = boards.get(planId);
  if (!board) throw new Error(`Blackboard not found: ${planId}`);

  const ref: BlackboardArtRef = {
    artifactId,
    name,
    type,
    producedBy,
    producedAt: Date.now(),
    status: 'draft',
  };

  board.public.artifacts.push(ref);
  return ref;
}

export function updateArtifactStatus(
  planId: string,
  artifactId: string,
  status: 'draft' | 'reviewed' | 'final',
): void {
  const board = boards.get(planId);
  if (!board) return;
  const ref = board.public.artifacts.find(a => a.artifactId === artifactId);
  if (ref) ref.status = status;
}

export function getArtifactRefs(planId: string): BlackboardArtRef[] {
  return boards.get(planId)?.public.artifacts ?? [];
}

// ────────────────────────────────────────────────────────────
// Public: Constraints
// ────────────────────────────────────────────────────────────

export function addConstraint(planId: string, constraint: string): void {
  const board = boards.get(planId);
  if (board) board.public.constraints.push(constraint);
}

export function getConstraints(planId: string): string[] {
  return boards.get(planId)?.public.constraints ?? [];
}

// ────────────────────────────────────────────────────────────
// Public: Progress
// ────────────────────────────────────────────────────────────

export function updateProgress(
  planId: string,
  update: Partial<BlackboardProgress>,
): void {
  const board = boards.get(planId);
  if (!board) return;
  Object.assign(board.public.progress, update);
}

export function markTaskComplete(planId: string): void {
  const board = boards.get(planId);
  if (!board) return;
  board.public.progress.completed++;
  if (board.public.progress.completed >= board.public.progress.totalTasks) {
    board.public.progress.currentPhase = 'done';
  }
}

export function markTaskStalled(planId: string, taskId: string): void {
  const board = boards.get(planId);
  if (!board) return;
  if (!board.public.progress.stalledTasks.includes(taskId)) {
    board.public.progress.stalledTasks.push(taskId);
  }
}

export function unmarkTaskStalled(planId: string, taskId: string): void {
  const board = boards.get(planId);
  if (!board) return;
  board.public.progress.stalledTasks = board.public.progress.stalledTasks.filter(
    id => id !== taskId,
  );
}

export function getProgress(planId: string): BlackboardProgress | null {
  return boards.get(planId)?.public.progress ?? null;
}

// ────────────────────────────────────────────────────────────
// Private Spaces
// ────────────────────────────────────────────────────────────

export function getOrCreatePrivateSpace(planId: string, agentId: string): BlackboardPrivateSpace {
  const board = boards.get(planId);
  if (!board) throw new Error(`Blackboard not found: ${planId}`);

  if (!board.private[agentId]) {
    board.private[agentId] = {
      agentId,
      drafts: [],
      concerns: [],
      proposedChanges: [],
    };
  }
  return board.private[agentId];
}

export function addConcern(
  planId: string,
  agentId: string,
  concern: string,
): void {
  const space = getOrCreatePrivateSpace(planId, agentId);
  space.concerns.push(concern);
}

export function proposeChange(
  planId: string,
  fromAgentId: string,
  targetArtifactId: string,
  targetAgentId: string,
  suggestion: string,
  priority: ProposedChange['priority'] = 'medium',
): void {
  const space = getOrCreatePrivateSpace(planId, fromAgentId);
  space.proposedChanges.push({
    targetArtifactId,
    targetAgentId,
    suggestion,
    priority,
    createdAt: Date.now(),
  });
}

export function getPrivateConcerns(planId: string, agentId: string): string[] {
  return boards.get(planId)?.private[agentId]?.concerns ?? [];
}

export function getProposedChanges(planId: string, agentId: string): ProposedChange[] {
  return boards.get(planId)?.private[agentId]?.proposedChanges ?? [];
}

// ────────────────────────────────────────────────────────────
// Blackboard Summary (for Agent System Prompt injection)
// ────────────────────────────────────────────────────────────

/**
 * Generate a concise summary of the blackboard for injection into
 * agent system prompts. This enables agents to understand the shared
 * context without reading the full blackboard.
 */
export function generateBlackboardSummary(planId: string): string {
  const board = boards.get(planId);
  if (!board) return '';

  const lines: string[] = ['## 📋 Shared Blackboard Context'];

  // Facts
  if (board.public.facts.length > 0) {
    lines.push('\n### Confirmed Facts');
    for (const f of board.public.facts) {
      lines.push(`- ${f.content} (confidence: ${(f.confidence * 100).toFixed(0)}%)`);
    }
  }

  // Decisions
  if (board.public.decisions.length > 0) {
    lines.push('\n### Decisions Made');
    for (const d of board.public.decisions) {
      lines.push(`- ${d.content} — ${d.rationale}`);
    }
  }

  // Constraints
  if (board.public.constraints.length > 0) {
    lines.push('\n### Constraints');
    for (const c of board.public.constraints) {
      lines.push(`- ${c}`);
    }
  }

  // Artifacts
  if (board.public.artifacts.length > 0) {
    lines.push('\n### Existing Artifacts');
    for (const a of board.public.artifacts) {
      lines.push(`- ${a.name} (${a.type}) by ${a.producedBy} [${a.status}]`);
    }
  }

  // Progress
  const prog = board.public.progress;
  lines.push(`\n### Progress: ${prog.completed}/${prog.totalTasks} tasks · Phase: ${prog.currentPhase}`);

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────
// Serialization (for DB persistence)
// ────────────────────────────────────────────────────────────

export function serializeBlackboard(planId: string): string {
  const board = boards.get(planId);
  if (!board) return '{}';
  return JSON.stringify(board);
}

export function deserializeBlackboard(json: string): BlackboardData {
  return JSON.parse(json) as BlackboardData;
}

// ────────────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────────────

/** Get the full blackboard data for a plan */
export function getBlackboard(planId: string): BlackboardData | undefined {
  return boards.get(planId);
}

export function destroyBlackboard(planId: string): void {
  boards.delete(planId);
}

export function getAllBoardIds(): string[] {
  return Array.from(boards.keys());
}
