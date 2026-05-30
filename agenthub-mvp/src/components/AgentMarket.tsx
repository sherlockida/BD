import { useAppStore } from '../store/appStore';
import { X, Bot, UserPlus, Sparkles } from './icons';
import { AgentPicker } from './AgentPicker';
import { useState } from 'react';

export function AgentMarket() {
  const open = useAppStore(s => s.agentMarketOpen);
  const setOpen = useAppStore(s => s.setAgentMarketOpen);
  const agents = useAppStore(s => s.agents);
  const create = useAppStore(s => s.createCustomAgent);
  const [showCreate, setShowCreate] = useState(false);

  if (!open) return null;

  const list = agents.filter(a => a.id !== 'agent_orchestrator');

  return (
    <div className="fixed inset-0 z-20 bg-black/40 flex items-center justify-center p-6" onClick={() => setOpen(false)}>
      <div className="bg-feishu-panel rounded-2xl w-[760px] max-h-[80vh] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-feishu-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-feishu-accent/10 flex items-center justify-center">
              <Bot size={18} className="text-feishu-accent" />
            </div>
            <div>
              <div className="font-semibold text-feishu-text">Agent 市场</div>
              <div className="text-xs text-feishu-subtext">主流 Agent 即开即用，也可一键自建</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-feishu-subtext hover:text-feishu-text">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 overflow-y-auto flex-1">
          {list.map(a => (
            <div key={a.id} className="border border-feishu-border rounded-xl p-4 hover:shadow-md transition">
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl ${a.avatarColor} flex items-center justify-center text-xl shrink-0`}>
                  {a.avatarEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-feishu-text">{a.name}</span>
                    {a.isCustom && <span className="text-[10px] px-1 bg-emerald-100 text-emerald-700 rounded">自建</span>}
                  </div>
                  <div className="text-[11px] text-feishu-subtext mt-0.5">{a.vendor}</div>
                  <div className="text-xs text-feishu-text mt-1.5 leading-relaxed">{a.tagline}</div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {a.capabilities.map(c => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 bg-feishu-accent/10 text-feishu-accent rounded">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-feishu-border pt-2">
                <span className={`text-[11px] flex items-center gap-1 ${a.online ? 'text-emerald-500' : 'text-feishu-subtext'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${a.online ? 'bg-emerald-500' : 'bg-feishu-subtext'}`} />
                  {a.online ? '在线' : '离线'}
                </span>
                <span className="text-[10px] text-feishu-subtext">通过适配器接入</span>
              </div>
            </div>
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="border-2 border-dashed border-feishu-border rounded-xl p-6 flex flex-col items-center justify-center text-feishu-subtext hover:bg-feishu-hover hover:text-feishu-accent hover:border-feishu-accent transition gap-2"
          >
            <Sparkles size={20} />
            <span className="text-sm font-medium">自建 Agent</span>
            <span className="text-xs">一句话描述 → 自动生成 System Prompt + 工具集</span>
          </button>
        </div>
        {showCreate && (
          <AgentPicker
            onClose={() => setShowCreate(false)}
            onPick={() => setShowCreate(false)}
            excludeIds={list.map(a => a.id)}
          />
        )}
      </div>
    </div>
  );
}
