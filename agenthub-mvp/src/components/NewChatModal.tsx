import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { X, Users, Bot, Sparkles } from './icons';

export function NewChatModal({ onClose }: { onClose: () => void }) {
  const agents = useAppStore(s => s.agents);
  const create = useAppStore(s => s.createConversation);
  const [type, setType] = useState<'single' | 'group'>('group');
  const [picked, setPicked] = useState<string[]>(['agent_claude_code', 'agent_codex']);
  const [title, setTitle] = useState('');

  const toggle = (id: string) => {
    if (type === 'single') {
      setPicked([id]);
    } else {
      setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
    }
  };

  const ok = type === 'single' ? picked.length === 1 : picked.length >= 1;

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-feishu-panel rounded-xl w-[520px] max-h-[80vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-feishu-border flex items-center justify-between">
          <div className="font-semibold text-feishu-text">新建对话</div>
          <button onClick={onClose} className="text-feishu-subtext hover:text-feishu-text"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs font-medium text-feishu-text mb-2">类型</div>
            <div className="flex gap-2">
              <button
                onClick={() => { setType('single'); setPicked(picked.slice(0, 1)); }}
                className={`flex-1 p-3 rounded-lg border text-left flex items-start gap-2 transition ${
                  type === 'single' ? 'bg-feishu-accent/10 border-feishu-accent' : 'border-feishu-border hover:bg-feishu-hover'
                }`}
              >
                <Bot size={18} className="mt-0.5 text-feishu-accent shrink-0" />
                <div>
                  <div className="text-sm font-medium">单聊</div>
                  <div className="text-[11px] text-feishu-subtext mt-0.5">与一个 Agent 1v1</div>
                </div>
              </button>
              <button
                onClick={() => setType('group')}
                className={`flex-1 p-3 rounded-lg border text-left flex items-start gap-2 transition ${
                  type === 'group' ? 'bg-feishu-accent/10 border-feishu-accent' : 'border-feishu-border hover:bg-feishu-hover'
                }`}
              >
                <Users size={18} className="mt-0.5 text-feishu-accent shrink-0" />
                <div>
                  <div className="text-sm font-medium">群聊</div>
                  <div className="text-[11px] text-feishu-subtext mt-0.5">PMO 自动入群，多 Agent 协作</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-feishu-text mb-2">
              {type === 'single' ? '选择一个 Agent' : '选择 Agents（PMO 会自动加入）'}
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {agents.filter(a => a.id !== 'agent_orchestrator').map(a => (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition ${
                    picked.includes(a.id) ? 'border-feishu-accent bg-feishu-accent/5' : 'border-feishu-border hover:bg-feishu-hover'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg ${a.avatarColor} flex items-center justify-center shrink-0`}>
                    {a.avatarEmoji}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-feishu-text truncate flex items-center gap-1">
                      {a.name}
                      {a.isCustom && <Sparkles size={10} className="text-emerald-500" />}
                    </div>
                    <div className="text-[10px] text-feishu-subtext truncate">{a.tagline}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-feishu-text mb-2">标题（可选）</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'group' ? '例：茶饮品牌项目' : '默认用 Agent 名称'}
              className="w-full px-3 py-1.5 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-feishu-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-feishu-subtext hover:text-feishu-text">取消</button>
          <button
            onClick={() => {
              create({ type, memberAgentIds: picked, title: title || undefined });
              onClose();
            }}
            disabled={!ok}
            className="px-3 py-1.5 text-sm bg-feishu-accent text-white rounded-md hover:opacity-90 disabled:opacity-40"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
