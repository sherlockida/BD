import React from 'react';

export interface TimelineEvent {
  timestamp: number;
  agentId: string;
  kind: string;
  summary: string;
  status?: string;
}

export interface TimelineRailProps {
  events: TimelineEvent[];
  onJumpToTime: (timestamp: number) => void;
  agentIds: string[];
}

export function TimelineRail({
  events,
  onJumpToTime,
  agentIds,
}: TimelineRailProps) {
  const filtered = events.filter((e) => agentIds.includes(e.agentId));

  return (
    <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shrink-0" data-testid="timeline-rail">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Timeline
        </h2>
      </div>
      <div className="flex-1 p-3 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No events</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((event, idx) => (
              <button
                key={`${event.timestamp}-${idx}`}
                data-testid={`timeline-event-${idx}`}
                onClick={() => onJumpToTime(event.timestamp)}
                className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <span
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    event.status === 'thinking'
                      ? 'bg-yellow-400'
                      : event.status === 'done'
                        ? 'bg-green-400'
                        : 'bg-blue-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </p>
                  <p className="text-sm text-gray-700 truncate">
                    {event.summary}
                  </p>
                  <p className="text-xs text-gray-400">{event.kind}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
