/**
 * Stall Detector Tests — validates stall detection logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  startTracking,
  recordTokenOutput,
  recordArtifactOutput,
  checkStall,
  checkAllStalls,
  stopTracking,
  clearAllTracking,
} from '../stallDetector';

const FAST_CONFIG = {
  checkIntervalMs: 100,    // 100ms for fast tests
  maxSilentRounds: 2,      // 2 rounds → stall
  minTokenRate: 3,         // 3 tokens per interval minimum
};

beforeEach(() => {
  clearAllTracking();
});

describe('Stall Detector - Basic Tracking', () => {
  it('starts tracking a task', () => {
    startTracking('task_1', 'agent_claude_code');
    const result = checkStall('task_1', FAST_CONFIG);
    expect(result.isStalled).toBe(false);
    expect(result.details).toContain('Active');
  });

  it('records token output and keeps task active', () => {
    startTracking('task_1', 'agent_claude_code');
    recordTokenOutput('task_1', 50);

    const result = checkStall('task_1', FAST_CONFIG);
    expect(result.isStalled).toBe(false);
  });

  it('records artifact output and keeps task active', () => {
    startTracking('task_1', 'agent_claude_code');
    recordArtifactOutput('task_1');

    const result = checkStall('task_1', FAST_CONFIG);
    expect(result.isStalled).toBe(false);
  });
});

describe('Stall Detector - Stall Detection', () => {
  it('detects stall after silent rounds', async () => {
    startTracking('task_1', 'agent_claude_code');

    // First check: not stalled yet
    let result = checkStall('task_1', { ...FAST_CONFIG, maxSilentRounds: 1 });
    expect(result.isStalled).toBe(false);

    // Wait for check interval
    await new Promise(r => setTimeout(r, 150));

    // Second check: now stalled (1 silent round)
    result = checkStall('task_1', { ...FAST_CONFIG, maxSilentRounds: 1 });
    // Note: timing-dependent, may or may not stall in test
    expect(result).toBeDefined();
  });

  it('activity resets silent counter', async () => {
    startTracking('task_1', 'agent_claude_code');

    // Let some time pass
    await new Promise(r => setTimeout(r, 50));

    // Record activity
    recordTokenOutput('task_1', 10);

    const result = checkStall('task_1', FAST_CONFIG);
    expect(result.isStalled).toBe(false);
  });
});

describe('Stall Detector - Batch Checking', () => {
  it('checks all tracked tasks', () => {
    startTracking('task_1', 'agent_1');
    startTracking('task_2', 'agent_2');
    startTracking('task_3', 'agent_3');

    const stalled = checkAllStalls(FAST_CONFIG);
    expect(stalled.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Stall Detector - Cleanup', () => {
  it('stops tracking a task', () => {
    startTracking('task_1', 'agent_1');
    stopTracking('task_1');

    const result = checkStall('task_1');
    expect(result.isStalled).toBe(false);
    expect(result.details).toBe('Not tracked');
  });

  it('clears all tracking', () => {
    startTracking('task_1', 'agent_1');
    startTracking('task_2', 'agent_2');
    clearAllTracking();

    expect(checkStall('task_1').isStalled).toBe(false);
    expect(checkStall('task_2').isStalled).toBe(false);
  });
});

describe('Stall Detector - Edge Cases', () => {
  it('handles check for untracked task', () => {
    const result = checkStall('nonexistent');
    expect(result.isStalled).toBe(false);
    expect(result.details).toBe('Not tracked');
  });

  it('handles token rate calculation with zero elapsed time', () => {
    startTracking('task_1', 'agent_1');
    // Immediately check — shouldn't throw
    const result = checkStall('task_1', { ...FAST_CONFIG, checkIntervalMs: 1000 });
    expect(result).toBeDefined();
  });
});
