/**
 * Trace Logger Tests — validates execution trace recording and querying.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
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
  getAllTraces,
} from '../trace';

const PLAN_ID = 'plan_test_trace';

beforeEach(() => {
  clearTraces(PLAN_ID);
});

describe('Trace - Recording', () => {
  it('records a trace entry with all fields', () => {
    const entry = recordTrace({
      planId: PLAN_ID,
      taskId: 'task_1',
      step: 'Agent selection',
      phase: 'planning',
      input: { intent: 'test' },
      output: { agentId: 'agent_1' },
      durationMs: 5,
      metadata: { algo: 'weighted' },
    });

    expect(entry.id).toBeDefined();
    expect(entry.planId).toBe(PLAN_ID);
    expect(entry.taskId).toBe('task_1');
    expect(entry.phase).toBe('planning');
    expect(entry.durationMs).toBe(5);
  });

  it('tracePlan records planning phase', () => {
    const entry = tracePlan(PLAN_ID, 'Plan generation', { intent: 'test' });
    expect(entry.phase).toBe('planning');
    expect(entry.step).toBe('Plan generation');
  });

  it('traceExecution records execution phase', () => {
    const entry = traceExecution(PLAN_ID, 'task_1', 'Running agent', 1500);
    expect(entry.phase).toBe('execution');
    expect(entry.durationMs).toBe(1500);
  });

  it('traceError records error phase with metadata', () => {
    const entry = traceError(PLAN_ID, 'task_1', 'Agent crashed', new Error('test error'));
    expect(entry.phase).toBe('error');
    expect(entry.metadata?.error).toBeDefined();
  });

  it('withTrace wraps async function and records timing', async () => {
    const result = await withTrace(PLAN_ID, 'task_1', 'Test operation', 'execution', async () => {
      return 'success';
    });

    expect(result).toBe('success');
    const traces = getTracesByPlan(PLAN_ID);
    expect(traces.length).toBeGreaterThanOrEqual(1);
    expect(traces[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('withTrace records error on exception', async () => {
    try {
      await withTrace(PLAN_ID, 'task_1', 'Failing operation', 'execution', async () => {
        throw new Error('Boom');
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      // Expected
    }

    const errors = getErrorTraces(PLAN_ID);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Trace - Querying', () => {
  beforeEach(() => {
    recordTrace({ planId: PLAN_ID, taskId: 'task_1', step: 'Step 1', phase: 'planning', durationMs: 10 });
    recordTrace({ planId: PLAN_ID, taskId: 'task_1', step: 'Step 2', phase: 'execution', durationMs: 1500 });
    recordTrace({ planId: PLAN_ID, taskId: 'task_2', step: 'Step 3', phase: 'execution', durationMs: 2000 });
    recordTrace({ planId: PLAN_ID, taskId: undefined, step: 'Plan error', phase: 'error', durationMs: 0, metadata: { error: 'Test error' } });
  });

  it('queries traces by plan ID', () => {
    const traces = getTracesByPlan(PLAN_ID);
    expect(traces.length).toBe(4);
  });

  it('queries traces by task ID', () => {
    const t1 = getTracesByTask('task_1');
    expect(t1.length).toBe(2);

    const t2 = getTracesByTask('task_2');
    expect(t2.length).toBe(1);
  });

  it('queries error traces', () => {
    const errors = getErrorTraces(PLAN_ID);
    expect(errors.length).toBe(1);
    expect(errors[0]!.phase).toBe('error');
  });

  it('generates plan timeline', () => {
    const timeline = getPlanTimeline(PLAN_ID);
    expect(timeline.length).toBe(4);
  });
});

describe('Trace - Cleanup', () => {
  it('clears traces for a plan', () => {
    recordTrace({ planId: PLAN_ID, step: 'Test', phase: 'planning', durationMs: 0 });
    expect(getTracesByPlan(PLAN_ID).length).toBeGreaterThan(0);

    clearTraces(PLAN_ID);
    expect(getTracesByPlan(PLAN_ID).length).toBe(0);
  });
});
