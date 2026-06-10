/**
 * Saga Transaction Manager — compensatable multi-step operations.
 *
 * Based on SagaLLM (VLDB 2025): each subtask can define a compensate()
 * operation. If a downstream task fails after an upstream task has
 * produced side effects, the compensation chain is executed in reverse
 * to rollback the system to a consistent state.
 *
 * Phase 5: Basic implementation with in-memory compensation registry.
 */
import type { SagaOperation } from '../types';
import { recordTrace } from './trace';

// ────────────────────────────────────────────────────────────
// Compensation Registry
// ────────────────────────────────────────────────────────────

const sagas = new Map<string, SagaOperation[]>();

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Register a compensatable operation for a plan.
 */
export function registerSagaOperation(
  planId: string,
  taskId: string,
  action: string,
  compensate: () => Promise<void> | void,
): void {
  if (!sagas.has(planId)) {
    sagas.set(planId, []);
  }
  sagas.get(planId)!.push({
    taskId,
    action,
    compensate,
    status: 'pending',
  });
}

/**
 * Mark an operation as successfully executed (no compensation needed).
 */
export function markSagaExecuted(planId: string, taskId: string): void {
  const ops = sagas.get(planId);
  if (!ops) return;
  const op = ops.find(o => o.taskId === taskId);
  if (op) op.status = 'executed';
}

/**
 * Execute compensation chain in REVERSE order.
 * Called when a downstream task fails and upstream tasks
 * have already produced side effects.
 */
export async function compensate(
  planId: string,
  fromTaskId: string,
): Promise<{ success: boolean; compensated: string[]; failed: string[] }> {
  const ops = sagas.get(planId);
  if (!ops || ops.length === 0) {
    return { success: true, compensated: [], failed: [] };
  }

  // Find the index of the failing task
  const fromIndex = ops.findIndex(o => o.taskId === fromTaskId);
  if (fromIndex === -1) {
    return { success: true, compensated: [], failed: [] };
  }

  // Compensate all EXECUTED operations before the failing one, in reverse
  const toCompensate = ops.slice(0, fromIndex).reverse();
  const compensated: string[] = [];
  const failed: string[] = [];

  for (const op of toCompensate) {
    if (op.status !== 'executed') continue;

    try {
      await op.compensate();
      op.status = 'compensated';
      compensated.push(op.taskId);
      recordTrace({
        planId,
        taskId: op.taskId,
        step: `Saga compensate: ${op.action}`,
        phase: 'error',
        durationMs: 0,
      });
    } catch (err) {
      op.status = 'failed';
      failed.push(op.taskId);
      recordTrace({
        planId,
        taskId: op.taskId,
        step: `Saga compensate FAILED: ${op.action}`,
        phase: 'error',
        metadata: { error: String(err) },
        durationMs: 0,
      });
    }
  }

  return {
    success: failed.length === 0,
    compensated,
    failed,
  };
}

/**
 * Check if any operations in a plan need compensation.
 */
export function getCompensatableOperations(planId: string): SagaOperation[] {
  return (sagas.get(planId) ?? []).filter(o => o.status === 'executed');
}

export function getSagaStatus(planId: string): SagaOperation[] {
  return sagas.get(planId) ?? [];
}

export function clearSaga(planId: string): void {
  sagas.delete(planId);
}
