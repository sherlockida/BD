import React from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { motion } from 'framer-motion';
import type {
  WorkstationNodeData,
  ThinkingFrame,
} from '../../../AgentHub-V2—SharedTypes/src/types';

type WorkstationNodeType = Node<WorkstationNodeData & Record<string, unknown>, 'workstation'>;

const statusConfig: Record<string, { barColor: string; label: string }> = {
  idle: { barColor: 'bg-workstation-idle', label: 'Idle' },
  thinking: { barColor: 'bg-workstation-thinking', label: 'Thinking' },
  producing: { barColor: 'bg-workstation-producing', label: 'Producing' },
  'awaiting-input': {
    barColor: 'bg-workstation-awaiting-input',
    label: 'Awaiting Input',
  },
  done: { barColor: 'bg-workstation-done', label: 'Done' },
  error: { barColor: 'bg-workstation-error', label: 'Error' },
};

const kindLabel: Record<string, string> = {
  read: '读',
  decide: '决',
  write: '写',
};

export const WorkstationNode: React.FC<NodeProps<WorkstationNodeType>> =
  React.memo(({ data }) => {
    const cfg = statusConfig[data.status] || statusConfig.idle;
    const recentThoughts: ThinkingFrame[] = (
      data.thinkingStream ?? []
    ).slice(-3);
    const telemetry = data.telemetry;
    const shouldPulse =
      data.status === 'thinking' || data.status === 'producing';
    const pulseDuration = data.status === 'thinking' ? 0.8 : 1.5;

    return (
      <div className="min-w-[280px] rounded-xl bg-white shadow-md border border-canvas-node-border p-4 relative group">
        {/* Telemetry bar */}
        {telemetry && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
            <div className="text-[10px] font-mono text-feishu-text-secondary bg-white px-2 rounded-full border border-canvas-node-border whitespace-nowrap shadow-sm">
              {telemetry.tokensPerSec.toFixed(1)} tok/s
            </div>
          </div>
        )}

        {/* Avatar + Name + Vendor */}
        <div className="flex items-center gap-2.5 mb-3 mt-0.5">
          <span className="text-2xl flex-shrink-0">
            {data.meta?.avatarEmoji || '🤖'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-feishu-text truncate leading-tight">
              {data.meta?.name || data.agentId}
            </div>
            <span className="inline-block text-[10px] text-feishu-text-secondary bg-feishu-bg px-1.5 py-0.5 rounded mt-0.5">
              {data.meta?.vendor || 'unknown'}
            </span>
          </div>
        </div>

        {/* Status pulse bar */}
        <motion.div
          className={`h-1.5 rounded-full ${cfg.barColor} mb-2`}
          animate={
            shouldPulse
              ? { opacity: [1, 0.35, 1] }
              : { opacity: 1 }
          }
          transition={
            shouldPulse
              ? {
                  duration: pulseDuration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
              : { duration: 0 }
          }
        />

        {/* Thinking stream */}
        {recentThoughts.length > 0 && (
          <div className="space-y-0.5 mb-2">
            {recentThoughts.map((frame: ThinkingFrame, i: number) => (
              <div
                key={`${frame.timestamp}-${i}`}
                className="text-[11px] text-feishu-text-secondary truncate"
              >
                <span className="font-mono text-feishu-accent font-medium">
                  {kindLabel[frame.kind] || '?'}:
                </span>{' '}
                {frame.summary}
              </div>
            ))}
          </div>
        )}

        {/* Hover action menu */}
        <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
          <button
            type="button"
            className="text-[10px] px-1.5 py-0.5 bg-feishu-bg rounded hover:bg-feishu-border text-feishu-text-secondary transition-colors"
          >
            暂停
          </button>
          <button
            type="button"
            className="text-[10px] px-1.5 py-0.5 bg-feishu-bg rounded hover:bg-feishu-border text-feishu-text-secondary transition-colors"
          >
            详情
          </button>
        </div>

        {/* Flow handles */}
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !border-2 !border-white !bg-workstation-idle"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2 !border-2 !border-white !bg-workstation-idle"
        />
      </div>
    );
  });

WorkstationNode.displayName = 'WorkstationNode';
