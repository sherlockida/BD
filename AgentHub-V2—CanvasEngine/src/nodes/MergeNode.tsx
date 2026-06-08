import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export const MergeNode: React.FC<NodeProps> = React.memo(() => {
  return (
    <div className="min-w-[180px] min-h-[110px] rounded-xl border-2 border-dashed border-canvas-edge-lineage bg-white/60 flex items-center justify-center p-4">
      {/* Flow handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border-2 !border-white !bg-canvas-edge-lineage"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-2 !border-white !bg-canvas-edge-lineage"
      />

      <div className="text-center select-none">
        <div className="text-2xl text-canvas-edge-lineage mb-1 font-light">
          {'⊕'}
        </div>
        <p className="text-xs text-feishu-text-secondary">
          {'拖入 2 个以上工件'}
        </p>
      </div>
    </div>
  );
});

MergeNode.displayName = 'MergeNode';
