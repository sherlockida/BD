import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { X, Sparkles } from './icons';

const EMOJI_CHOICES = ['🤖', '🧠', '🎨', '🔧', '✍️', '📊', '🧪', '🎯', '🚀', '🪄', '📚', '🛡️', '🔍', '💡', '🦾', '🐙'];
const COLOR_CHOICES = [
  { name: 'blue',    value: 'bg-blue-500' },
  { name: 'orange',  value: 'bg-orange-500' },
  { name: 'purple',  value: 'bg-purple-500' },
  { name: 'green',   value: 'bg-green-500' },
  { name: 'pink',    value: 'bg-pink-500' },
  { name: 'amber',   value: 'bg-amber-500' },
  { name: 'red',     value: 'bg-red-500' },
  { name: 'teal',    value: 'bg-teal-500' },
  { name: 'indigo',  value: 'bg-indigo-500' },
  { name: 'emerald', value: 'bg-emerald-500' },
  { name: 'rose',    value: 'bg-rose-500' },
  { name: 'slate',   value: 'bg-slate-500' },
];

type Cap = 'code' | 'design' | 'doc' | 'data' | 'deploy' | 'plan';
const CAP_CHOICES: { value: Cap; label: string; desc: string }[] = [
  { value: 'code',   label: 'code',   desc: '写代码 / 重构 / 调试' },
  { value: 'design', label: 'design', desc: 'UI / 视觉 / 动效' },
  { value: 'doc',    label: 'doc',    desc: '文档 / 文案 / Spec' },
  { value: 'data',   label: 'data',   desc: 'SQL / 数据分析' },
  { value: 'deploy', label: 'deploy', desc: '部署 / CI/CD' },
  { value: 'plan',   label: 'plan',   desc: '任务规划（建议留给 PMO）' },
];

export function NewAgentModal() {
  const open = useAppStore(s => s.newAgentModalOpen);
  const setOpen = useAppStore(s => s.setNewAgentModalOpen);
  const prefill = useAppStore(s => s.newAgentPrefill);
  const activeConvId = useAppStore(s => s.activeConversationId);
  const createAgent = useAppStore(s => s.createCustomAgent);
  const addToConv = useAppStore(s => s.addAgentToConversation);

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [capabilities, setCapabilities] = useState<Cap[]>(['code', 'doc']);
  const [emoji, setEmoji] = useState('🤖');
  const [color, setColor] = useState('bg-emerald-500');
  const [addToCurrentChat, setAddToCurrentChat] = useState(true);

  // Reset fields when modal opens (pre-fill name from slash arg)
  useEffect(() => {
    if (open) {
      const pre = (prefill ?? '').trim();
      setName(pre.slice(0, 16));
      setTagline(pre ? `${pre} — 自建助手` : '');
      setSystemPrompt(pre ? `你是「${pre}」，请按照这个角色与用户对话。回答简洁、专业、有重点。` : '');
      setCapabilities(['code', 'doc']);
      setEmoji('🤖');
      setColor('bg-emerald-500');
      setAddToCurrentChat(true);
    }
  }, [open, prefill]);

  if (!open) return null;

  const toggleCap = (c: Cap) =>
    setCapabilities(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]));

  const canCreate = name.trim().length > 0 && tagline.trim().length > 0 && systemPrompt.trim().length > 0 && capabilities.length > 0;

  const handleClose = () => setOpen(false);

  const handleCreate = () => {
    if (!canCreate) return;
    const agent = createAgent({
      name: name.trim().slice(0, 32),
      tagline: tagline.trim(),
      capabilities,
      systemPrompt: systemPrompt.trim(),
      avatarEmoji: emoji,
      avatarColor: color,
    });
    if (addToCurrentChat && activeConvId) {
      addToConv(activeConvId, agent.id);
    }
    handleClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-feishu-panel rounded-xl w-[560px] max-h-[88vh] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-feishu-border flex items-center justify-between shrink-0">
          <div className="font-semibold text-feishu-text flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-500" />
            新建自定义 Agent
          </div>
          <button onClick={handleClose} className="text-feishu-subtext hover:text-feishu-text">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Live preview */}
          <div className="flex items-center gap-3 p-3 bg-feishu-bg/60 border border-feishu-border rounded-lg">
            <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-2xl shadow-sm`}>
              {emoji}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-feishu-text truncate">
                {name || '未命名 Agent'}
              </div>
              <div className="text-xs text-feishu-subtext truncate">
                {tagline || '一句话描述这个 Agent 的擅长方向'}
              </div>
              <div className="text-[10px] text-feishu-subtext mt-1">
                能力: {capabilities.join(' / ') || '未选'}
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <div className="text-xs font-medium text-feishu-text mb-1.5">
              名称 <span className="text-red-400">*</span>
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={32}
              placeholder="如：抹茶设计师"
              className="w-full px-3 py-1.5 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
            />
          </div>

          {/* Tagline */}
          <div>
            <div className="text-xs font-medium text-feishu-text mb-1.5">
              一句话简介 <span className="text-red-400">*</span>
            </div>
            <input
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              maxLength={80}
              placeholder="如：擅长茶饮品牌视觉风格的 UI 设计师"
              className="w-full px-3 py-1.5 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
            />
          </div>

          {/* Capabilities */}
          <div>
            <div className="text-xs font-medium text-feishu-text mb-1.5">
              能力标签 <span className="text-red-400">*</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {CAP_CHOICES.map(c => {
                const active = capabilities.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleCap(c.value)}
                    className={`px-2 py-1.5 text-xs rounded-md border text-left transition ${
                      active
                        ? 'border-feishu-accent bg-feishu-accent/10 text-feishu-text'
                        : 'border-feishu-border text-feishu-subtext hover:bg-feishu-hover hover:text-feishu-text'
                    }`}
                    title={c.desc}
                  >
                    <div className="font-medium">{c.label}</div>
                    <div className="text-[10px] opacity-75 truncate">{c.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Avatar — emoji + color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-feishu-text mb-1.5">头像 emoji</div>
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_CHOICES.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`w-7 h-7 rounded flex items-center justify-center text-lg transition ${
                      emoji === e ? 'ring-2 ring-feishu-accent bg-feishu-accent/10' : 'hover:bg-feishu-hover'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-feishu-text mb-1.5">头像颜色</div>
              <div className="grid grid-cols-6 gap-1">
                {COLOR_CHOICES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    title={c.name}
                    className={`w-7 h-7 rounded-md ${c.value} transition ${
                      color === c.value ? 'ring-2 ring-feishu-text ring-offset-1' : 'opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <div className="text-xs font-medium text-feishu-text mb-1.5">
              System Prompt <span className="text-red-400">*</span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder="定义这个 Agent 的角色、风格、能力边界..."
              className="w-full px-3 py-2 text-xs bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent resize-none font-mono"
            />
            <div className="text-[10px] text-feishu-subtext mt-1">
              {systemPrompt.length} 字符 · 这会注入到每次对话的开头
            </div>
          </div>

          {/* Add to current chat checkbox */}
          {activeConvId && (
            <label className="flex items-center gap-2 text-xs text-feishu-text cursor-pointer">
              <input
                type="checkbox"
                checked={addToCurrentChat}
                onChange={e => setAddToCurrentChat(e.target.checked)}
                className="accent-feishu-accent"
              />
              创建后立即加入当前对话
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-feishu-border flex justify-end gap-2 shrink-0">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-sm text-feishu-subtext hover:text-feishu-text"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-3 py-1.5 text-sm bg-feishu-accent text-white rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Sparkles size={12} /> 创建 Agent
          </button>
        </div>
      </div>
    </div>
  );
}
