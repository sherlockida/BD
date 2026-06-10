/**
 * BlackboardCard — Visual display of shared blackboard state in chat.
 *
 * Renders blackboard elements as chat cards:
 *   - Facts → 📋 fact cards
 *   - Decisions → ✅ decision records
 *   - Progress → 📊 progress bar
 *   - Concerns → ⚠️ private agent concerns
 */
import React from 'react';
import type { BlackboardData, BlackboardFact, BlackboardDecision, BlackboardArtRef, ProposedChange } from '../types';

interface BlackboardCardProps {
  board: BlackboardData;
  compact?: boolean;
  showPrivate?: boolean;
  viewerAgentId?: string;
}

export const BlackboardCard: React.FC<BlackboardCardProps> = ({
  board,
  compact = false,
  showPrivate = false,
  viewerAgentId,
}) => {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-feishu-panel border border-feishu-border text-xs text-feishu-text max-w-md">
        <span>📋</span>
        <span className="truncate">{board.public.facts.length} facts · ✅ {board.public.decisions.length} decisions</span>
        <span className="text-feishu-subtext shrink-0">· {board.public.progress.completed}/{board.public.progress.totalTasks}</span>
      </div>
    );
  }

  const privateSpace = viewerAgentId ? board.private[viewerAgentId] : null;

  return (
    <div className="blackboard-card border border-feishu-border bg-feishu-bg rounded-xl overflow-hidden max-w-2xl">
      <div className="px-4 py-3 border-b border-feishu-border">
        <span className="text-sm font-semibold text-feishu-text">📋 共享黑板</span>
        <span className="text-xs text-feishu-subtext ml-2">
          Phase: {board.public.progress.currentPhase}
        </span>
      </div>

      <div className="px-4 py-2 space-y-3">
        {/* Facts */}
        {board.public.facts.length > 0 && (
          <FactList facts={board.public.facts} />
        )}

        {/* Decisions */}
        {board.public.decisions.length > 0 && (
          <DecisionList decisions={board.public.decisions} />
        )}

        {/* Artifacts */}
        {board.public.artifacts.length > 0 && (
          <ArtifactRefList artifacts={board.public.artifacts} />
        )}

        {/* Constraints */}
        {board.public.constraints.length > 0 && (
          <ConstraintList constraints={board.public.constraints} />
        )}

        {/* Progress */}
        <ProgressSection progress={board.public.progress} />

        {/* Private concerns (only shown to supervisor or the agent itself) */}
        {showPrivate && privateSpace && (
          <PrivateSpaceCard space={privateSpace} />
        )}
      </div>
    </div>
  );
};

// ── Sub-components ──

const FactList: React.FC<{ facts: BlackboardFact[] }> = ({ facts }) => (
  <div>
    <div className="text-xs font-medium text-feishu-subtext mb-1">📋 已确认事实</div>
    {facts.map(f => (
      <div key={f.id} className="flex items-center gap-2 text-xs py-0.5">
        <span className="text-feishu-text">{f.content}</span>
        <span className="text-feishu-subtext/60">
          (置信度: {(f.confidence * 100).toFixed(0)}%)
        </span>
      </div>
    ))}
  </div>
);

const DecisionList: React.FC<{ decisions: BlackboardDecision[] }> = ({ decisions }) => (
  <div>
    <div className="text-xs font-medium text-feishu-subtext mb-1">✅ 决策记录</div>
    {decisions.map(d => (
      <div key={d.id} className="text-xs py-0.5">
        <span className="text-feishu-text">{d.content}</span>
        <span className="text-feishu-subtext/60 ml-1">— {d.rationale}</span>
        {d.overrides && (
          <span className="text-amber-500 ml-1">(覆盖前序决策)</span>
        )}
      </div>
    ))}
  </div>
);

const ArtifactRefList: React.FC<{ artifacts: BlackboardArtRef[] }> = ({ artifacts }) => (
  <div>
    <div className="text-xs font-medium text-feishu-subtext mb-1">📦 产物</div>
    {artifacts.map(a => (
      <div key={a.artifactId} className="flex items-center gap-2 text-xs py-0.5">
        <span className={`w-1.5 h-1.5 rounded-full ${
          a.status === 'final' ? 'bg-emerald-500' :
          a.status === 'reviewed' ? 'bg-amber-500' : 'bg-gray-300'
        }`} />
        <span className="text-feishu-text">{a.name}</span>
        <span className="text-feishu-subtext/60">{a.type}</span>
        <span className={`text-[10px] px-1 rounded ${
          a.status === 'final' ? 'bg-emerald-50 text-emerald-600' :
          a.status === 'reviewed' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'
        }`}>
          {a.status}
        </span>
      </div>
    ))}
  </div>
);

const ConstraintList: React.FC<{ constraints: string[] }> = ({ constraints }) => (
  <div>
    <div className="text-xs font-medium text-feishu-subtext mb-1">🔒 约束条件</div>
    {constraints.map((c, i) => (
      <div key={i} className="text-xs text-feishu-text py-0.5">· {c}</div>
    ))}
  </div>
);

const ProgressSection: React.FC<{ progress: BlackboardData['public']['progress'] }> = ({ progress }) => {
  const percent = progress.totalTasks > 0
    ? Math.round((progress.completed / progress.totalTasks) * 100)
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-feishu-subtext">📊 进度</span>
        <span className="text-xs text-feishu-subtext">{percent}%</span>
      </div>
      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            progress.currentPhase === 'done' ? 'bg-emerald-500' : 'bg-feishu-accent'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {progress.stalledTasks.length > 0 && (
        <div className="text-xs text-amber-600 mt-1">
          ⚠️ {progress.stalledTasks.length} 个任务停滞
        </div>
      )}
    </div>
  );
};

const PrivateSpaceCard: React.FC<{ space: { agentId: string; concerns: string[]; proposedChanges: ProposedChange[] } }> = ({ space }) => (
  <div className="border-t border-feishu-border pt-2 mt-2">
    <div className="text-xs font-medium text-feishu-subtext mb-1">
      🔒 私有空间 ({space.agentId})
    </div>
    {space.concerns.length > 0 && (
      <div className="mb-2">
        <div className="text-[10px] text-feishu-subtext">疑虑:</div>
        {space.concerns.map((c, i) => (
          <div key={i} className="text-xs text-amber-600 py-0.5">⚠️ {c}</div>
        ))}
      </div>
    )}
    {space.proposedChanges.length > 0 && (
      <div>
        <div className="text-[10px] text-feishu-subtext">修改建议:</div>
        {space.proposedChanges.map((pc, i) => (
          <div key={i} className="text-xs py-0.5">
            <span className={`px-1 rounded text-[10px] ${
              pc.priority === 'high' ? 'bg-red-100 text-red-600' :
              pc.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {pc.priority}
            </span>
            <span className="text-feishu-text ml-1">{pc.suggestion}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);
