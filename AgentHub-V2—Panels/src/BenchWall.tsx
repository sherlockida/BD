import React from 'react';

export interface BenchWallAgent {
  id: string;
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  online?: boolean;
  status?: string;
}

export interface BenchWallProps {
  agents: BenchWallAgent[];
  onFocusAgent: (id: string) => void;
  onAddAgent: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function BenchWall({
  agents,
  onFocusAgent,
  onAddAgent,
  collapsed,
  onToggleCollapse,
}: BenchWallProps) {
  return (
    <aside
      className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-64'
      }`}
      data-testid="bench-wall"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        {!collapsed && (
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Workstations
          </h2>
        )}
        <button
          title={collapsed ? 'Expand' : 'Collapse'}
          onClick={onToggleCollapse}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-400"
          >
            <polyline
              points={collapsed ? '6,4 10,8 6,12' : '10,4 6,8 10,12'}
            />
          </svg>
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onFocusAgent(agent.id)}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
            title={collapsed ? agent.name : undefined}
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
              style={{ background: agent.avatarColor }}
            >
              {agent.avatarEmoji}
            </span>
            {!collapsed && (
              <>
                <span
                  className="text-sm text-gray-700 truncate flex-1"
                  data-testid={`agent-name-${agent.id}`}
                >
                  {agent.name}
                </span>
                {agent.online && (
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                )}
              </>
            )}
          </button>
        ))}

        {/* Add Agent button */}
        {!collapsed && (
          <button
            onClick={onAddAgent}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left text-sm text-gray-400"
          >
            <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-lg shrink-0">
              +
            </span>
            <span>Add Agent</span>
          </button>
        )}
      </div>
    </aside>
  );
}
