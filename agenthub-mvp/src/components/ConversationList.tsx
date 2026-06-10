import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { Conversation } from '../types';
import { ConversationMenu } from './ConversationMenu';
import {
  MessageSquarePlus, Search, Hash, Bot, Pin, Archive, ArchiveRestore, Users, Sparkles, Ellipsis,
} from './icons';

export function ConversationList({ onNewChat }: { onNewChat: () => void }) {
  const conversations = useAppStore(s => s.conversations);
  const agents = useAppStore(s => s.agents);
  const activeId = useAppStore(s => s.activeConversationId);
  const setActive = useAppStore(s => s.setActiveConversation);
  const archive = useAppStore(s => s.archiveConversation);
  const pinConv = useAppStore(s => s.pinConversation);
  const renameConv = useAppStore(s => s.renameConversation);
  const deleteConv = useAppStore(s => s.deleteConversation);
  const openMarket = useAppStore(s => s.setAgentMarketOpen);
  const openSkills = useAppStore(s => s.setSkillsDrawerOpen);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [menuConvId, setMenuConvId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = conversations
    .filter(c => (showArchived ? c.archived : !c.archived))
    .filter(c => c.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastActivityAt - a.lastActivityAt;
    });

  const renderConv = (c: Conversation) => {
    const memberAgents = c.memberAgentIds
      .map(id => agents.find(a => a.id === id))
      .filter(Boolean) as typeof agents;
    const lead = memberAgents[c.type === 'group' ? 1 : 0] ?? memberAgents[0];
    return (
      <div
        key={c.id}
        onClick={() => setActive(c.id)}
        className={`group cursor-pointer px-3 py-2.5 mx-1.5 rounded-lg transition flex items-start gap-3 ${
          activeId === c.id ? 'bg-feishu-accent/10' : 'hover:bg-feishu-hover'
        }`}
      >
        {c.type === 'group' ? (
          <div className="relative w-9 h-9 rounded-lg bg-feishu-bg flex items-center justify-center text-base shrink-0 border border-feishu-border">
            <Users size={16} className="text-feishu-subtext" />
            <span className="absolute -bottom-1 -right-1 text-[10px] bg-feishu-accent text-white rounded-full w-4 h-4 flex items-center justify-center font-semibold">
              {c.memberAgentIds.length}
            </span>
          </div>
        ) : (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${lead?.avatarColor ?? 'bg-feishu-bg'}`}>
            <span>{lead?.avatarEmoji ?? '🤖'}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            {renamingId === c.id ? (
              <input
                value={renameText}
                onChange={e => setRenameText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { renameConv(c.id, renameText); setRenamingId(null); }
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onBlur={() => setRenamingId(null)}
                autoFocus
                className="font-medium text-sm bg-feishu-bg border border-feishu-accent rounded px-1.5 py-0.5 w-full outline-none"
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <div className="flex items-center gap-1 min-w-0">
                {c.pinned && <Pin size={10} className="text-feishu-accent shrink-0" />}
                <div className="font-medium text-sm truncate text-feishu-text">{c.title}</div>
              </div>
            )}
            <div className="text-[10px] text-feishu-subtext shrink-0 ml-2">
              {formatTime(c.lastActivityAt)}
            </div>
          </div>
          <div className="text-xs text-feishu-subtext truncate mt-0.5 flex items-center gap-1">
            {c.type === 'group' ? <Hash size={11} /> : <Bot size={11} />}
            {memberAgents.map(a => a?.name).join(' · ')}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); archive(c.id); }}
          className="opacity-0 group-hover:opacity-100 text-feishu-subtext hover:text-feishu-text transition"
          title={c.archived ? '取消归档' : '归档'}
        >
          {c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setMenuPos({ x: rect.left - 140, y: rect.bottom + 4 });
            setMenuConvId(menuConvId === c.id ? null : c.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-feishu-subtext hover:text-feishu-text transition"
          title="更多操作"
        >
          <Ellipsis size={14} />
        </button>
      </div>
    );
  };

  return (
    <div className="w-72 h-full flex flex-col bg-feishu-panel border-r border-feishu-border">
      <div className="px-4 pt-4 pb-3 border-b border-feishu-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-feishu-accent flex items-center justify-center text-white font-bold text-sm">A</div>
            <div className="font-semibold text-feishu-text">AgentHub</div>
          </div>
          <button
            onClick={onNewChat}
            className="p-1.5 hover:bg-feishu-hover rounded-md text-feishu-subtext hover:text-feishu-accent transition"
            title="新建对话"
          >
            <MessageSquarePlus size={18} />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-feishu-subtext" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索对话"
            className="w-full pl-8 pr-2 py-1.5 text-sm bg-feishu-bg border border-feishu-border rounded-md focus:outline-none focus:border-feishu-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {filtered.some(c => c.pinned) && (
          <div className="px-3 py-1 text-[10px] font-medium text-feishu-subtext/60 uppercase tracking-wider">
            置顶
          </div>
        )}
        {filtered.some(c => c.pinned) && filtered.some(c => !c.pinned) && (
          <div className="mx-3 my-1 border-t border-feishu-border/50" />
        )}
        {filtered.length === 0 && (
          <div className="text-center text-feishu-subtext text-xs py-12">
            还没有{showArchived ? '已归档' : ''}对话
          </div>
        )}
        {filtered.map(renderConv)}
      </div>

      <div className="border-t border-feishu-border p-2 flex items-center gap-1">
        <button
          onClick={() => openMarket(true)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 hover:bg-feishu-hover rounded-md text-feishu-subtext hover:text-feishu-text transition"
        >
          <Bot size={13} /> Agent 市场
        </button>
        <button
          onClick={() => openSkills(true)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 hover:bg-feishu-hover rounded-md text-feishu-subtext hover:text-feishu-text transition"
        >
          <Sparkles size={13} /> Skills
        </button>
        <button
          onClick={() => setShowArchived(v => !v)}
          className={`px-2 py-2 text-xs rounded-md transition ${
            showArchived ? 'bg-feishu-accent/10 text-feishu-accent' : 'hover:bg-feishu-hover text-feishu-subtext'
          }`}
          title="归档列表"
        >
          <Archive size={13} />
        </button>
      </div>
      {menuConvId && (() => {
        const c = conversations.find(x => x.id === menuConvId);
        if (!c) return null;
        return (
          <ConversationMenu
            conversationId={c.id}
            isPinned={!!c.pinned}
            isArchived={!!c.archived}
            x={menuPos.x}
            y={menuPos.y}
            onClose={() => setMenuConvId(null)}
            onPin={() => { pinConv(c.id); setMenuConvId(null); }}
            onRename={() => { setRenamingId(c.id); setRenameText(c.title); setMenuConvId(null); }}
            onArchive={() => { archive(c.id); setMenuConvId(null); }}
            onDelete={() => { setDeletingId(c.id); setMenuConvId(null); }}
          />
        );
      })()}

      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setDeletingId(null)}>
          <div className="bg-feishu-panel rounded-lg p-5 shadow-xl max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="font-medium text-feishu-text mb-2">删除对话</div>
            <div className="text-sm text-feishu-subtext mb-4">
              确定删除"{conversations.find(c => c.id === deletingId)?.title ?? ''}"？此操作不可撤销。
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingId(null)} className="px-3 py-1.5 text-sm text-feishu-subtext hover:text-feishu-text rounded-md hover:bg-feishu-hover">取消</button>
              <button onClick={() => { deleteConv(deletingId); setDeletingId(null); }} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600">删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number) {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
