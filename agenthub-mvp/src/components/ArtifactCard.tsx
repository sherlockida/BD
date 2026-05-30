import { useAppStore } from '../store/appStore';
import type { Artifact, ID } from '../types';
import { Code2, Globe, FileText, Presentation, ChevronRight } from './icons';

const typeIcon = {
  code: Code2,
  webpage: Globe,
  doc: FileText,
  ppt: Presentation,
};

export function ArtifactCard({ artifactId, versionId, title, preview }: {
  artifactId: ID;
  versionId: ID;
  title: string;
  preview?: string;
}) {
  const artifact = useAppStore(s => s.artifacts.find(a => a.id === artifactId));
  const open = useAppStore(s => s.openArtifact);
  if (!artifact) return null;
  const ver = artifact.versions.find(v => v.id === versionId);
  const Icon = typeIcon[artifact.type] ?? FileText;
  const isLatest = artifact.latestVersionId === versionId;

  return (
    <div
      onClick={() => open(artifactId)}
      className="cursor-pointer border border-feishu-border rounded-xl bg-feishu-panel hover:shadow-md transition max-w-md overflow-hidden group"
    >
      <div className="px-4 py-3 flex items-center gap-3 border-b border-feishu-border bg-feishu-bg">
        <div className="w-10 h-10 rounded-lg bg-feishu-accent/10 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-feishu-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-feishu-text truncate">{title}</div>
          <div className="text-xs text-feishu-subtext flex items-center gap-2 mt-0.5">
            <span>{artifact.type}</span>
            <span>·</span>
            <span>v{ver?.version}{isLatest && ' (latest)'}</span>
            <span>·</span>
            <span title={ver?.commitMessage}>{shorten(ver?.commitMessage ?? '', 24)}</span>
          </div>
        </div>
        <ChevronRight size={16} className="text-feishu-subtext group-hover:text-feishu-accent transition" />
      </div>
      {preview && (
        <div className="px-4 py-3 text-xs text-feishu-subtext font-mono whitespace-pre-wrap line-clamp-4 max-h-24 overflow-hidden">
          {preview}
        </div>
      )}
      <div className="px-4 py-2 bg-feishu-bg/60 text-[11px] text-feishu-subtext border-t border-feishu-border">
        点击展开预览 / 编辑 / 历史
      </div>
    </div>
  );
}

function shorten(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
