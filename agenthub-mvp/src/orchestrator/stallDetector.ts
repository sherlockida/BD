/**
 * Stall Detector — monitors task progress and detects stuck tasks.
 *
 * Based on MagenticOne's approach: track token output rate and artifact
 * generation. If a task produces nothing for N consecutive rounds, it's stalled.
 *
 * When stall is detected, the Supervisor can replan (reassign, split, or simplify).
 */
import type { StallConfig } from '../types';

// ────────────────────────────────────────────────────────────
// Default Configuration
// ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: StallConfig = {
  checkIntervalMs: 10_000,    // 10 seconds
  maxSilentRounds: 3,         // 3 rounds without output = stall
  minTokenRate: 5,            // 5 tokens per interval = minimum "alive" signal
};

// ────────────────────────────────────────────────────────────
// Per-Task State
// ────────────────────────────────────────────────────────────

interface TaskActivityState {
  taskId: string;
  agentId: string;
  startedAt: number;
  lastOutputAt: number;
  tokensProduced: number;
  artifactsProduced: number;
  silentRounds: number;
  isStalled: boolean;
  currentTokenRate: number;   // tokens per check interval
}

const taskStates = new Map<string, TaskActivityState>();

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export function startTracking(
  taskId: string,
  agentId: string,
  config: Partial<StallConfig> = {},
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  taskStates.set(taskId, {
    taskId,
    agentId,
    startedAt: Date.now(),
    lastOutputAt: Date.now(),
    tokensProduced: 0,
    artifactsProduced: 0,
    silentRounds: 0,
    isStalled: false,
    currentTokenRate: cfg.minTokenRate, // Start above threshold
  });
}

export function recordTokenOutput(taskId: string, tokenCount: number): void {
  const state = taskStates.get(taskId);
  if (!state) return;
  state.tokensProduced += tokenCount;
  state.lastOutputAt = Date.now();
  state.silentRounds = 0;
  state.isStalled = false;
}

export function recordArtifactOutput(taskId: string): void {
  const state = taskStates.get(taskId);
  if (!state) return;
  state.artifactsProduced++;
  state.lastOutputAt = Date.now();
  state.silentRounds = 0;
  state.isStalled = false;
}

/**
 * Check if a task is stalled. Called periodically by the scheduler.
 * Returns true if the task just transitioned to stalled state.
 */
export function checkStall(
  taskId: string,
  config: Partial<StallConfig> = {},
): { isStalled: boolean; justStalled: boolean; details: string } {
  const state = taskStates.get(taskId);
  if (!state) {
    return { isStalled: false, justStalled: false, details: 'Not tracked' };
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const wasStalled = state.isStalled;
  const elapsedSinceLastOutput = Date.now() - state.lastOutputAt;

  // Calculate current token rate (tokens per interval)
  const totalElapsed = Math.max(Date.now() - state.startedAt, 1);
  const intervals = totalElapsed / cfg.checkIntervalMs;
  state.currentTokenRate = intervals > 0 ? state.tokensProduced / intervals : 0;

  // Consider stalled if token rate below threshold AND no output recently
  const lowTokenRate = state.currentTokenRate < cfg.minTokenRate;
  const silentTooLong = elapsedSinceLastOutput > cfg.checkIntervalMs * cfg.maxSilentRounds;

  if (silentTooLong || (lowTokenRate && elapsedSinceLastOutput > cfg.checkIntervalMs)) {
    state.silentRounds++;
    if (state.silentRounds >= cfg.maxSilentRounds) {
      state.isStalled = true;
    }
  }

  const justStalled = state.isStalled && !wasStalled;
  const details = state.isStalled
    ? `Stalled: ${state.silentRounds} silent rounds, rate=${state.currentTokenRate.toFixed(1)} tok/interval`
    : `Active: rate=${state.currentTokenRate.toFixed(1)} tok/interval`;

  return { isStalled: state.isStalled, justStalled, details };
}

/**
 * Check all tracked tasks for stalls. Returns list of stalled task IDs.
 */
export function checkAllStalls(
  config: Partial<StallConfig> = {},
): Array<{ taskId: string; agentId: string; details: string }> {
  const stalled: Array<{ taskId: string; agentId: string; details: string }> = [];
  for (const [taskId, state] of taskStates) {
    const result = checkStall(taskId, config);
    if (result.isStalled) {
      stalled.push({ taskId: state.taskId, agentId: state.agentId, details: result.details });
    }
  }
  return stalled;
}

export function getTaskActivity(taskId: string): TaskActivityState | null {
  return taskStates.get(taskId) ?? null;
}

export function stopTracking(taskId: string): void {
  taskStates.delete(taskId);
}

export function clearAllTracking(): void {
  taskStates.clear();
}

export function getActiveTaskCount(): number {
  return taskStates.size;
}
