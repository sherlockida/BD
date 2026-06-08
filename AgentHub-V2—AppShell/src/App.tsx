import { useState, useCallback } from 'react';
import { CanvasView } from '@canvas/CanvasView';
import { BenchWall } from '@panels/BenchWall';
import { TimelineRail } from '@panels/TimelineRail';
import { CommandBar } from '@panels/CommandBar';
import { CommandPalette } from '@panels/CommandPalette';
import { TopBar } from './TopBar';
import { ClassicIMView } from './ClassicIMView';
import { Onboarding } from './Onboarding';

type ViewMode = 'canvas' | 'classic';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleSwitch = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  const handleCloseCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  const handleExecuteCommand = useCallback((_command: string, _args?: string) => {
    setCommandPaletteOpen(false);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      <TopBar
        view={viewMode}
        onSwitch={handleSwitch}
        onOpenCommandPalette={handleOpenCommandPalette}
      />

      <div className="flex-1 relative overflow-hidden">
        {/* Canvas mode — always mounted, visibility toggled */}
        <div
          className="absolute inset-0 flex flex-col"
          style={{ visibility: viewMode === 'canvas' ? 'visible' : 'hidden' }}
          aria-hidden={viewMode !== 'canvas'}
        >
          <div className="flex-1 flex min-h-0">
            <BenchWall
              agents={[]}
              onFocusAgent={() => {}}
              onAddAgent={() => {}}
              collapsed={false}
              onToggleCollapse={() => {}}
            />
            <div className="flex-1 min-w-0">
              <CanvasView />
            </div>
            <TimelineRail
              events={[]}
              onJumpToTime={() => {}}
              agentIds={[]}
            />
          </div>
          <CommandBar
            onSubmitOrder={() => {}}
            onSlashCommand={() => {}}
            onOpenCommandPalette={handleOpenCommandPalette}
          />
        </div>

        {/* Classic IM mode — always mounted, visibility toggled */}
        <div
          className="absolute inset-0"
          style={{ visibility: viewMode === 'classic' ? 'visible' : 'hidden' }}
          aria-hidden={viewMode !== 'classic'}
        >
          <ClassicIMView />
        </div>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={handleCloseCommandPalette}
        onExecute={handleExecuteCommand}
      />

      <Onboarding />
    </div>
  );
}
