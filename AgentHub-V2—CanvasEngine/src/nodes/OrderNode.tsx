import React from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { OrderNodeData } from '../../../AgentHub-V2—SharedTypes/src/types';

type OrderNodeType = Node<OrderNodeData & Record<string, unknown>, 'order'>;

const statusStyles: Record<string, string> = {
  pending: 'bg-gray-400',
  planning: 'bg-feishu-warning',
  dispatched: 'bg-feishu-accent',
  done: 'bg-feishu-success',
};

export const OrderNode: React.FC<NodeProps<OrderNodeType>> = React.memo(
  ({ data }) => {
    return (
      <div className="min-w-[240px] rounded-xl bg-white shadow-md border border-canvas-node-border p-4 hover:shadow-lg transition-shadow">
        {/* Header: order badge + status dot */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono bg-feishu-accent text-white px-2 py-0.5 rounded-full font-medium">
            #{data.orderId}
          </span>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              statusStyles[data.status] || 'bg-gray-400'
            }`}
            title={data.status}
          />
        </div>

        {/* Intent text */}
        <p className="text-sm text-feishu-text leading-relaxed line-clamp-2">
          {data.intent}
        </p>

        {/* Flow handles */}
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !border-2 !border-white !bg-feishu-accent"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2 !border-2 !border-white !bg-feishu-accent"
        />
      </div>
    );
  },
);

OrderNode.displayName = 'OrderNode';
