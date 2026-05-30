import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { Agent } from '../types';
import { X, Bot, Plus, Sparkles } from './icons';

export function AgentPicker({
  onClose, onPick, excludeIds = [], allowCreate = true,
}: { onClose: () => void; onPick: (a: Agent) => void; excludeIds?: string[]; allowCreate?: boolean }) {
  const agents = useAppStore(s => s.agents);
  const create = useAppStore(s => s.createCustomAgent);
  const [tab, setTab] = useState<'pick' | 'create'>('pick');
  const [form, setForm] = useState({ name: '', tagline: '', systemPrompt: '', caps: ['code'] as string[] });
  const list = agents.filter(a => a.id !== 'agent_orchestrator' && !excludeIds.includes(a.id));

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-feishu-panel rounded-xl w-[480px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-feishu-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab('pick')}
              className={`text-sm font-medium ${tab === 'pick' ? 'text-feishu-accent' : 'text-feishu-subtext'}`}
            >选择 Agent</button>
            {allowCreate && (
              <button
                onClick={() => setTab('create')}
                className={`text-sm font-medium flex items-center gap-1 ${tab === 'create' ? 'text-feishu-accent' : 'text-feishu-subtext'}`}
              ><Plus size={14} /> 自建</button>
            )}
          </div>
          <button onClick={onClose} className="text-feishu-subtext hover:text-feishu-text">
            <X size={16} />
          </button>
        </div>
        {tab === 'pick' && (
          <div className="overflow-y-auto flex-1 p-2">
            {list.length === 0 && (
              <div className="text-center text-feishu-subtext text-sm py-8">所有 Agent 已加入</div>
            )}
            {list.map(a => (
              <button
                key={a.id}
                onClick={() => onPick(a)}
                className="w-full p-3 mx-0 rounded-lg hover:bg-feishu-hover text-left flex items-start gap-3 transition"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${a.avatarColor} text-lg shrink-0`}>
                  {a.avatarEmoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-feishu-text">{a.name}</span>
                    {a.isCustom && <span className="text-[10px] px-1 bg-emerald-100 text-emerald-700 rounded">自建</span>}
                    <span className="text-[10px] px-1 bg-feishu-bg rounded text-feishu-subtext">{a.vendor}</span>
                  </div>
                  <div className="text-xs text-feishu-subtext mt-0.5">{a.tagline}</div>
                  <div className="flex gap-1 mt-1.5">
                    {a.capabilities.map(c => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 bg-feishu-accent/10 text-feishu-accent rounded">{c}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {tab === 'create' && (
          <form
            className="flex-1 overflow-y-auto p-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name || !form.tagline) return;
              const a = create({
                name: form.name,
                tagline: form.tagline,
                capabilities: form.caps as any,
                systemPrompt: form.systemPrompt || `你是${form.name}。${form.tagline}`,
              });
              onPick(a);
            }}
          >
            <div>
              <label className="text-xs font-medium text-feishu-text block mb-1">Agent 名称</label>
              <input
                className="w-full px-3 py-1.5 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
                placeholder="例：SQL 专家"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-feishu-text block mb-1">一句话简介</label>
              <input
                className="w-full px-3 py-1.5 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
                placeholder="例：擅长写复杂查询、调优执行计划"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-feishu-text block mb-1">能力标签 (多选)</label>
              <div className="flex flex-wrap gap-2">
                {['code', 'design', 'doc', 'data', 'deploy'].map(c => (
                  <label key={c} className={`text-xs px-2 py-1 rounded cursor-pointer border ${
                    form.caps.includes(c)
                      ? 'bg-feishu-accent text-white border-feishu-accent'
                      : 'border-feishu-border text-feishu-text hover:bg-feishu-hover'
                  }`}>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={form.caps.includes(c)}
                      onChange={() => setForm({
                        ...form,
                        caps: form.caps.includes(c) ? form.caps.filter(x => x !== c) : [...form.caps, c],
                      })}
                    />{c}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-feishu-text block mb-1">System Prompt</label>
              <textarea
                rows={4}
                className="w-full px-3 py-1.5 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent resize-none"
                placeholder="(可选) 自定义 system prompt..."
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 text-sm bg-feishu-accent text-white rounded-md hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              disabled={!form.name || !form.tagline}
            >
              <Sparkles size={14} /> 创建 Agent
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
