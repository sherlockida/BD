/**
 * Saga Transaction Tests — validates compensation logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSagaOperation,
  markSagaExecuted,
  compensate,
  getCompensatableOperations,
  clearSaga,
} from '../saga';

const PLAN_ID = 'plan_saga_test';

beforeEach(() => {
  clearSaga(PLAN_ID);
});

describe('Saga - Registration', () => {
  it('registers compensatable operations', () => {
    let compensated = false;
    registerSagaOperation(PLAN_ID, 'task_1', 'Create file', async () => {
      compensated = true;
    });

    const ops = getCompensatableOperations(PLAN_ID);
    expect(ops.length).toBe(0); // Not executed yet

    markSagaExecuted(PLAN_ID, 'task_1');
    const executedOps = getCompensatableOperations(PLAN_ID);
    expect(executedOps.length).toBe(1);
    expect(executedOps[0]!.action).toBe('Create file');
  });
});

describe('Saga - Compensation', () => {
  it('compensates executed operations in reverse on failure', async () => {
    const compensationLog: string[] = [];

    registerSagaOperation(PLAN_ID, 'task_1', 'Create file', async () => {
      compensationLog.push('rollback task_1');
    });
    registerSagaOperation(PLAN_ID, 'task_2', 'Update DB', async () => {
      compensationLog.push('rollback task_2');
    });
    registerSagaOperation(PLAN_ID, 'task_3', 'Deploy', async () => {
      compensationLog.push('rollback task_3');
    });

    // Mark first two as executed
    markSagaExecuted(PLAN_ID, 'task_1');
    markSagaExecuted(PLAN_ID, 'task_2');
    // task_3 fails

    const result = await compensate(PLAN_ID, 'task_3');

    expect(result.success).toBe(true);
    // task_2 should be compensated BEFORE task_1 (reverse order)
    expect(compensationLog[0]).toBe('rollback task_2');
    expect(compensationLog[1]).toBe('rollback task_1');
    expect(result.compensated).toHaveLength(2);
  });

  it('reports failed compensations', async () => {
    registerSagaOperation(PLAN_ID, 'task_1', 'Create file', async () => {
      throw new Error('Cannot rollback');
    });
    registerSagaOperation(PLAN_ID, 'task_2', 'Update DB', async () => {
      // This one would be fine, but task_1 fails
    });

    markSagaExecuted(PLAN_ID, 'task_1');
    // task_2 fails → compensate task_1 (which throws)

    const result = await compensate(PLAN_ID, 'task_2');
    expect(result.success).toBe(false);
    expect(result.failed).toHaveLength(1);
    expect(result.compensated).toHaveLength(0);
  });

  it('skips non-executed operations', async () => {
    const log: string[] = [];
    registerSagaOperation(PLAN_ID, 'task_1', 'Op 1', async () => { log.push('r1'); });
    registerSagaOperation(PLAN_ID, 'task_2', 'Op 2', async () => { log.push('r2'); });

    // Only task_1 executed
    markSagaExecuted(PLAN_ID, 'task_1');
    // task_2 never executed → should not be compensated

    const result = await compensate(PLAN_ID, 'task_2');
    expect(result.compensated).toHaveLength(1); // Only task_1
    expect(log).toHaveLength(1);
  });
});

describe('Saga - Edge Cases', () => {
  it('handles compensation with empty saga', async () => {
    const result = await compensate(PLAN_ID, 'task_1');
    expect(result.success).toBe(true);
    expect(result.compensated).toHaveLength(0);
  });

  it('handles unknown task in compensation', async () => {
    registerSagaOperation(PLAN_ID, 'task_1', 'Op 1', async () => {});
    markSagaExecuted(PLAN_ID, 'task_1');

    const result = await compensate(PLAN_ID, 'nonexistent');
    expect(result.success).toBe(true);
  });

  it('clears saga state', () => {
    registerSagaOperation(PLAN_ID, 'task_1', 'Op', async () => {});
    clearSaga(PLAN_ID);
    expect(getCompensatableOperations(PLAN_ID)).toHaveLength(0);
  });
});
