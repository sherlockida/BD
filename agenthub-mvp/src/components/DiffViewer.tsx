import type { DiffPayload } from '../types';
import { useAppStore } from '../store/appStore';
import { GitBranch, Eye } from './icons';

export function DiffCardInChat({ diff }: { diff: DiffPayload }) {
  const art = useAppStore(s => s.artifacts.find(a => a.id === diff.artifactId));
  const openArt = useAppStore(s => s.openArtifact);
  const adds = diff.hunks.filter(h => h.type === 'add').length;
  const rems = diff.hunks.filter(h => h.type === 'remove').length;

  return (
    <div className="border border-feishu-border bg-feishu-panel rounded-xl overflow-hidden max-w-2xl">
      <div className="px-4 py-2.5 bg-feishu-bg border-b border-feishu-border flex items-center gap-2">
        <GitBranch size={14} className="text-feishu-accent" />
        <span className="text-sm font-medium text-feishu-text">{art?.name ?? 'artifact'} 变更</span>
        <span className="text-xs text-emerald-600 ml-1">+{adds}</span>
        <span className="text-xs text-red-500">-{rems}</span>
        <div className="flex-1" />
        <button
          onClick={() => art && openArt(art.id)}
          className="text-xs text-feishu-accent hover:underline flex items-center gap-1"
        >
          <Eye size={12} /> 展开预览
        </button>
      </div>
      <div className="max-h-64 overflow-auto font-mono text-xs">
        <DiffBody diff={diff} compact />
      </div>
    </div>
  );
}

export function DiffBody({ diff, compact = false }: { diff: DiffPayload; compact?: boolean }) {
  return (
    <div>
      {diff.hunks.map((h, i) => (
        <div
          key={i}
          className={`px-3 py-0.5 whitespace-pre ${
            h.type === 'add'
              ? 'bg-emerald-50 text-emerald-900'
              : h.type === 'remove'
              ? 'bg-red-50 text-red-900'
              : 'text-feishu-text'
          }`}
        >
          <span className="inline-block w-8 text-feishu-subtext select-none">
            {h.oldLineNo ?? ''}
          </span>
          <span className="inline-block w-8 text-feishu-subtext select-none">
            {h.newLineNo ?? ''}
          </span>
          <span className="inline-block w-4 select-none">
            {h.type === 'add' ? '+' : h.type === 'remove' ? '-' : ' '}
          </span>
          <span>{h.line || ' '}</span>
        </div>
      ))}
      {diff.hunks.length === 0 && (
        <div className="text-center text-feishu-subtext text-xs py-6">无差异</div>
      )}
      {compact && diff.hunks.length > 60 && (
        <div className="text-center text-feishu-subtext text-xs py-2 border-t border-feishu-border">
          仅显示前 60 行变更，点击展开看全文
        </div>
      )}
    </div>
  );
}
