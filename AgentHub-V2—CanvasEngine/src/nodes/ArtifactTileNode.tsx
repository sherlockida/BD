import React from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { ArtifactTileData } from '../../../AgentHub-V2—SharedTypes/src/types';

type ArtifactTileNodeType = Node<ArtifactTileData & Record<string, unknown>, 'artifactTile'>;

const typeIcons: Record<string, string> = {
  code: '</>',
  webpage: '🌐',
  doc: '📄',
  ppt: '📊',
};

export const ArtifactTileNode: React.FC<NodeProps<ArtifactTileNodeType>> =
  React.memo(({ data }) => {
    const icon = typeIcons[data.type] || '📦';

    return (
      <div className="min-w-[200px] rounded-lg bg-white shadow-sm border border-canvas-node-border p-3 relative group cursor-pointer hover:shadow-md transition-shadow">
        {/* Header: type icon + version badge */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm" title={data.type}>
            {icon}
          </span>
          <span className="text-[10px] font-mono bg-feishu-bg text-feishu-text-secondary px-1.5 py-0.5 rounded">
            v{data.version}
          </span>
        </div>

        {/* Artifact name */}
        <div className="text-sm font-medium text-feishu-text truncate mb-1">
          {data.name}
        </div>

        {/* Content preview depending on type */}
        {data.type === 'webpage' && data.thumbnail && (
          <div className="w-full h-16 bg-feishu-bg rounded overflow-hidden mb-1 border border-canvas-node-border">
            <iframe
              src={data.thumbnail}
              className="w-full h-full pointer-events-none"
              title="webpage-preview"
              sandbox="allow-same-origin"
              tabIndex={-1}
            />
          </div>
        )}

        {data.type === 'doc' && (
          <div className="text-[11px] text-feishu-text-secondary leading-relaxed line-clamp-2 mb-1 bg-feishu-bg rounded p-1.5">
            <span className="italic">Document artifact</span>
          </div>
        )}

        {data.type === 'code' && (
          <div className="text-[10px] font-mono text-feishu-text-secondary bg-feishu-bg rounded p-1.5 mb-1 overflow-hidden leading-relaxed border border-canvas-node-border max-h-[72px]">
            <span className="text-feishu-accent">//</span> code artifact
          </div>
        )}

        {/* Hover preview popup */}
        <div className="absolute -top-1 right-8 hidden group-hover:block z-50 pointer-events-none">
          <div className="bg-white shadow-lg border border-canvas-node-border rounded-lg p-2 w-[200px] h-[120px]">
            <div className="text-[10px] text-feishu-text-secondary mb-1 font-medium">
              Preview
            </div>
            <div className="text-[10px] text-feishu-text-secondary">
              {data.name}
            </div>
          </div>
        </div>

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
      </div>
    );
  });

ArtifactTileNode.displayName = 'ArtifactTileNode';
