import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CommandPaletteItem {
  id: string;
  label: string;
  command: string;
  args?: string;
  category?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onExecute: (command: string, args?: string) => void;
}

const DEFAULT_COMMANDS: CommandPaletteItem[] = [
  { id: 'new-order', label: 'New Order', command: 'new order', category: 'Orders' },
  { id: 'replay', label: 'Replay', command: 'replay', category: 'Canvas' },
  { id: 'find-artifact', label: 'Find Artifact', command: 'find artifact', category: 'Artifacts' },
  { id: 'deploy', label: 'Deploy', command: 'deploy', category: 'Actions' },
  { id: 'reset-canvas', label: 'Reset Canvas', command: 'reset canvas', category: 'Canvas' },
  { id: 'export', label: 'Export', command: 'export', category: 'Actions' },
];

export function CommandPalette({
  open,
  onClose,
  onExecute,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return DEFAULT_COMMANDS;
    const q = query.toLowerCase();
    return DEFAULT_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.command.toLowerCase().includes(q),
    );
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filtered.length - 1 ? prev + 1 : prev,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            onExecute(
              filtered[selectedIndex].command,
              filtered[selectedIndex].args,
            );
          }
          break;
      }
    },
    [filtered, selectedIndex, onClose, onExecute],
  );

  // Reset selection when query changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="relative w-[600px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
            data-testid="command-palette"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full text-sm outline-none placeholder-gray-400"
                placeholder="Type a command..."
              />
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">
                  No results
                </div>
              ) : (
                filtered.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => onExecute(item.command, item.args)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      idx === selectedIndex
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs text-gray-400 w-16 shrink-0">
                      {item.category}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {idx === selectedIndex && (
                      <kbd className="text-xs text-gray-400">Enter</kbd>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
