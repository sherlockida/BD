/**
 * Scheduler 2.1 — DAG scheduler with deadlock fix, upstream context, artifact binding,
 * GenUI pause/resume, timeout, retry, stall detection, and blackboard.
 *
 * Upgrades from v2.0:
 *   - Phase 1: DAG deadlock fix (failed deps don't block downstream)
 *   - Phase 1: Artifact binding (producedArtifactId filled on first artifact-draft)
 *   - Phase 2: Upstream context injection (dependent tasks receive upstream outputs)
 *   - Phase 3: GenUI pause/resume (ui-component chunks pause task, user input resumes)
 */
import type {
  SubTask,
  OrchestratorPlan,
  IAgent,
  AgentInput,
  Conversation,
  Message,
  AgentChunk,
} from '../types';
import { agentRegistry } from '../agents/registry';
import {
  startTracking,
  recordTokenOutput,
  recordArtifactOutput,
  stopTracking,
} from './stallDetector';
import {
  addArtifactRef,
  addFact,
  markTaskComplete,
} from './blackboard';
import { recordTrace } from './trace';
import { DEFAULT_TIMEOUTS } from './supervisor';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface ScheduleEvents {
  onTaskStart(task: SubTask): void;
  onTaskChunk(task: SubTask, chunk: AgentChunk): void;
  onTaskDone(task: SubTask, success: boolean, errorMsg?: string): void;
  onFallback(task: SubTask, fromAgentId: string, toAgentId: string): void;
  /** Phase 3: called when an agent emits a GenUI component (ChoiceCards etc.) */
  onUiPause?(task: SubTask, chunk: AgentChunk): void;
  onStall?(task: SubTask, details: string): void;
  onTimeout?(task: SubTask): void;
  /** Phase 3: called when a UI-paused task is resumed with user input */
  onUiResume?(task: SubTask, userInput: string): void;
}

export interface ScheduleOptions {
  /** Per-task timeout in ms (default 120000) */
  taskTimeoutMs?: number;
  /** Total plan timeout in ms (default 600000) */
  planTimeoutMs?: number;
  /** Max retries per task (default 1) */
  maxRetries?: number;
  /** Enable stall detection (default true) */
  stallDetection?: boolean;
  /** Enable blackboard integration (default true) */
  blackboard?: boolean;
  /** Phase 3: user input map (taskId → user's choice) for resumed tasks */
  userInputs?: Map<string, string>;
}

// ────────────────────────────────────────────────────────────
// Retry with Exponential Backoff
// ────────────────────────────────────────────────────────────

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

function backoffDelay(retryCount: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────
// Main Scheduler
// ────────────────────────────────────────────────────────────

export async function schedule(
  plan: OrchestratorPlan,
  context: { conversation: Conversation; history: Message[]; contextArtifacts?: import('../types').Artifact[] },
  events: ScheduleEvents,
  options: ScheduleOptions = {},
): Promise<void> {
  const {
    taskTimeoutMs = DEFAULT_TIMEOUTS.perTask,
    planTimeoutMs = DEFAULT_TIMEOUTS.totalPlan,
    maxRetries = 1,
    stallDetection = true,
    blackboard: useBlackboard = true,
    userInputs,
  } = options;

  const finished = new Set<string>();
  const failed = new Set<string>();
  const inflight = new Map<string, Promise<void>>();
  const planStartTime = Date.now();
  let planTimedOut = false;

  // Plan-level timeout
  const planTimeout = setTimeout(() => {
    planTimedOut = true;
    recordTrace({
      planId: plan.id,
      step: 'Plan timeout reached',
      phase: 'error',
      metadata: { timeoutMs: planTimeoutMs },
      durationMs: 0,
    });
  }, planTimeoutMs);

  /** Build upstream context string for a task from completed dependencies */
  function buildUpstreamContext(task: SubTask): string {
    const parts: string[] = [];
    for (const depId of task.dependsOn) {
      const depTask = plan.subTasks.find(t => t.id === depId);
      if (!depTask) continue;
      if (depTask.status === 'failed') {
        parts.push(`⚠️ 上游任务 "${depTask.title}" 失败。请在能力范围内尽量覆盖其产出。`);
      } else if (depTask.producedArtifactId || depTask.output) {
        const summary = depTask.output
          ? depTask.output.substring(0, 500)
          : `产物: ${depTask.producedArtifactId}`;
        parts.push(`[上游任务: ${depTask.title} (${depTask.status})]\n${summary}`);
      }
    }
    // Also inject user input if this is a resumed task
    const uiInput = userInputs?.get(task.id);
    if (uiInput) {
      parts.push(`[用户选择]\n${uiInput}`);
    }
    return parts.join('\n\n');
  }

  // ── Run one task ──
  const runOne = async (task: SubTask): Promise<void> => {
    events.onTaskStart(task);

    // Init stall tracking
    if (stallDetection) {
      startTracking(task.id, task.assignedAgentId);
    }

    let agent: IAgent | undefined = agentRegistry.get(task.assignedAgentId);
    let ok = false;
    let paused = false;
    let lastError: string | undefined;
    let retryCount = 0;
    let producedFirstArtifact = false;

    // ── Try with retry + backoff ──
    const tryRun = async (a: IAgent): Promise<'success' | 'failed' | 'paused'> => {
      const upstream = buildUpstreamContext(task);
      const input: AgentInput = {
        conversation: context.conversation,
        history: context.history,
        userPrompt: plan.intent,
        task,
        upstreamContext: upstream || undefined,
        contextArtifacts: context.contextArtifacts,
      };

      const taskStartTime = Date.now();
      let accumulatedText = '';

      try {
        // Task-level timeout
        const timeoutPromise = new Promise<'failed'>((_, reject) => {
          setTimeout(() => reject(new Error(`Task timeout: ${task.title} (${taskTimeoutMs}ms)`)), taskTimeoutMs);
        });

        const runPromise = (async (): Promise<'success' | 'failed' | 'paused'> => {
          let tokenCount = 0;

          for await (const chunk of a.chat(input)) {
            if (chunk.type === 'error') {
              return 'failed';
            }

            // Phase 3: GenUI component pause
            if (chunk.type === 'ui-component') {
              // Emit the UI component so the frontend renders it
              events.onTaskChunk(task, chunk);
              if (events.onUiPause) {
                events.onUiPause(task, chunk);
              }
              return 'paused';
            }

            // Accumulate text for task.output
            if (chunk.type === 'text') {
              tokenCount += Math.ceil(chunk.delta.length / 4);
              accumulatedText += chunk.delta;
              if (stallDetection) recordTokenOutput(task.id, tokenCount);
            }

            // Phase 1: Track artifact production + bind producedArtifactId
            if (chunk.type === 'artifact-draft') {
              if (stallDetection) recordArtifactOutput(task.id);

              // Bind first artifact to task
              if (!producedFirstArtifact) {
                producedFirstArtifact = true;
                task.producedArtifactId = chunk.name;
              }

              if (useBlackboard) {
                addArtifactRef(
                  plan.id,
                  chunk.name,
                  chunk.name,
                  chunk.artifactType,
                  task.assignedAgentId,
                );
              }
            }

            events.onTaskChunk(task, chunk);
          }

          // Store accumulated text as task output for downstream context
          if (accumulatedText.length > 0) {
            task.output = accumulatedText;
          }
          return 'success';
        })();

        const result = await Promise.race([runPromise, timeoutPromise]);
        const durationMs = Date.now() - taskStartTime;

        recordTrace({
          planId: plan.id,
          taskId: task.id,
          step: `Execution: ${result}`,
          phase: 'execution',
          durationMs,
          metadata: { agentId: a.meta.id, outputLen: task.output?.length ?? 0 },
        });

        return result;
      } catch (err) {
        lastError = String(err);
        recordTrace({
          planId: plan.id,
          taskId: task.id,
          step: 'Execution error',
          phase: 'error',
          metadata: { error: lastError, retryCount },
          durationMs: Date.now() - taskStartTime,
        });
        return 'failed';
      }
    };

    // ── Primary attempt ──
    if (agent) {
      const result = await tryRun(agent);
      if (result === 'paused') {
        paused = true;
      } else {
        ok = result === 'success';
      }
    }

    // ── Retry with backoff (only for failures, not pauses) ──
    while (!ok && !paused && retryCount < maxRetries && !planTimedOut) {
      retryCount++;
      const delay = backoffDelay(retryCount);
      recordTrace({
        planId: plan.id,
        taskId: task.id,
        step: `Retry ${retryCount}/${maxRetries} after ${delay}ms`,
        phase: 'execution',
        durationMs: 0,
      });

      await sleep(delay);

      const retryAgent = agentRegistry.get(task.assignedAgentId);
      if (retryAgent) {
        const result = await tryRun(retryAgent);
        if (result === 'paused') {
          paused = true;
          break;
        }
        ok = result === 'success';
      }
    }

    // ── Fallback (only for failures, not pauses) ──
    if (!ok && !paused && task.fallbackAgentId && task.fallbackAgentId !== task.assignedAgentId) {
      const fb = agentRegistry.get(task.fallbackAgentId);
      if (fb) {
        events.onFallback(task, task.assignedAgentId, fb.meta.id);

        if (stallDetection) {
          stopTracking(task.id);
          startTracking(task.id, fb.meta.id);
        }

        agent = fb;
        const result = await tryRun(fb);
        if (result === 'paused') {
          paused = true;
        } else {
          ok = result === 'success';
          if (ok) {
            task.status = 'fallback';
          }
        }
      }
    }

    // ── Cleanup ──
    if (stallDetection) stopTracking(task.id);

    // ── Done callback ──
    if (paused) {
      task.status = 'paused';
      // Don't call onTaskDone — task is waiting for user input
      // Don't add to finished or failed — task stays in limbo until resumed
    } else {
      events.onTaskDone(task, ok, ok ? undefined : (lastError ?? 'Agent execution failed'));

      if (ok) {
        finished.add(task.id);
        task.status = task.status === 'fallback' ? 'fallback' : 'success';

        // Update blackboard
        if (useBlackboard) {
          markTaskComplete(plan.id);
          if (task.output) {
            addFact(plan.id, `Task "${task.title}" completed: ${task.output.substring(0, 200)}`, task.assignedAgentId, 0.8);
          }
        }
      } else {
        failed.add(task.id);
        task.status = 'failed';
      }
    }
  };

  // ── Main scheduling loop (Phase 1: deadlock fix) ──
  // "Resolved" means the dependency is either finished or failed.
  // A failed dependency unblocks downstream tasks — they proceed with a warning
  // injected into their upstreamContext.
  while (finished.size + failed.size < plan.subTasks.length && !planTimedOut) {
    const pausedCount = plan.subTasks.filter(t => t.status === 'paused').length;
    const activeCount = finished.size + failed.size + inflight.size + pausedCount;

    if (activeCount >= plan.subTasks.length) {
      // All tasks are either done, failed, inflight, or paused — nothing new to dispatch
      if (inflight.size === 0) break;
    }

    const ready = plan.subTasks.filter(
      t =>
        !finished.has(t.id) &&
        !failed.has(t.id) &&
        t.status !== 'paused' &&
        !inflight.has(t.id) &&
        // Phase 1 FIX: a dependency is resolved if it finished OR failed
        t.dependsOn.every(d => finished.has(d) || failed.has(d)),
    );

    if (ready.length === 0 && inflight.size === 0) {
      // Check if any tasks are paused (waiting for user input)
      const stillPaused = plan.subTasks.filter(t => t.status === 'paused');
      if (stillPaused.length === 0) {
        // Truly done — no more work possible
        break;
      }
      // Tasks are paused — plan stays running, awaiting user input
      // Exit the loop to let the orchestrator handle user interaction
      break;
    }

    for (const t of ready) {
      const p = runOne(t).finally(() => inflight.delete(t.id));
      inflight.set(t.id, p);
    }

    if (inflight.size > 0) {
      await Promise.race([...inflight.values()]);
    }
  }

  // ── Plan done ──
  clearTimeout(planTimeout);

  if (planTimedOut) {
    plan.status = 'failed';
    let completedCount = 0;
    for (const task of plan.subTasks) {
      if (task.status === 'success' || task.status === 'fallback') {
        completedCount++;
        // Preserve completed artifacts — do NOT overwrite
      } else if (task.status === 'running' || task.status === 'pending') {
        task.status = 'failed';
        task.output = task.output
          ? task.output + '\n\n[⏰ 超时] 计划执行超时，该任务被截断'
          : '[⏰ 超时] 计划执行超时，任务未完成';
        if (events.onTimeout) events.onTimeout(task);
      }
      // paused tasks stay paused — user may still provide input
    }
    if (completedCount > 0) {
      plan.summary = `${plan.summary}\n\n⚠️ 计划执行超时，已完成 ${completedCount}/${plan.subTasks.length} 个任务，部分产物可用。`;
    }
  } else {
    const allResolved = finished.size + failed.size === plan.subTasks.length;
    const hasPaused = plan.subTasks.some(t => t.status === 'paused');
    if (allResolved) {
      plan.status = finished.size === plan.subTasks.length ? 'done' : 'failed';
    } else if (hasPaused) {
      plan.status = 'running'; // Still waiting for user input
    } else {
      plan.status = finished.size === plan.subTasks.length ? 'done' : 'failed';
    }
  }
}

/** Resume a paused task with user input. Returns a re-invoked agent execution. */
export async function resumePausedTask(
  task: SubTask,
  plan: OrchestratorPlan,
  context: { conversation: Conversation; history: Message[]; contextArtifacts?: import('../types').Artifact[] },
  userInput: string,
  events: ScheduleEvents,
  options: ScheduleOptions = {},
): Promise<boolean> {
  const { stallDetection = true, taskTimeoutMs = DEFAULT_TIMEOUTS.perTask, maxRetries = 1 } = options;

  const agent = agentRegistry.get(task.assignedAgentId);
  if (!agent) {
    events.onTaskDone(task, false, 'Agent not found in registry');
    return false;
  }

  events.onUiResume?.(task, userInput);

  if (stallDetection) {
    startTracking(task.id, task.assignedAgentId);
  }

  const upstream = plan.subTasks
    .filter(t => task.dependsOn.includes(t.id))
    .map(t => {
      if (t.status === 'failed') return `⚠️ 上游任务 "${t.title}" 失败，请尽量覆盖其产出。`;
      return `[上游: ${t.title}]\n${t.output?.substring(0, 500) ?? '无输出'}`;
    })
    .join('\n\n');

  const input: AgentInput = {
    conversation: context.conversation,
    history: context.history,
    userPrompt: `${plan.intent}\n\n[用户选择]\n${userInput}`,
    task,
    upstreamContext: upstream || undefined,
    contextArtifacts: context.contextArtifacts,
  };

  const taskStartTime = Date.now();
  let ok = false;
  let retryCount = 0;

  // ── Try with retry + backoff ──
  const tryOnce = async (a: IAgent): Promise<boolean> => {
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      setTimeout(() => reject(new Error(`Task timeout: ${task.title} (${taskTimeoutMs}ms)`)), taskTimeoutMs);
    });

    const runPromise = (async () => {
      let accumulatedText = '';
      for await (const chunk of a.chat(input)) {
        if (chunk.type === 'error') return false;
        if (chunk.type === 'text') accumulatedText += chunk.delta;
        if (chunk.type === 'artifact-draft' && !task.producedArtifactId) {
          task.producedArtifactId = chunk.name;
        }
        events.onTaskChunk(task, chunk);
      }
      if (accumulatedText) task.output = accumulatedText;
      return true;
    })();

    try {
      return await Promise.race([runPromise, timeoutPromise]);
    } catch (err) {
      recordTrace({
        planId: plan.id, taskId: task.id,
        step: 'Resume execution error',
        phase: 'error',
        metadata: { error: String(err), retryCount },
        durationMs: Date.now() - taskStartTime,
      });
      return false;
    }
  };

  // Primary attempt
  ok = await tryOnce(agent);

  // Retry with backoff
  while (!ok && retryCount < maxRetries) {
    retryCount++;
    const delay = backoffDelay(retryCount);
    recordTrace({
      planId: plan.id, taskId: task.id,
      step: `Resume retry ${retryCount}/${maxRetries} after ${delay}ms`,
      phase: 'execution',
      durationMs: 0,
    });
    await sleep(delay);

    const retryAgent = agentRegistry.get(task.assignedAgentId);
    if (!retryAgent) break;
    ok = await tryOnce(retryAgent);
  }

  if (stallDetection) stopTracking(task.id);

  task.status = ok ? 'success' : 'failed';
  events.onTaskDone(task, ok, ok ? undefined : 'Resumed task execution failed');

  return ok;
}
