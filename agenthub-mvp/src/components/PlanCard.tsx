import { useState, useMemo } from 'react';
import type { OrchestratorPlan, SubTask, ID } from '../types';
import { useAppStore } from '../store/appStore';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Circle,
  AlertTriangle, PauseCircle,
} from './icons';

const PHASE_INFO: Record<string, string> = {
  planning: '制定计划',
  building: '构建中',
  styling: '样式打磨',
  reviewing: '质量评审',
  deploying: '部署上线',
  done: '完成',
};

const PHASE_EMOJI: Record<string, string> = {
  planning: '📝',
  building: '🔨',
  styling: '🎨',
  reviewing: '🔍',
  deploying: '🚀',
  done: '✅',
};

function getPhase(plan: OrchestratorPlan): string {
  if (plan.status === 'done') return 'done';
  const total = plan.subTasks.length;
  const completed = plan.subTasks.filter(t => t.status === 'success' || t.status === 'fallback').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  if (percent === 0) return 'planning';
  if (percent < 30) return 'building';
  if (percent < 70) return 'styling';
  if (percent < 100) return 'reviewing';
  return 'done';
}

export function PlanCard({ plan, convId }: { plan: OrchestratorPlan; convId?: ID }) {
  const [open, setOpen] = useState(true);
  const agents = useAppStore(s => s.agents);
  const messagesByConv = useAppStore(s => s.messagesByConv);

  const counts = useMemo(() => ({
    done: plan.subTasks.filter(t => t.status === 'success' || t.status === 'fallback').length,
    failed: plan.subTasks.filter(t => t.status === 'failed').length,
    running: plan.subTasks.filter(t => t.status === 'running').length,
    paused: plan.subTasks.filter(t => t.status === 'paused').length,
    total: plan.subTasks.length,
  }), [plan.subTasks]);

  const percent = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
  const phase = getPhase(plan);
  const hasStalled = counts.running === 0 && counts.done + counts.failed < counts.total && counts.paused === 0;

  // Build a map of currently-streaming text lengths per agent for real-time char count
  const streamingLengths = useMemo(() => {
    if (!convId) return new Map<string, number>();
    const msgs = messagesByConv[convId] ?? [];
    const map = new Map<string, number>();
    for (const m of msgs) {
      if (m.streaming && m.content.kind === 'text' && m.senderId) {
        const prev = map.get(m.senderId) ?? 0;
        map.set(m.senderId, prev + m.content.text.length);
      }
    }
    return map;
  }, [messagesByConv, convId]);

  return (
    <div className="border border-feishu-border bg-feishu-bg rounded-xl overflow-hidden max-w-2xl">
      {/* Header */}
      <div
        className="px-4 py-3 cursor-pointer hover:bg-white/50 flex items-center justify-between"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-sm font-semibold text-feishu-text">
            {PHASE_EMOJI[phase] ?? '📋'} 任务编排
          </span>
          {plan.complexity && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              plan.complexity === 'complex' ? 'bg-red-100 text-red-700' :
              plan.complexity === 'medium' ? 'bg-amber-100 text-amber-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {plan.complexity}
            </span>
          )}
          <span className="text-xs text-feishu-subtext truncate">— {plan.summary}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-feishu-subtext shrink-0 ml-2">
          <span>{PHASE_EMOJI[phase] ?? ''} {PHASE_INFO[phase] ?? phase}</span>
          <span className="font-mono">{percent}%</span>
          <span>{counts.done}/{counts.total}</span>
          {counts.failed > 0 && <span className="text-red-500">· {counts.failed} 失败</span>}
          {counts.paused > 0 && <span className="text-amber-500">· {counts.paused} 暂停</span>}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 pb-0">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              plan.status === 'done' ? 'bg-emerald-500' :
              plan.status === 'failed' ? 'bg-red-500' :
              'bg-feishu-accent'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {open && (
        <div className="px-4 pb-3 pt-2 space-y-1.5">
          {/* Stalled warning */}
          {hasStalled && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-amber-50 text-amber-700">
              <AlertTriangle size={12} />
              任务可能已停滞 — 无活动中的任务，但仍有 {counts.total - counts.done - counts.failed} 个待执行
            </div>
          )}

          {plan.subTasks.map(t => (
            <SubTaskRow key={t.id} task={t} agents={agents} streamingLength={streamingLengths.get(t.assignedAgentId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function getCharCountLabel(task: SubTask, streamingLength?: number): string | null {
  if (task.status === 'running') {
    const chars = task.streamedChars ?? streamingLength ?? 0;
    if (chars > 0) {
      const tokens = Math.ceil(chars / 4);
      return `${chars}c / ${tokens}t`;
    }
    return 'streaming...';
  }
  if ((task.status === 'success' || task.status === 'fallback') && task.output) {
    const chars = task.output.length;
    const tokens = Math.ceil(chars / 4);
    return `${chars}c`;
  }
  return null;
}

function SubTaskRow({ task, agents, streamingLength }: { task: SubTask; agents: any[]; streamingLength?: number }) {
  const agent = agents.find(a => a.id === task.assignedAgentId);
  const charLabel = getCharCountLabel(task, streamingLength);

  const StatusIcon = () => {
    switch (task.status) {
      case 'success':
        return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />;
      case 'failed':
        return <XCircle size={16} className="text-red-500 shrink-0" />;
      case 'running':
        return <Loader2 size={16} className="text-feishu-accent animate-spin shrink-0" />;
      case 'paused':
        return <PauseCircle size={16} className="text-amber-500 shrink-0" />;
      case 'fallback':
        return <AlertTriangle size={16} className="text-amber-500 shrink-0" />;
      default:
        return <Circle size={16} className="text-feishu-subtext/50 shrink-0" />;
    }
  };

  const duration =
    task.startedAt && task.finishedAt
      ? `${((task.finishedAt - task.startedAt) / 1000).toFixed(1)}s`
      : task.startedAt
      ? `${((Date.now() - task.startedAt) / 1000).toFixed(0)}s`
      : '';

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/60 ${
      task.status === 'failed' ? 'border border-red-200' : ''
    }`}>
      <StatusIcon />
      <span className="text-sm text-feishu-text truncate flex-1">{task.title}</span>

      {/* Streaming char count */}
      {charLabel && (
        <span className={`text-[10px] font-mono shrink-0 ${
          task.status === 'running' ? 'text-feishu-accent' : 'text-feishu-subtext'
        }`}>
          {charLabel}
        </span>
      )}

      {task.reviewScore !== undefined && (
        <span className={`text-[10px] px-1 rounded ${
          task.reviewVerdict === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
          task.reviewVerdict === 'revised' ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        }`}>
          {(task.reviewScore * 100).toFixed(0)}%
        </span>
      )}
      {task.retryCount !== undefined && task.retryCount > 0 && (
        <span className="text-[10px] text-amber-600 shrink-0">↺{task.retryCount}</span>
      )}
      {agent && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${agent.avatarColor} text-white shrink-0 flex items-center gap-0.5`}>
          {agent.avatarEmoji} {agent.name}
        </span>
      )}
      {duration && <span className="text-[11px] text-feishu-subtext shrink-0 w-10 text-right">{duration}</span>}
      {task.dependsOn.length > 0 && (
        <span className="text-[10px] text-feishu-subtext shrink-0" title={task.dependsOn.join(', ')}>
          ⛓️{task.dependsOn.length}
        </span>
      )}
      {task.status === 'failed' && task.reviewFeedback && (
        <span className="text-[10px] text-red-500 shrink-0 truncate max-w-[120px]" title={task.reviewFeedback}>
          {task.reviewFeedback}
        </span>
      )}
    </div>
  );
}
