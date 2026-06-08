import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BenchWall, TimelineRail, CommandBar, CommandPalette } from '../src';

// ─────────────────────────────────────────────
// BenchWall
// ─────────────────────────────────────────────
describe('BenchWall', () => {
  const sampleAgents = [
    { id: 'a1', name: 'Alpha', avatarEmoji: '🤖', avatarColor: '#e8f5e9', online: true, status: 'idle' as const },
    { id: 'a2', name: 'Beta', avatarEmoji: '🧠', avatarColor: '#e3f2fd', online: false },
  ];

  it('renders agent list when expanded', () => {
    render(
      <BenchWall
        agents={sampleAgents}
        onFocusAgent={() => {}}
        onAddAgent={() => {}}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('calls onFocusAgent when an agent is clicked', () => {
    const onFocus = vi.fn();
    render(
      <BenchWall
        agents={sampleAgents}
        onFocusAgent={onFocus}
        onAddAgent={() => {}}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Alpha'));
    expect(onFocus).toHaveBeenCalledWith('a1');
  });

  it('hides agent names when collapsed', () => {
    const { rerender } = render(
      <BenchWall
        agents={sampleAgents}
        onFocusAgent={() => {}}
        onAddAgent={() => {}}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    // Expanded: name is visible in the agent list
    expect(screen.getByTestId('agent-name-a1')).toBeTruthy();

    rerender(
      <BenchWall
        agents={sampleAgents}
        onFocusAgent={() => {}}
        onAddAgent={() => {}}
        collapsed={true}
        onToggleCollapse={() => {}}
      />,
    );
    // Collapsed: name is no longer in the agent list (only in invisible tooltip)
    expect(screen.queryByTestId('agent-name-a1')).toBeNull();
  });

  it('calls onAddAgent when add button is clicked', () => {
    const onAdd = vi.fn();
    render(
      <BenchWall
        agents={sampleAgents}
        onFocusAgent={() => {}}
        onAddAgent={onAdd}
        collapsed={false}
        onToggleCollapse={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Add Agent'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('calls onToggleCollapse when collapse button is clicked', () => {
    const onToggle = vi.fn();
    render(
      <BenchWall
        agents={sampleAgents}
        onFocusAgent={() => {}}
        onAddAgent={() => {}}
        collapsed={false}
        onToggleCollapse={onToggle}
      />,
    );
    // The collapse button is the SVG with the polyline
    const buttons = screen.getAllByRole('button');
    const toggleBtn = buttons.find(
      (b) => b.getAttribute('title') === 'Collapse',
    );
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn!);
    expect(onToggle).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// TimelineRail
// ─────────────────────────────────────────────
describe('TimelineRail', () => {
  const sampleEvents = [
    { timestamp: 1000, agentId: 'a1', kind: 'thinking', summary: 'Analyzing data', status: 'thinking' },
    { timestamp: 2000, agentId: 'a2', kind: 'milestone', summary: 'Artifact created' },
  ];

  it('renders timeline header and events', () => {
    render(
      <TimelineRail
        events={sampleEvents}
        onJumpToTime={() => {}}
        agentIds={['a1', 'a2']}
      />,
    );
    expect(screen.getByText('Timeline')).toBeTruthy();
    expect(screen.getByTestId('timeline-event-0')).toBeTruthy();
    expect(screen.getByTestId('timeline-event-1')).toBeTruthy();
  });

  it('calls onJumpToTime when an event is clicked', () => {
    const onJump = vi.fn();
    render(
      <TimelineRail
        events={sampleEvents}
        onJumpToTime={onJump}
        agentIds={['a1', 'a2']}
      />,
    );
    fireEvent.click(screen.getByTestId('timeline-event-0'));
    expect(onJump).toHaveBeenCalledWith(1000);
  });

  it('shows empty state when no events', () => {
    render(
      <TimelineRail
        events={[]}
        onJumpToTime={() => {}}
        agentIds={['a1']}
      />,
    );
    expect(screen.getByText('No events')).toBeTruthy();
  });

  it('only renders events matching current agentIds', () => {
    render(
      <TimelineRail
        events={sampleEvents}
        onJumpToTime={() => {}}
        agentIds={['a1']}
      />,
    );
    // Only event for a1 should be rendered
    expect(screen.getByTestId('timeline-event-0')).toBeTruthy();
    expect(screen.queryByTestId('timeline-event-1')).toBeNull();
  });
});

// ─────────────────────────────────────────────
// CommandBar
// ─────────────────────────────────────────────
describe('CommandBar', () => {
  it('calls onSubmitOrder with text and empty mentions on Enter', () => {
    const onSubmit = vi.fn();
    render(
      <CommandBar
        onSubmitOrder={onSubmit}
        onSlashCommand={() => {}}
        onOpenCommandPalette={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/输入需求/);
    fireEvent.change(input, { target: { value: 'hello world' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('hello world', []);
  });

  it('calls onSubmitOrder with parsed mentions', () => {
    const onSubmit = vi.fn();
    render(
      <CommandBar
        onSubmitOrder={onSubmit}
        onSlashCommand={() => {}}
        onOpenCommandPalette={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/输入需求/);
    fireEvent.change(input, { target: { value: 'deploy @agent1 @agent2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('deploy @agent1 @agent2', ['agent1', 'agent2']);
  });

  it('calls onSlashCommand for /spec', () => {
    const onSlash = vi.fn();
    render(
      <CommandBar
        onSubmitOrder={() => {}}
        onSlashCommand={onSlash}
        onOpenCommandPalette={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/输入需求/);
    fireEvent.change(input, { target: { value: '/spec' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSlash).toHaveBeenCalledWith('spec');
  });

  it('calls onSlashCommand for other slash commands', () => {
    const onSlash = vi.fn();
    render(
      <CommandBar
        onSubmitOrder={() => {}}
        onSlashCommand={onSlash}
        onOpenCommandPalette={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/输入需求/);
    fireEvent.change(input, { target: { value: '/plan' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSlash).toHaveBeenCalledWith('plan');
  });

  it('calls onOpenCommandPalette when ⌘K button is clicked', () => {
    const onOpen = vi.fn();
    render(
      <CommandBar
        onSubmitOrder={() => {}}
        onSlashCommand={() => {}}
        onOpenCommandPalette={onOpen}
      />,
    );
    // The ⌘K button is the one containing the kbd element
    const kbd = screen.getByText('⌘K');
    fireEvent.click(kbd.closest('button')!);
    expect(onOpen).toHaveBeenCalled();
  });

  it('clears input after Enter', () => {
    const onSubmit = vi.fn();
    render(
      <CommandBar
        onSubmitOrder={onSubmit}
        onSlashCommand={() => {}}
        onOpenCommandPalette={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/输入需求/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });
});

// ─────────────────────────────────────────────
// CommandPalette
// ─────────────────────────────────────────────
describe('CommandPalette', () => {
  it('renders commands when open', () => {
    render(
      <CommandPalette
        open={true}
        onClose={() => {}}
        onExecute={() => {}}
      />,
    );
    expect(screen.getByText('New Order')).toBeTruthy();
    expect(screen.getByText('Replay')).toBeTruthy();
  });

  it('does NOT render when closed', () => {
    render(
      <CommandPalette
        open={false}
        onClose={() => {}}
        onExecute={() => {}}
      />,
    );
    expect(screen.queryByText('New Order')).toBeNull();
  });

  it('filters commands based on search query', () => {
    render(
      <CommandPalette
        open={true}
        onClose={() => {}}
        onExecute={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText('Type a command...');
    // Initially all commands visible
    expect(screen.getByText('New Order')).toBeTruthy();

    // Type 'deploy'
    fireEvent.change(input, { target: { value: 'deploy' } });
    expect(screen.getByText('Deploy')).toBeTruthy();
    expect(screen.queryByText('New Order')).toBeNull();
  });

  it('shows no-results when nothing matches', () => {
    render(
      <CommandPalette
        open={true}
        onClose={() => {}}
        onExecute={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText('Type a command...');
    fireEvent.change(input, { target: { value: 'zzzznonexistent' } });
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <CommandPalette
        open={true}
        onClose={onClose}
        onExecute={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText('Type a command...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('executes command on Enter', () => {
    const onExec = vi.fn();
    render(
      <CommandPalette
        open={true}
        onClose={() => {}}
        onExecute={onExec}
      />,
    );
    const input = screen.getByPlaceholderText('Type a command...');
    // First command should be selected by default (selectedIndex=0)
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onExec).toHaveBeenCalledWith('new order', undefined);
  });

  it('navigates with arrow keys and executes selection', () => {
    const onExec = vi.fn();
    render(
      <CommandPalette
        open={true}
        onClose={() => {}}
        onExecute={onExec}
      />,
    );
    const input = screen.getByPlaceholderText('Type a command...');

    // ArrowDown twice: index 0 -> 1 -> 2
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Enter executes item at index 2
    fireEvent.keyDown(input, { key: 'Enter' });

    // Index 2 should be 'find-artifact' -> command 'find artifact'
    expect(onExec).toHaveBeenCalledWith('find artifact', undefined);
  });

  it('closes backdrop when clicking outside', () => {
    const onClose = vi.fn();
    render(
      <CommandPalette
        open={true}
        onClose={onClose}
        onExecute={() => {}}
      />,
    );
    // Click the backdrop (the first motion.div with fixed inset-0)
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });
});
