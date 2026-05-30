import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { X, Sparkles, Plus, Trash2, BookOpen } from './icons';

export function SkillsDrawer() {
  const open = useAppStore(s => s.skillsDrawerOpen);
  const setOpen = useAppStore(s => s.setSkillsDrawerOpen);
  const skills = useAppStore(s => s.skills);
  const distill = useAppStore(s => s.distillSkill);
  const remove = useAppStore(s => s.removeSkill);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', trigger: '', description: '', steps: '' });

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[440px] bg-feishu-panel border-l border-feishu-border shadow-2xl z-20 flex flex-col animate-slideIn">
      <div className="px-5 py-4 border-b border-feishu-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-feishu-accent" />
          <div className="font-semibold text-feishu-text">Skills 知识库</div>
          <span className="text-xs text-feishu-subtext">({skills.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="text-xs px-2 py-1 rounded-md bg-feishu-accent/10 text-feishu-accent hover:bg-feishu-accent hover:text-white transition flex items-center gap-1"
          >
            <Plus size={12} /> 新增
          </button>
          <button onClick={() => setOpen(false)} className="text-feishu-subtext hover:text-feishu-text">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="px-5 py-3 text-xs text-feishu-subtext leading-relaxed border-b border-feishu-border bg-feishu-bg/40">
        <BookOpen size={12} className="inline mr-1 text-feishu-accent" />
        Skill = 在每次群聊里自动召回的"经验卡"。我们把和 AI 协作的"方法论"沉淀在这里，供未来对话复用。
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {skills.map(s => (
          <div key={s.id} className="group p-3 rounded-lg border border-feishu-border bg-feishu-bg hover:bg-feishu-hover/50 transition">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-feishu-text">{s.name}</span>
                  <span className={`text-[10px] px-1 rounded ${
                    s.source === 'auto-distilled' ? 'bg-amber-100 text-amber-700' : 'bg-feishu-accent/10 text-feishu-accent'
                  }`}>
                    {s.source === 'auto-distilled' ? '自动沉淀' : '手工'}
                  </span>
                </div>
                <div className="text-[11px] text-feishu-subtext mt-0.5">触发：{s.trigger}</div>
                <div className="text-xs text-feishu-text mt-1.5 leading-relaxed">{s.description}</div>
                {s.steps.length > 0 && (
                  <ol className="text-xs text-feishu-subtext mt-1.5 list-decimal pl-4 space-y-0.5">
                    {s.steps.map((st, i) => <li key={i}>{st}</li>)}
                  </ol>
                )}
              </div>
              <button
                onClick={() => remove(s.id)}
                className="opacity-0 group-hover:opacity-100 text-feishu-subtext hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {skills.length === 0 && (
          <div className="text-center text-feishu-subtext text-sm py-12">还没有 Skill。试试在群里 hover 任一 Agent 消息，点 ✨ 沉淀。</div>
        )}
      </div>
      {showForm && (
        <div className="absolute inset-0 bg-feishu-panel z-10 p-5 flex flex-col animate-slideIn">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-feishu-text">新增 Skill</div>
            <button onClick={() => setShowForm(false)} className="text-feishu-subtext hover:text-feishu-text"><X size={16} /></button>
          </div>
          <div className="space-y-3 flex-1">
            <input
              className="w-full px-3 py-2 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
              placeholder="名称（如：先 Spec 后 Code）"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="w-full px-3 py-2 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
              placeholder="触发条件（如：当任务含「实现/做一个」时）"
              value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}
            />
            <textarea rows={3}
              className="w-full px-3 py-2 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent resize-none"
              placeholder="描述"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <textarea rows={4}
              className="w-full px-3 py-2 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent resize-none"
              placeholder="步骤（每行一个）"
              value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })}
            />
            <button
              onClick={() => {
                if (!form.name) return;
                distill({
                  name: form.name,
                  trigger: form.trigger || '通用',
                  description: form.description,
                  steps: form.steps.split('\n').filter(Boolean),
                });
                setForm({ name: '', trigger: '', description: '', steps: '' });
                setShowForm(false);
              }}
              className="w-full py-2 text-sm bg-feishu-accent text-white rounded-md hover:opacity-90 disabled:opacity-40"
              disabled={!form.name}
            >保存</button>
          </div>
        </div>
      )}
    </div>
  );
}
