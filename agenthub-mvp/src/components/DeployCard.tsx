import type { DeployStatus } from '../types';
import { Rocket, CheckCircle2, XCircle, Loader2, ExternalLink } from './icons';

export function DeployCard({ deploy }: { deploy: DeployStatus }) {
  const isDone = deploy.step === 'live';
  const isFailed = deploy.step === 'failed';
  return (
    <div className="border border-feishu-border bg-feishu-panel rounded-xl overflow-hidden max-w-md">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-feishu-border bg-gradient-to-r from-feishu-accent/10 to-emerald-50">
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow">
          <Rocket size={18} className="text-feishu-accent" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-feishu-text">部署任务</div>
          <div className="text-xs text-feishu-subtext">artifact: {deploy.artifactId.slice(-8)}</div>
        </div>
        {isDone ? <CheckCircle2 className="text-emerald-500" /> :
          isFailed ? <XCircle className="text-red-500" /> :
          <Loader2 className="text-feishu-accent animate-spin" />}
      </div>
      <div className="p-4 space-y-3">
        <div className="text-xs text-feishu-subtext flex items-center justify-between">
          <span>{deploy.message}</span>
          <span className="font-mono">{deploy.progress}%</span>
        </div>
        <div className="h-1.5 bg-feishu-bg rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isFailed ? 'bg-red-500' : isDone ? 'bg-emerald-500' : 'bg-feishu-accent'
            }`}
            style={{ width: `${deploy.progress}%` }}
          />
        </div>
        {isDone && deploy.url && (
          <a
            href={deploy.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between text-xs bg-feishu-bg px-3 py-2 rounded-md hover:bg-feishu-hover transition"
          >
            <span className="text-feishu-accent truncate">{deploy.url}</span>
            <ExternalLink size={12} className="text-feishu-subtext" />
          </a>
        )}
      </div>
    </div>
  );
}
