import type { DeployStatus } from '../types';
import { Rocket, CheckCircle2, XCircle, Loader2, ExternalLink, Circle } from './icons';

const STEP_ORDER = ['building', 'uploading', 'live'] as const;
const STEP_LABELS: Record<string, string> = {
  building: '构建',
  uploading: '上传',
  live: '已上线',
};

export function DeployCard({ deploy }: { deploy: DeployStatus }) {
  const isDone = deploy.step === 'live';
  const isFailed = deploy.step === 'failed';
  const currentIdx = STEP_ORDER.indexOf(deploy.step as any);

  return (
    <div className="border border-feishu-border bg-feishu-panel rounded-xl overflow-hidden max-w-md">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-feishu-border bg-gradient-to-r from-feishu-accent/10 to-emerald-50">
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow">
          <Rocket size={18} className="text-feishu-accent" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-feishu-text">部署任务</div>
          <div className="text-xs text-feishu-subtext">artifact: {deploy.artifactId.slice(-8)}</div>
        </div>
        {isDone ? <CheckCircle2 className="text-emerald-500" size={20} /> :
          isFailed ? <XCircle className="text-red-500" size={20} /> :
          <Loader2 className="text-feishu-accent animate-spin" size={20} />}
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Step pipeline */}
        <div className="flex items-center gap-1">
          {STEP_ORDER.map((step, i) => {
            const isCurrent = deploy.step === step;
            const isPast = !isFailed && currentIdx > i;
            const isFuture = !isFailed && currentIdx < i;
            return (
              <div key={step} className="flex items-center gap-1 flex-1">
                <div className="flex items-center gap-1.5">
                  {isPast ? (
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  ) : isCurrent && !isFailed ? (
                    <Loader2 size={14} className="text-feishu-accent animate-spin shrink-0" />
                  ) : isFailed && isCurrent ? (
                    <XCircle size={14} className="text-red-500 shrink-0" />
                  ) : (
                    <Circle size={14} className="text-gray-300 shrink-0" />
                  )}
                  <span
                    className={`text-[11px] whitespace-nowrap ${
                      isPast ? 'text-emerald-600' :
                      isCurrent && !isFailed ? 'text-feishu-accent font-medium' :
                      isFailed && isCurrent ? 'text-red-500' :
                      'text-gray-400'
                    }`}
                  >
                    {STEP_LABELS[step]}
                  </span>
                </div>
                {i < STEP_ORDER.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${isPast ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="text-xs text-feishu-subtext flex items-center justify-between">
          <span>{deploy.message}</span>
          <span className="font-mono">{deploy.progress}%</span>
        </div>
        <div className="h-1.5 bg-feishu-bg rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              isFailed ? 'bg-red-500' : isDone ? 'bg-emerald-500' : 'bg-feishu-accent'
            }`}
            style={{ width: `${deploy.progress}%` }}
          />
        </div>

        {/* URL when live */}
        {isDone && deploy.url && (
          <a
            href={deploy.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between text-xs bg-feishu-bg px-3 py-2 rounded-md hover:bg-feishu-hover transition group"
          >
            <span className="text-feishu-accent truncate group-hover:underline">
              {deploy.url.startsWith('data:') ? '📄 本地预览 (点击打开)' : deploy.url}
            </span>
            <ExternalLink size={12} className="text-feishu-subtext shrink-0 ml-2" />
          </a>
        )}
      </div>
    </div>
  );
}
