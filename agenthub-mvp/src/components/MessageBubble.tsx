import type { Message, Agent } from '../types';
import { useAppStore } from '../store/appStore';
import { PlanCard } from './PlanCard';
import { ArtifactCard } from './ArtifactCard';
import { DiffCardInChat } from './DiffViewer';
import { DeployCard } from './DeployCard';
import {
  Copy, RefreshCw, CornerUpLeft, Pin, PinOff, Sparkles, Code2,
} from './icons';
import { useState } from 'react';

interface Props {
  message: Message;
  agentById: Record<string, Agent | undefined>;
  showAvatar: boolean;
  onReply: (m: Message) => void;
  onRegenerate: (m: Message) => void;
  onDistillSkill: (m: Message) => void;
}

export function MessageBubble({
  message: m,
  agentById,
  showAvatar,
  onReply,
  onRegenerate,
  onDistillSkill,
}: Props) {
  const togglePin = useAppStore(s => s.togglePinMessage);
  const isUser = m.senderType === 'user';
  const isSystem = m.senderType === 'system';
  const agent = m.senderType === 'agent' ? agentById[m.senderId] : undefined;

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center">
        <div className="text-[11px] text-feishu-subtext bg-feishu-bg px-3 py-1 rounded-full">
          {m.content.kind === 'system' ? m.content.text : ''}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex gap-3 px-4 py-2 hover:bg-feishu-hover/40 ${
        isUser ? 'flex-row-reverse' : ''
      } animate-slideIn`}
    >
      <div className="w-9 shrink-0">
        {showAvatar && (
          <Avatar
            colorClass={isUser ? 'bg-feishu-accent' : agent?.avatarColor ?? 'bg-feishu-bg'}
            emoji={isUser ? '🧑' : agent?.avatarEmoji ?? '🤖'}
          />
        )}
      </div>

      <div className={`min-w-0 max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {showAvatar && (
          <div className={`flex items-center gap-2 mb-1 text-xs ${isUser ? 'flex-row-reverse' : ''}`}>
            <span className="font-medium text-feishu-text">
              {isUser ? '我' : agent?.name ?? '?'}
            </span>
            <span className="text-feishu-subtext">{formatTime(m.createdAt)}</span>
            {m.pinned && <Pin size={11} className="text-amber-500" />}
            {m.streaming && (
              <span className="text-feishu-accent flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-feishu-accent animate-typing" />
                <span className="w-1 h-1 rounded-full bg-feishu-accent animate-typing" style={{ animationDelay: '0.2s' }} />
                <span className="w-1 h-1 rounded-full bg-feishu-accent animate-typing" style={{ animationDelay: '0.4s' }} />
              </span>
            )}
          </div>
        )}

        <div className={`relative ${isUser ? 'items-end' : 'items-start'}`}>
          <BubbleBody message={m} isUser={isUser} />
          {/* hover 操作 */}
          {!m.streaming && (
            <div
              className={`absolute ${
                isUser ? 'left-0 -translate-x-full pl-2' : 'right-0 translate-x-full pr-2'
              } top-0 hidden group-hover:flex flex-col gap-1`}
            >
              <ActionBtn title="引用" onClick={() => onReply(m)}><CornerUpLeft size={12} /></ActionBtn>
              {m.content.kind === 'text' && (
                <ActionBtn title="复制" onClick={() => navigator.clipboard.writeText(m.content.kind === 'text' ? m.content.text : '')}>
                  <Copy size={12} />
                </ActionBtn>
              )}
              {agent && (
                <ActionBtn title="重新生成" onClick={() => onRegenerate(m)}>
                  <RefreshCw size={12} />
                </ActionBtn>
              )}
              <ActionBtn title={m.pinned ? '取消 Pin' : 'Pin 到顶部'} onClick={() => togglePin(m.id)}>
                {m.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              </ActionBtn>
              {agent && (
                <ActionBtn title="沉淀为 Skill" onClick={() => onDistillSkill(m)}>
                  <Sparkles size={12} />
                </ActionBtn>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BubbleBody({ message: m, isUser }: { message: Message; isUser: boolean }) {
  const baseClass = `px-3.5 py-2 rounded-xl text-sm leading-relaxed break-words ${
    isUser
      ? 'bg-feishu-accent text-white rounded-tr-sm'
      : 'bg-feishu-panel border border-feishu-border rounded-tl-sm text-feishu-text'
  }`;

  switch (m.content.kind) {
    case 'text':
      return (
        <div className={baseClass}>
          <div className={`msg-text ${m.streaming ? 'typing-cursor' : ''}`}>
            {renderMarkdownLike(m.content.text)}
          </div>
        </div>
      );

    case 'code':
      return (
        <div className="rounded-xl overflow-hidden border border-feishu-border bg-[#1e1e2e] max-w-2xl">
          <div className="px-3 py-1.5 text-xs text-zinc-400 border-b border-zinc-700 flex items-center gap-2">
            <Code2 size={12} />
            <span>{m.content.filename ?? m.content.language}</span>
            <div className="flex-1" />
            <button
              onClick={() => navigator.clipboard.writeText(m.content.kind === 'code' ? m.content.code : '')}
              className="text-zinc-400 hover:text-zinc-200 transition"
              title="复制"
            >
              <Copy size={12} />
            </button>
          </div>
          <pre className="px-3 py-2 text-xs text-zinc-100 overflow-x-auto whitespace-pre">
            <code>{m.content.code}</code>
          </pre>
        </div>
      );

    case 'plan':
      return <PlanCard plan={m.content.plan} />;

    case 'artifact':
      return (
        <ArtifactCard
          artifactId={m.content.artifactId}
          versionId={m.content.versionId}
          title={m.content.title}
          preview={m.content.preview}
        />
      );

    case 'diff':
      return <DiffCardInChat diff={m.content.diff} />;

    case 'deploy':
      return <DeployCard deploy={m.content.deploy} />;

    default:
      return null;
  }
}

function Avatar({ colorClass, emoji }: { colorClass: string; emoji: string }) {
  return (
    <div className={`w-9 h-9 rounded-lg ${colorClass} flex items-center justify-center text-base shadow-sm`}>
      <span>{emoji}</span>
    </div>
  );
}

function ActionBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 rounded bg-feishu-panel border border-feishu-border hover:bg-feishu-hover text-feishu-subtext hover:text-feishu-text flex items-center justify-center transition"
    >
      {children}
    </button>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) { return String(n).padStart(2, '0'); }

/**
 * 极简 Markdown 渲染：粗体、行内代码、引用、列表、换行
 * 选这个手写：MVP 不引入 markdown 解析依赖，保持包大小
 */
function renderMarkdownLike(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^>\s?/.test(line)) {
      // 引用
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(<blockquote key={out.length}>{buf.map(inline)}</blockquote>);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={out.length}>
          {buf.map((b, k) => <li key={k}>{inline(b, k)}</li>)}
        </ul>,
      );
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      const m = /^(#{1,6})\s+(.*)/.exec(line)!;
      const level = m[1].length;
      const Tag = (`h${Math.min(level + 2, 6)}`) as keyof JSX.IntrinsicElements;
      out.push(
        <Tag key={out.length} className="font-semibold mt-1 mb-1">
          {inline(m[2], 0)}
        </Tag>,
      );
      i++;
      continue;
    }
    out.push(<p key={out.length}>{inline(line, 0)}</p>);
    i++;
  }
  return <>{out}</>;
}

function inline(text: string, k: number = 0): React.ReactNode {
  // 粗体 **xx** 与行内代码 `xx`
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const piece = m[0];
    if (piece.startsWith('**')) {
      parts.push(<strong key={`${k}-b-${idx++}`}>{piece.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={`${k}-c-${idx++}`}>{piece.slice(1, -1)}</code>);
    }
    last = m.index + piece.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.length ? parts : text}</>;
}
