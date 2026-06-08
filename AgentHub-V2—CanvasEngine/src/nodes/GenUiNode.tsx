import React from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { UiComponentChunk } from '../../../AgentHub-V2—SharedTypes/src/types';

interface GenUiNodeData {
  title?: string;
  chunk?: UiComponentChunk;
  agentId?: string;
}

type GenUiNodeType = Node<GenUiNodeData & Record<string, unknown>, 'genui'>;

export const GenUiNode: React.FC<NodeProps<GenUiNodeType>> = React.memo(
  ({ data }) => {
    return (
      <div className="min-w-[240px] rounded-lg bg-white shadow-lg border-2 border-feishu-accent p-4 relative">
        {/* Flow handle */}
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !border-2 !border-white !bg-feishu-accent"
        />

        {/* Title */}
        <div className="text-sm font-medium text-feishu-text mb-3">
          {data.title || 'Agent 需要你的选择'}
        </div>

        {/* Component rendered area */}
        <div className="text-xs text-feishu-text-secondary bg-feishu-bg rounded-lg p-3 min-h-[60px] flex items-center justify-center border border-canvas-node-border">
          {data.chunk ? (
            <div className="text-center">
              <div className="font-medium text-feishu-text mb-1">
                {data.chunk.component}
              </div>
              <div className="text-[10px] text-feishu-text-secondary">
                {'等待用户操作...'}
              </div>
            </div>
          ) : (
            <span className="italic text-feishu-text-secondary">
              {'等待用户操作...'}
            </span>
          )}
        </div>
      </div>
    );
  },
);

GenUiNode.displayName = 'GenUiNode';
