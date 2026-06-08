type ViewMode = 'canvas' | 'classic';

interface TopBarProps {
  view: ViewMode;
  onSwitch: (mode: ViewMode) => void;
  onOpenCommandPalette: () => void;
}

export function TopBar({ view, onSwitch, onOpenCommandPalette }: TopBarProps) {
  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 shrink-0 z-10">
      {/* Left: Logo + Project */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
            A
          </div>
          <span className="font-semibold text-gray-800 text-sm">AgentHub Canvas</span>
        </div>
        <div className="h-4 w-px bg-gray-200" />
        <select className="text-xs text-gray-500 bg-transparent border-none outline-none cursor-pointer" aria-label="Select project">
          <option>Default Project</option>
        </select>
      </div>

      {/* Center: Segment control */}
      <div className="flex-1 flex justify-center">
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'canvas'}
            onClick={() => onSwitch('canvas')}
            className={`px-4 py-1.5 text-xs rounded-md font-medium transition-colors ${
              view === 'canvas'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Canvas
          </button>
          <button
            role="tab"
            aria-selected={view === 'classic'}
            onClick={() => onSwitch('classic')}
            className={`px-4 py-1.5 text-xs rounded-md font-medium transition-colors ${
              view === 'classic'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Classic IM
          </button>
        </div>
      </div>

      {/* Right: Command palette button + User avatar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenCommandPalette}
          className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-xs transition-colors"
          title="Command Palette (Cmd+K)"
          aria-label="Open command palette"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-medium">
          U
        </div>
      </div>
    </header>
  );
}
