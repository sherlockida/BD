import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../src/App';
import { TopBar } from '../src/TopBar';
import { Onboarding } from '../src/Onboarding';

// Mock v1.1 store and hooks
vi.mock('../../../agenthub-mvp/src/store/appStore', () => ({
  useAppStore: (selector: any) => {
    const state = {
      conversations: [],
      messagesByConv: {},
      agents: [],
      artifacts: [],
      skills: [],
      activeConversationId: null,
      activeArtifactId: null,
      artifactPanelOpen: false,
      agentMarketOpen: false,
      skillsDrawerOpen: false,
      newAgentModalOpen: false,
      newAgentPrefill: '',
      hydrateFromBackend: vi.fn().mockResolvedValue(undefined),
      createConversation: vi.fn(),
      setActiveConversation: vi.fn(),
      archiveConversation: vi.fn(),
      togglePinMessage: vi.fn(),
      setArtifactPanelOpen: vi.fn(),
      openArtifact: vi.fn(),
      setAgentMarketOpen: vi.fn(),
      setSkillsDrawerOpen: vi.fn(),
      setNewAgentModalOpen: vi.fn(),
      createCustomAgent: vi.fn(),
      addAgentToConversation: vi.fn(),
      removeAgentFromConversation: vi.fn(),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      regenerateLastAgentMessage: vi.fn().mockResolvedValue(undefined),
      triggerSlash: vi.fn().mockResolvedValue(undefined),
      rollbackArtifact: vi.fn(),
      applyDiff: vi.fn(),
      deployArtifact: vi.fn().mockResolvedValue(undefined),
      distillSkill: vi.fn(),
      removeSkill: vi.fn(),
      handleWSMessage: vi.fn(),
      handleWSArtifact: vi.fn(),
      handleWSDeployProgress: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../../agenthub-mvp/src/hooks/useAgentHubWS', () => ({
  useAgentHubWS: vi.fn(),
}));

// Mock child components from v1.1
vi.mock('../../../agenthub-mvp/src/components/ConversationList', () => ({
  ConversationList: ({ onNewChat }: any) => (
    <div data-testid="conversation-list">
      <button data-testid="new-chat-btn" onClick={onNewChat}>New Chat</button>
    </div>
  ),
}));

vi.mock('../../../agenthub-mvp/src/components/ChatWindow', () => ({
  ChatWindow: () => <div data-testid="chat-window">Chat Window</div>,
}));

vi.mock('../../../agenthub-mvp/src/components/ArtifactPanel', () => ({
  ArtifactPanel: () => <div data-testid="artifact-panel">Artifact Panel</div>,
}));

vi.mock('../../../agenthub-mvp/src/components/AgentMarket', () => ({
  AgentMarket: () => <div data-testid="agent-market">Agent Market</div>,
}));

vi.mock('../../../agenthub-mvp/src/components/SkillsDrawer', () => ({
  SkillsDrawer: () => <div data-testid="skills-drawer">Skills Drawer</div>,
}));

vi.mock('../../../agenthub-mvp/src/components/NewChatModal', () => ({
  NewChatModal: ({ onClose }: any) => (
    <div data-testid="new-chat-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('../../../agenthub-mvp/src/components/NewAgentModal', () => ({
  NewAgentModal: () => <div data-testid="new-agent-modal">New Agent Modal</div>,
}));

// Store localStorage state
function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
}

let localStorageMock: ReturnType<typeof createLocalStorageMock>;

describe('AppShell', () => {
  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('App', () => {
    it('renders Canvas mode by default', () => {
      render(<App />);
      expect(screen.getByTestId('canvas-view')).toBeDefined();
      expect(screen.getByTestId('bench-wall')).toBeDefined();
      expect(screen.getByTestId('timeline-rail')).toBeDefined();
      expect(screen.getByTestId('command-bar')).toBeDefined();
    });

    it('switches to Classic mode and shows ClassicIMView', () => {
      render(<App />);
      const classicBtn = screen.getByRole('tab', { name: 'Classic IM' });
      fireEvent.click(classicBtn);

      expect(screen.getByTestId('conversation-list')).toBeDefined();
      expect(screen.getByTestId('chat-window')).toBeDefined();
      expect(screen.getByTestId('artifact-panel')).toBeDefined();

      // Canvas view should still be in DOM (zero-white-screen switching)
      expect(screen.getByTestId('canvas-view')).toBeDefined();
    });
  });

  describe('TopBar', () => {
    it('renders two view toggle buttons', () => {
      const onSwitch = vi.fn();
      render(<TopBar view="canvas" onSwitch={onSwitch} onOpenCommandPalette={vi.fn()} />);

      expect(screen.getByRole('tab', { name: 'Canvas' })).toBeDefined();
      expect(screen.getByRole('tab', { name: 'Classic IM' })).toBeDefined();
    });

    it('calls onSwitch when toggling views', () => {
      const onSwitch = vi.fn();
      render(<TopBar view="canvas" onSwitch={onSwitch} onOpenCommandPalette={vi.fn()} />);

      fireEvent.click(screen.getByRole('tab', { name: 'Classic IM' }));
      expect(onSwitch).toHaveBeenCalledWith('classic');
    });
  });

  describe('Onboarding', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('renders on first visit when localStorage key is not set', () => {
      // Ensure localStorage.getItem returns null (first visit)
      localStorageMock.getItem.mockReturnValue(null);

      render(<Onboarding />);

      // Component uses setTimeout(300ms) before showing
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('onboarding-overlay')).toBeDefined();
      expect(screen.getByTestId('onboarding-card')).toBeDefined();
    });

    it('closes when Skip is clicked and writes localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null);

      render(<Onboarding />);

      // Advance timer to show onboarding
      act(() => {
        vi.advanceTimersByTime(300);
      });

      const skipBtn = screen.getByTestId('onboarding-skip');
      fireEvent.click(skipBtn);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('agenthub-v2-onboarding-done', 'true');
      expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
    });

    it('does not render when localStorage key is set', () => {
      localStorageMock.getItem.mockReturnValue('true');

      render(<Onboarding />);

      // No matter how much time passes, it shouldn't show
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
    });
  });
});
