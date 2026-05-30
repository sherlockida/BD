import { useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { useAppStore } from '../store/appStore';
import type { Message, Agent, ID } from '../types';
import { MessageBubble } from './MessageBubble';
import { AgentPicker } from './AgentPicker';
import {
  AtSign, Slash, Paperclip, Send, Pin, Users, UserPlus,
  X, PanelRightOpen, PanelRightClose, CornerUpLeft, Layers, Bot,
} from './icons';

export function ChatWindow() {
  const activeId = useAppStore(s => s.activeConversationId);
  const conv = useAppStore(s =>
    s.activeConversationId ? s.conversations.find(c => c.id === s.activeConversationId) : null,
  );
  const messages = useAppStore(s =>
    s.activeConversationId ? s.messagesByConv[s.activeConversationId] ?? [] : [],
  );
  const agents = useAppStore(s => s.agents);
  const send = useAppStore(s => s.sendUserMessage);
  const slash = useAppStore(s => s.triggerSlash);
  const regen = useAppStore(s => s.regenerateLastAgentMessage);
  const distill = useAppStore(s => s.distillSkill);
  const artifacts = useAppStore(s => s.artifacts);
  const artifactPanelOpen = useAppStore(s => s.artifactPanelOpen);
  const setPanelOpen = useAppStore(s => s.setArtifactPanelOpen);
  const addAgent = useAppStore(s => s.addAgentToConversation);
  const removeAgent = useAppStore(s => s.removeAgentFromConversation);

  const [input, setInput] = useState('');
  const [mentions, setMentions] = useState<ID[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const agentById = useMemo(() => {
    const m: Record<string, Agent | undefined> = {};
    agents.forEach(a => (m[a.id] = a));
    return m;
  }, [agents]);

  const memberAgents = useMemo(
    () => (conv?.memberAgentIds ?? []).map(id => agentById[id]).filter(Boolean) as Agent[],
    [conv, agentById],
  );

  const convArtifactsCount = useMemo(
    () => (activeId ? artifacts.filter(a => a.conversationId === activeId).length : 0),
    [artifacts, activeId],
  );

  const pinned = (conv?.pinnedMessageIds ?? [])
    .map(id => messages.find(m => m.id === id))
    .filter(Boolean) as Message[];

  if (!conv || !activeId) {
    return (
      <div className="flex-1 flex items-center justify-center text-feishu-subtext">
        请选择一个对话
      </div>
    );
  }

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    const ms = mentions;
    setMentions([]);
    const replyId = replyTo?.id;
    setReplyTo(null);

    if (text.startsWith('/')) {
      await slash(activeId, text);
    } else {
      await send(activeId, text, ms, replyId);
    }
  };

  const insertMention = (a: Agent) => {
    setMentions(prev => prev.includes(a.id) ? prev : [...prev, a.id]);
    setInput(prev => `${prev}@${a.name} `);
    setShowMentionPicker(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col bg-feishu-bg min-w-0">
      {/* Header */}
      <div className="h-14 px-5 border-b border-feishu-border bg-feishu-panel flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {conv.type === 'group' ? (
            <div className="w-7 h-7 rounded-md bg-feishu-bg border border-feishu-border flex items-center justify-center">
              <Users size={14} className="text-feishu-subtext" />
            </div>
          ) : (
            <div className={`w-7 h-7 rounded-md flex items-center justify-center text-sm ${memberAgents[0]?.avatarColor ?? 'bg-feishu-bg'}`}>
              {memberAgents[0]?.avatarEmoji ?? '🤖'}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-feishu-text truncate">{conv.title}</div>
            <div className="text-[11px] text-feishu-subtext truncate">
              {memberAgents.length} 成员 · {memberAgents.map(a => a.name).join(' / ')}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowMembers(v => !v)}
          className="px-2.5 py-1 text-xs hover:bg-feishu-hover rounded-md text-feishu-subtext hover:text-feishu-text flex items-center gap-1 transition"
        >
          <UserPlus size={13} /> 成员
        </button>
        <button
          onClick={() => setPanelOpen(!artifactPanelOpen)}
          className={`px-2.5 py-1 text-xs rounded-md flex items-center gap-1 transition ${
            artifactPanelOpen ? 'bg-feishu-accent/10 text-feishu-accent' : 'hover:bg-feishu-hover text-feishu-subtext hover:text-feishu-text'
          }`}
        >
          {artifactPanelOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
          产物 ({convArtifactsCount})
        </button>
      </div>

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="border-b border-feishu-border bg-amber-50/60 px-5 py-2 flex items-start gap-2 shrink-0">
          <Pin size={12} className="text-amber-500 mt-1 shrink-0" />
          <div className="flex-1 text-xs text-feishu-text space-y-1">
            {pinned.map(p => (
              <div key={p.id} className="truncate">
                <span className="font-medium">{p.senderType === 'user' ? '我' : agentById[p.senderId]?.name}：</span>
                {p.content.kind === 'text' ? p.content.text : `[${p.content.kind}]`}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members panel */}
      {showMembers && (
        <div className="border-b border-feishu-border bg-feishu-panel px-5 py-3 shrink-0 animate-slideIn">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-feishu-text">群成员</div>
            <button onClick={() => setShowMembers(false)} className="text-feishu-subtext hover:text-feishu-text">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {memberAgents.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 bg-feishu-bg rounded-md text-xs">
                <span>{a.avatarEmoji}</span>
                <span>{a.name}</span>
                {a.id !== 'agent_orchestrator' && conv.type === 'group' && (
                  <button
                    onClick={() => removeAgent(conv.id, a.id)}
                    className="text-feishu-subtext hover:text-red-500 ml-1"
                  ><X size={11} /></button>
                )}
              </div>
            ))}
            <button
              onClick={() => setShowAgentPicker(true)}
              className="px-2 py-1 text-xs border border-dashed border-feishu-border rounded-md hover:bg-feishu-hover text-feishu-subtext hover:text-feishu-text transition flex items-center gap-1"
            >
              <UserPlus size={11} /> 拉人入群
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        {messages.map((m, idx) => {
          const prev = messages[idx - 1];
          const showAvatar =
            !prev ||
            prev.senderId !== m.senderId ||
            prev.senderType !== m.senderType ||
            m.createdAt - prev.createdAt > 60_000;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              agentById={agentById}
              showAvatar={showAvatar}
              onReply={setReplyTo}
              onRegenerate={() => {
                if (m.senderType === 'agent') regen(activeId, m.senderId);
              }}
              onDistillSkill={() => {
                const name = window.prompt('给这条 Skill 起个名字：', '一段经验');
                if (!name) return;
                distill({
                  name,
                  trigger: '由 Agent 消息自动沉淀',
                  description:
                    m.content.kind === 'text'
                      ? m.content.text.slice(0, 200)
                      : `[${m.content.kind}]`,
                  steps: ['查看这条消息', '应用其中的方法到当前任务'],
                  conversationId: activeId,
                });
                alert('✅ 已沉淀为 Skill');
              }}
            />
          );
        })}
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-feishu-subtext text-sm">
            还没有消息，开始对话吧
          </div>
        )}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="px-5 py-2 border-t border-feishu-border bg-feishu-panel flex items-center gap-2 shrink-0">
          <CornerUpLeft size={12} className="text-feishu-subtext shrink-0" />
          <div className="text-xs text-feishu-subtext truncate flex-1">
            引用 {replyTo.senderType === 'user' ? '我' : agentById[replyTo.senderId]?.name}：
            {replyTo.content.kind === 'text' ? replyTo.content.text : `[${replyTo.content.kind}]`}
          </div>
          <button onClick={() => setReplyTo(null)} className="text-feishu-subtext hover:text-feishu-text">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="border-t border-feishu-border bg-feishu-panel p-3 shrink-0 relative"
      >
        {/* @ picker */}
        {showMentionPicker && (
          <div className="absolute bottom-full left-3 mb-2 bg-feishu-panel border border-feishu-border rounded-lg shadow-lg w-64 max-h-72 overflow-y-auto z-10">
            <div className="px-3 py-2 text-xs text-feishu-subtext border-b border-feishu-border">选择 @ 谁</div>
            {memberAgents.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => insertMention(a)}
                className="w-full text-left px-3 py-2 hover:bg-feishu-hover flex items-center gap-2"
              >
                <div className={`w-6 h-6 rounded ${a.avatarColor} flex items-center justify-center text-xs`}>{a.avatarEmoji}</div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-feishu-text">{a.name}</div>
                  <div className="text-[11px] text-feishu-subtext truncate">{a.tagline}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* mention chips */}
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {mentions.map(id => {
              const a = agentById[id];
              if (!a) return null;
              return (
                <span key={id} className="px-1.5 py-0.5 text-xs bg-feishu-mention text-feishu-text rounded flex items-center gap-1">
                  @{a.name}
                  <button
                    type="button"
                    onClick={() => setMentions(p => p.filter(x => x !== id))}
                    className="hover:text-red-500"
                  ><X size={10} /></button>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setShowMentionPicker(v => !v)}
              className="p-1.5 text-feishu-subtext hover:text-feishu-accent hover:bg-feishu-hover rounded-md transition"
              title="@ 提及"
            >
              <AtSign size={16} />
            </button>
            <button
              type="button"
              onClick={() => setInput(prev => prev + '/')}
              className="p-1.5 text-feishu-subtext hover:text-feishu-accent hover:bg-feishu-hover rounded-md transition"
              title="斜杠命令 /spec /skills /new-agent /deploy"
            >
              <Slash size={16} />
            </button>
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder={
              conv.type === 'group'
                ? '输入消息... @ 指定 Agent，或让 PMO 自动调度；/ 调出命令'
                : '输入消息... Shift+Enter 换行'
            }
            className="flex-1 px-3 py-2 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-2 rounded-md bg-feishu-accent text-white hover:opacity-90 disabled:opacity-40 transition flex items-center justify-center"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-1.5 text-[11px] text-feishu-subtext flex items-center gap-2">
          <span>Tips：</span>
          <kbd className="px-1 bg-feishu-bg rounded">/spec</kbd>
          <kbd className="px-1 bg-feishu-bg rounded">/skills</kbd>
          <kbd className="px-1 bg-feishu-bg rounded">/new-agent</kbd>
          <kbd className="px-1 bg-feishu-bg rounded">/deploy</kbd>
          <span>· @ 多个 Agent 由 PMO 自动调度</span>
        </div>
      </form>

      {showAgentPicker && (
        <AgentPicker
          onClose={() => setShowAgentPicker(false)}
          onPick={(a) => { addAgent(conv.id, a.id); setShowAgentPicker(false); }}
          excludeIds={conv.memberAgentIds}
        />
      )}
    </div>
  );
}
