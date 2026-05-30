import { useState } from 'react';
import type { OrchestratorPlan, SubTask } from '../types';
import { useAppStore } from '../store/appStore';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Circle, AlertTriangle } from './icons';

export function PlanCard({ plan }: { plan: OrchestratorPlan }) {
  const [open, setOpen] = useState(true);
  const agents = useAppStore(s => s.agents);

  const counts = {
    done: plan.subTasks.filter(t => t.status === 'success' || t.status === 'fallback').length,
    failed: plan.subTasks.filter(t => t.status === 'failed').length,
    total: plan.subTasks.length,
  };

  return (
    <div className="border border-feishu-border bg-feishu-bg rounded-xl overflow-hidden max-w-2xl">
      <div
        className="px-4 py-3 cursor-pointer hover:bg-white/50 flex items-center justify-between"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-sm font-semibold text-feishu-text">📋 任务编排</span>
          <span className="text-xs text-feishu-subtext truncate">— {plan.summary}</span>
        </div>
        <div className="text-xs text-feishu-subtext shrink-0 ml-2">
          {counts.done}/{counts.total}
          {counts.failed > 0 && <span className="text-red-500 ml-1">· {counts.failed} 失败</span>}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-3 pt-1 space-y-1.5">
          {plan.subTasks.map(t => (
            <SubTaskRow key={t.id} task={t} agents={agents} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubTaskRow({ task, agents }: { task: SubTask; agents: any[] }) {
  const agent = agents.find(a => a.id === task.assignedAgentId);
  const StatusIcon = () => {
    switch (task.status) {
      case 'success':
        return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'failed':
        return <XCircle size={16} className="text-red-500" />;
      case 'running':
        return <Loader2 size={16} className="text-feishu-accent animate-spin" />;
      case 'fallback':
        return <AlertTriangle size={16} className="text-amber-500" />;
      default:
        return <Circle size={16} className="text-feishu-subtext/50" />;
    }
  };
  const duration =
    task.startedAt && task.finishedAt
      ? `${((task.finishedAt - task.startedAt) / 1000).toFixed(1)}s`
      : task.startedAt
      ? `${((Date.now() - task.startedAt) / 1000).toFixed(0)}s`
      : '';

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/60">
      <StatusIcon />
      <span className="text-sm text-feishu-text truncate flex-1">{task.title}</span>
      {agent && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${agent.avatarColor} text-white shrink-0`}>
          {agent.avatarEmoji} {agent.name}
        </span>
      )}
      {duration && <span className="text-[11px] text-feishu-subtext shrink-0 w-10 text-right">{duration}</span>}
      {task.dependsOn.length > 0 && (
        <span className="text-[10px] text-feishu-subtext shrink-0">依赖</span>
      )}
    </div>
  );
}
