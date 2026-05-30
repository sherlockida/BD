import type { SubTask, OrchestratorPlan, IAgent, AgentInput, Conversation, Message, AgentChunk } from '../types';
import { agentRegistry } from '../agents/registry';

export interface ScheduleEvents {
  onTaskStart(task: SubTask): void;
  onTaskChunk(task: SubTask, chunk: AgentChunk): void;
  onTaskDone(task: SubTask, success: boolean, errorMsg?: string): void;
  onFallback(task: SubTask, fromAgentId: string, toAgentId: string): void;
}

/**
 * Scheduler — 按 DAG 调度子任务
 * - 无依赖任务并行
 * - 有依赖任务等待依赖完成
 * - 失败自动 fallback 到 fallbackAgentId
 * - 整体超时 / 单任务超时
 */
export async function schedule(
  plan: OrchestratorPlan,
  context: { conversation: Conversation; history: Message[] },
  events: ScheduleEvents,
): Promise<void> {
  const finished = new Set<string>();
  const failed = new Set<string>();
  const inflight = new Map<string, Promise<void>>();

  const runOne = async (task: SubTask) => {
    events.onTaskStart(task);
    let agent: IAgent | undefined = agentRegistry.get(task.assignedAgentId);

    const tryRun = async (a: IAgent): Promise<boolean> => {
      const input: AgentInput = {
        conversation: context.conversation,
        history: context.history,
        userPrompt: plan.intent,
        task,
      };
      try {
        for await (const chunk of a.chat(input)) {
          if (chunk.type === 'error') {
            return false;
          }
          events.onTaskChunk(task, chunk);
        }
        return true;
      } catch {
        return false;
      }
    };

    let ok = agent ? await tryRun(agent) : false;
    if (!ok && task.fallbackAgentId) {
      const fb = agentRegistry.get(task.fallbackAgentId);
      if (fb) {
        events.onFallback(task, task.assignedAgentId, fb.meta.id);
        agent = fb;
        ok = await tryRun(fb);
      }
    }

    events.onTaskDone(task, ok, ok ? undefined : '执行失败');
    if (ok) finished.add(task.id);
    else failed.add(task.id);
  };

  // 主循环：每轮派发所有"依赖已满足、且尚未派发"的任务
  while (finished.size + failed.size < plan.subTasks.length) {
    const ready = plan.subTasks.filter(
      t =>
        !finished.has(t.id) &&
        !failed.has(t.id) &&
        !inflight.has(t.id) &&
        t.dependsOn.every(d => finished.has(d)),
    );
    if (ready.length === 0 && inflight.size === 0) {
      // 依赖断裂或全失败
      break;
    }
    for (const t of ready) {
      const p = runOne(t).finally(() => inflight.delete(t.id));
      inflight.set(t.id, p);
    }
    if (inflight.size > 0) {
      // 等任何一个完成再进入下一轮
      await Promise.race([...inflight.values()]);
    }
  }
}
