import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react';

interface LineageEdgeData {
  kind?: 'dispatch' | 'evolution' | 'active';
}

type LineageEdgeType = Edge<LineageEdgeData & Record<string, unknown>, 'lineage'>;

const ACTIVE_MARKER_ID = 'lineage-arrow-active';
const STATIC_MARKER_ID = 'lineage-arrow-static';

export const LineageEdge: React.FC<EdgeProps<LineageEdgeType>> = React.memo(
  ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) => {
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const kind = data?.kind || 'dispatch';
    const isActive = kind === 'dispatch' || kind === 'active';

    const style: React.CSSProperties = {
      stroke: isActive ? '#3370ff' : '#8b8fa3',
      strokeWidth: kind === 'active' ? 2.5 : 2,
      fill: 'none',
      strokeDasharray:
        kind === 'evolution' ? '6 4' : kind === 'active' ? '8 4' : undefined,
    };

    if (kind === 'active') {
      style.animation = 'flow-line 1.5s linear infinite';
    }

    return (
      <g>
        <BaseEdge
          id={id}
          path={edgePath}
          style={style}
          markerEnd={`url(#${isActive ? ACTIVE_MARKER_ID : STATIC_MARKER_ID})`}
        />
        <defs>
          <marker
            id={isActive ? ACTIVE_MARKER_ID : STATIC_MARKER_ID}
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill={isActive ? '#3370ff' : '#8b8fa3'}
            />
          </marker>
        </defs>
      </g>
    );
  },
);

LineageEdge.displayName = 'LineageEdge';
