import React, { useState, useCallback } from 'react';

export interface CommandBarProps {
  onSubmitOrder: (text: string, mentions: string[]) => void;
  onSlashCommand: (command: string) => void;
  onOpenCommandPalette: () => void;
}

export function CommandBar({
  onSubmitOrder,
  onSlashCommand,
  onOpenCommandPalette,
}: CommandBarProps) {
  const [value, setValue] = useState('');

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && value.trim()) {
        const trimmed = value.trim();

        // Slash command
        if (trimmed.startsWith('/')) {
          const cmd = trimmed.slice(1).split(' ')[0];
          onSlashCommand(cmd);
          setValue('');
          return;
        }

        // Parse @mentions
        const mentionRegex = /@(\w+)/g;
        const mentions: string[] = [];
        let match;
        while ((match = mentionRegex.exec(trimmed)) !== null) {
          mentions.push(match[1]);
        }

        onSubmitOrder(trimmed, mentions);
        setValue('');
      }
    },
    [value, onSubmitOrder, onSlashCommand],
  );

  return (
    <div
      className="h-12 bg-white border-t border-gray-200 flex items-center px-4 shrink-0"
      data-testid="command-bar"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入需求"
        className="flex-1 text-sm outline-none placeholder-gray-400 bg-transparent"
      />
      <button
        onClick={onOpenCommandPalette}
        className="ml-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-xs text-gray-400"
      >
        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
          {'⌘'}K
        </kbd>
      </button>
    </div>
  );
}
