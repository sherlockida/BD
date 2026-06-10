import { useEffect } from 'react';
import { Pin, PinOff, Pencil, Archive, ArchiveRestore, Trash2 } from './icons';

interface ConversationMenuProps {
  conversationId: string;
  isPinned: boolean;
  isArchived: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onPin: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ConversationMenu({
  conversationId: _cid,
  isPinned, isArchived, x, y,
  onClose, onPin, onRename, onArchive, onDelete,
}: ConversationMenuProps) {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 220);

  const items = [
    {
      label: isPinned ? '取消置顶' : '置顶',
      icon: isPinned ? PinOff : Pin,
      onClick: onPin,
    },
    {
      label: '重命名',
      icon: Pencil,
      onClick: onRename,
    },
    {
      label: isArchived ? '取消归档' : '归档',
      icon: isArchived ? ArchiveRestore : Archive,
      onClick: onArchive,
    },
  ];

  return (
    <div
      className="fixed z-50 bg-feishu-panel rounded-lg shadow-lg border border-feishu-border py-1 min-w-[150px]"
      style={{ left: adjustedX, top: adjustedY }}
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); item.onClick(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-feishu-text hover:bg-feishu-hover transition text-left"
          >
            <Icon size={14} className="text-feishu-subtext shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
      <div className="border-t border-feishu-border my-1" />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition text-left"
      >
        <Trash2 size={14} className="shrink-0" />
        <span>删除对话</span>
      </button>
    </div>
  );
}
