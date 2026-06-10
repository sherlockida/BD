/**
 * Execution Trace Logger — structured, queryable execution logs for debugging.
 *
 * Every orchestrator step (plan, assign, execute, review, synthesize) is recorded
 * with input, output, duration, and metadata. Enables "time travel" debugging.
 */
import type { TraceEntry } from '../types';

// ────────────────────────────────────────────────────────────
// In-memory trace store (Phase 5: also persist to DB)
// ────────────────────────────────────────────────────────────

const traces: TraceEntry[] = [];
const tracesByPlan = new Map<string, TraceEntry[]>();
const tracesByTask = new Map<string, TraceEntry[]>();
const MAX_IN_MEMORY = 10_000;

// ────────────────────────────────────────────────────────────
// Trace creation
// ────────────────────────────────────────────────────────────

let traceIdCounter = 0;

function traceUid(): string {
  return `trace_${++traceIdCounter}_${Date.now()}`;
}

export interface TraceOptions {
  planId: string;
  taskId?: string;
  step: string;
  phase: TraceEntry['phase'];
  input?: unknown;
  output?: unknown;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export function recordTrace(opts: TraceOptions): TraceEntry {
  const entry: TraceEntry = {
    id: traceUid(),
    planId: opts.planId,
    taskId: opts.taskId,
    step: opts.step,
    phase: opts.phase,
    input: opts.input,
    output: opts.output,
    durationMs: opts.durationMs,
    timestamp: Date.now(),
    metadata: opts.metadata,
  };

  // Main store
  traces.push(entry);
  if (traces.length > MAX_IN_MEMORY) {
    traces.splice(0, traces.length - MAX_IN_MEMORY);
  }

  // Per-plan index
  if (!tracesByPlan.has(entry.planId)) {
    tracesByPlan.set(entry.planId, []);
  }
  tracesByPlan.get(entry.planId)!.push(entry);

  // Per-task index
  if (entry.taskId) {
    if (!tracesByTask.has(entry.taskId)) {
      tracesByTask.set(entry.taskId, []);
    }
    tracesByTask.get(entry.taskId)!.push(entry);
  }

  return entry;
}

// ────────────────────────────────────────────────────────────
// Convenience recorders
// ────────────────────────────────────────────────────────────

export function tracePlan(planId: string, step: string, input?: unknown, output?: unknown): TraceEntry {
  return recordTrace({ planId, step, phase: 'planning', input, output, durationMs: 0 });
}

export function traceExecution(planId: string, taskId: string, step: string, durationMs: number): TraceEntry {
  return recordTrace({ planId, taskId, step, phase: 'execution', durationMs });
}

export function traceReview(planId: string, taskId: string, step: string, output?: unknown): TraceEntry {
  return recordTrace({ planId, taskId, step, phase: 'review', output, durationMs: 0 });
}

export function traceError(planId: string, taskId: string | undefined, step: string, error: unknown): TraceEntry {
  return recordTrace({
    planId,
    taskId,
    step,
    phase: 'error',
    metadata: { error: String(error) },
    durationMs: 0,
  });
}

// ────────────────────────────────────────────────────────────
// Timing helper
// ────────────────────────────────────────────────────────────

/**
 * Wrap a function execution with trace recording (measures duration).
 */
export async function withTrace<T>(
  planId: string,
  taskId: string | undefined,
  step: string,
  phase: TraceEntry['phase'],
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = performance.now() - start;
    recordTrace({
      planId,
      taskId,
      step,
      phase,
      output: result,
      durationMs,
    });
    return result;
  } catch (err) {
    const durationMs = performance.now() - start;
    recordTrace({
      planId,
      taskId,
      step,
      phase: 'error',
      metadata: { error: String(err) },
      durationMs,
    });
    throw err;
  }
}

// ────────────────────────────────────────────────────────────
// Query API
// ────────────────────────────────────────────────────────────

export function getTracesByPlan(planId: string): TraceEntry[] {
  return tracesByPlan.get(planId) ?? [];
}

export function getTracesByTask(taskId: string): TraceEntry[] {
  return tracesByTask.get(taskId) ?? [];
}

export function getTracesByPhase(planId: string, phase: TraceEntry['phase']): TraceEntry[] {
  return (tracesByPlan.get(planId) ?? []).filter(t => t.phase === phase);
}

export function getErrorTraces(planId: string): TraceEntry[] {
  return (tracesByPlan.get(planId) ?? []).filter(t => t.phase === 'error');
}

export function getPlanTimeline(planId: string): { step: string; durationMs: number; phase: string }[] {
  return (tracesByPlan.get(planId) ?? []).map(t => ({
    step: t.step,
    durationMs: t.durationMs,
    phase: t.phase,
  }));
}

// ────────────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────────────

export function clearTraces(planId: string): void {
  // Get all task IDs related to this plan before deleting
  const planTraces = tracesByPlan.get(planId) ?? [];
  const taskIds = new Set(planTraces.map(t => t.taskId).filter(Boolean) as string[]);

  // Clear per-plan index
  tracesByPlan.delete(planId);

  // Clear per-task index for all related tasks
  for (const taskId of taskIds) {
    tracesByTask.delete(taskId);
  }

  // Also remove from main traces array
  for (let i = traces.length - 1; i >= 0; i--) {
    if (traces[i]!.planId === planId) {
      traces.splice(i, 1);
    }
  }
}

export function getAllTraces(): readonly TraceEntry[] {
  return traces;
}
